import * as M from '../math/mat4.js';
import { meshShader, paintingShader, flatShader } from './shaders.js';

const SAMPLES = 4;            // MSAA, mostly so that the thin lines look clean
const SLOT = 256;             // minUniformBufferOffsetAlignment
const MAX_OBJECTS = 128;
const MAX_VIEWS = 2;
const FRAME_BYTES = 96;       // mat4 + 2 vec4
const OBJECT_BYTES = 144;     // 2 mat4 + vec4
const FLAT_STRIDE = 7;        // xyz rgba

export async function initGPU(canvas) {
  if (!navigator.gpu) throw new Error('WebGPU is not supported in this browser.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter found.');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  // Render through an sRGB view of the canvas so shader output (linear) is encoded correctly.
  const viewFormat = `${format}-srgb`;
  context.configure({ device, format, viewFormats: [viewFormat], alphaMode: 'opaque' });
  const info = adapter.info ?? {};
  const gpuName = [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') || 'unknown GPU';
  return { device, context, format, viewFormat, gpuName };
}

export class Renderer {
  constructor(gpu, paintingImage, paintingMesh, meshes) {
    this.gpu = gpu;
    const { device } = gpu;
    this.device = device;

    this.frameBuffer = device.createBuffer({ size: SLOT * MAX_VIEWS, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.objectBuffer = device.createBuffer({ size: SLOT * MAX_OBJECTS, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.frameData = new Float32Array((SLOT / 4) * MAX_VIEWS);
    this.objectData = new Float32Array((SLOT / 4) * MAX_OBJECTS);

    const uniformLayout = (visibility) => device.createBindGroupLayout({
      entries: [{ binding: 0, visibility, buffer: { type: 'uniform', hasDynamicOffset: true } }],
    });
    const both = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this.frameLayout = uniformLayout(both);
    this.objectLayout = uniformLayout(both);
    this.textureLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });

    this.frameGroup = device.createBindGroup({
      layout: this.frameLayout,
      entries: [{ binding: 0, resource: { buffer: this.frameBuffer, size: FRAME_BYTES } }],
    });
    this.objectGroup = device.createBindGroup({
      layout: this.objectLayout,
      entries: [{ binding: 0, resource: { buffer: this.objectBuffer, size: OBJECT_BYTES } }],
    });

    this.createPipelines();
    this.meshes = {};
    for (const [name, data] of Object.entries(meshes)) this.meshes[name] = this.upload(data);
    this.painting = this.upload(paintingMesh);
    this.createPaintingTexture(paintingImage);

    this.lineBuffer = null;
    this.triBuffer = null;
    this.axesBuffer = null;
    this.size = [0, 0];
  }

  createPipelines() {
    const { device } = this;
    const color = this.gpu.viewFormat;
    const depthStencil = (write) => ({ format: 'depth24plus', depthWriteEnabled: write, depthCompare: write ? 'less' : 'less-equal' });
    const blend = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    };
    const multisample = { count: SAMPLES };

    const meshModule = device.createShaderModule({ code: meshShader });
    this.meshPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.frameLayout, this.objectLayout] }),
      vertex: {
        module: meshModule, entryPoint: 'vs',
        buffers: [{ arrayStride: 24, attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
        ] }],
      },
      fragment: { module: meshModule, entryPoint: 'fs', targets: [{ format: color }] },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: depthStencil(true),
      multisample,
    });

    const paintModule = device.createShaderModule({ code: paintingShader });
    this.paintingPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.frameLayout, this.objectLayout, this.textureLayout] }),
      vertex: {
        module: paintModule, entryPoint: 'vs',
        buffers: [{ arrayStride: 20, attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x2' },
        ] }],
      },
      fragment: { module: paintModule, entryPoint: 'fs', targets: [{ format: color }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthStencil(true),
      multisample,
    });

    const flatModule = device.createShaderModule({ code: flatShader });
    const flat = (topology, onTop = false) => device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.frameLayout] }),
      vertex: {
        module: flatModule, entryPoint: 'vs',
        buffers: [{ arrayStride: FLAT_STRIDE * 4, attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x4' },
        ] }],
      },
      fragment: { module: flatModule, entryPoint: 'fs', targets: [{ format: color, blend }] },
      primitive: { topology, cullMode: 'none' },
      depthStencil: onTop ? { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' } : depthStencil(false),
      multisample,
    });
    this.linePipeline = flat('line-list');
    this.triPipeline = flat('triangle-list');
    this.overlayLinePipeline = flat('line-list', true);  // debug axes
  }

  upload({ vertices, indices }) {
    const vbuf = this.device.createBuffer({ size: vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(vbuf, 0, vertices);
    // writeBuffer needs a multiple of 4 bytes; Uint16 index arrays may be 2 bytes short.
    const padded = new Uint16Array(Math.ceil(indices.length / 2) * 2);
    padded.set(indices);
    const ibuf = this.device.createBuffer({ size: padded.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(ibuf, 0, padded);
    return { vbuf, ibuf, count: indices.length, vertexCount: vertices.length };
  }

  createPaintingTexture(image) {
    const { device } = this;
    const texture = device.createTexture({
      size: [image.width, image.height],
      format: 'rgba8unorm-srgb',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture({ source: image }, { texture }, [image.width, image.height]);
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.textureGroup = device.createBindGroup({
      layout: this.textureLayout,
      entries: [{ binding: 0, resource: sampler }, { binding: 1, resource: texture.createView() }],
    });
  }

  resize(width, height) {
    if (width === this.size[0] && height === this.size[1]) return;
    this.size = [width, height];
    this.msaaTexture?.destroy();
    this.depthTexture?.destroy();
    this.msaaTexture = this.device.createTexture({
      size: [width, height], sampleCount: SAMPLES, format: this.gpu.viewFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthTexture = this.device.createTexture({
      size: [width, height], sampleCount: SAMPLES, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  // Grow-only vertex buffer for the per-frame line / triangle data.
  writeDynamic(key, data) {
    const bytes = Math.max(data.byteLength, 4);
    if (!this[key] || this[key].size < bytes) {
      this[key]?.destroy();
      this[key] = this.device.createBuffer({ size: Math.max(bytes, 1 << 16) * 2, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    if (data.byteLength) this.device.queue.writeBuffer(this[key], 0, data);
  }

  /**
   * frame = {
   *   views:   [{ viewport: [x, y, w, h], viewProj, eye, lines, tris }]  (lines / tris = vertex counts to draw)
   *   items:   [{ mesh, model, color, emissive }]
   *   paintingModel, lightDir,
   *   lineData, triData, axesData: Float32Array (xyz rgba per vertex)
   * }
   * Returns the number of vertices submitted.
   */
  render(frame) {
    const { device } = this;
    const { views, items } = frame;

    views.forEach((view, i) => {
      const o = (SLOT / 4) * i;
      this.frameData.set(view.viewProj, o);
      this.frameData.set([...view.eye, 1], o + 16);
      this.frameData.set([...frame.lightDir, 0], o + 20);
    });
    device.queue.writeBuffer(this.frameBuffer, 0, this.frameData, 0, (SLOT / 4) * views.length);

    const all = [...items, { model: frame.paintingModel, color: [1, 1, 1] }];
    if (all.length > MAX_OBJECTS) throw new Error('too many objects');
    all.forEach((item, i) => {
      const o = (SLOT / 4) * i;
      this.objectData.set(item.model, o);
      this.objectData.set(M.normalMatrix(item.model), o + 16);
      this.objectData.set([...item.color, item.emissive ?? 0], o + 32);
    });
    device.queue.writeBuffer(this.objectBuffer, 0, this.objectData, 0, (SLOT / 4) * all.length);

    this.writeDynamic('lineBuffer', frame.lineData);
    this.writeDynamic('triBuffer', frame.triData);
    this.writeDynamic('axesBuffer', frame.axesData);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.msaaTexture.createView(),
        resolveTarget: this.gpu.context.getCurrentTexture().createView({ format: this.gpu.viewFormat }),
        clearValue: { r: 0.012, g: 0.012, b: 0.014, a: 1 },
        loadOp: 'clear',
        storeOp: 'discard',
      }],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    });

    let vertices = 0;
    views.forEach((view, v) => {
      const [x, y, w, h] = view.viewport;
      pass.setViewport(x, y, w, h, 0, 1);
      pass.setScissorRect(x, y, w, h);

      pass.setPipeline(this.meshPipeline);
      pass.setBindGroup(0, this.frameGroup, [v * SLOT]);
      items.forEach((item, i) => {
        const mesh = this.meshes[item.mesh];
        pass.setBindGroup(1, this.objectGroup, [i * SLOT]);
        pass.setVertexBuffer(0, mesh.vbuf);
        pass.setIndexBuffer(mesh.ibuf, 'uint16');
        pass.drawIndexed(mesh.count);
        vertices += mesh.count;
      });

      pass.setPipeline(this.paintingPipeline);
      pass.setBindGroup(0, this.frameGroup, [v * SLOT]);
      pass.setBindGroup(1, this.objectGroup, [items.length * SLOT]);
      pass.setBindGroup(2, this.textureGroup);
      pass.setVertexBuffer(0, this.painting.vbuf);
      pass.setIndexBuffer(this.painting.ibuf, 'uint16');
      pass.drawIndexed(this.painting.count);
      vertices += this.painting.count;

      if (view.tris > 0) {
        pass.setPipeline(this.triPipeline);
        pass.setBindGroup(0, this.frameGroup, [v * SLOT]);
        pass.setVertexBuffer(0, this.triBuffer);
        pass.draw(view.tris);
        vertices += view.tris;
      }
      if (view.lines > 0) {
        pass.setPipeline(this.linePipeline);
        pass.setBindGroup(0, this.frameGroup, [v * SLOT]);
        pass.setVertexBuffer(0, this.lineBuffer);
        pass.draw(view.lines);
        vertices += view.lines;
      }
      if (view.axes > 0) {
        pass.setPipeline(this.overlayLinePipeline);
        pass.setBindGroup(0, this.frameGroup, [v * SLOT]);
        pass.setVertexBuffer(0, this.axesBuffer);
        pass.draw(view.axes);
        vertices += view.axes;
      }
    });

    pass.end();
    device.queue.submit([encoder.finish()]);
    return vertices;
  }
}
