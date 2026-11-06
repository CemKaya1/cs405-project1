// WGSL sources. Group 0 holds per-view data, group 1 per-object data.

const common = /* wgsl */ `
struct Frame {
  viewProj : mat4x4f,
  eye      : vec4f,
  lightDir : vec4f,   // direction the light travels, world space
};
struct Object {
  model     : mat4x4f,
  normalMat : mat4x4f,  // inverse-transpose of model (upper 3x3)
  color     : vec4f,    // rgb + emission
};
@group(0) @binding(0) var<uniform> frame : Frame;
`;

export const meshShader = /* wgsl */ `
${common}
@group(1) @binding(0) var<uniform> obj : Object;

struct VsOut {
  @builtin(position) pos : vec4f,
  @location(0) normal    : vec3f,
  @location(1) worldPos  : vec3f,
};

@vertex
fn vs(@location(0) position : vec3f, @location(1) normal : vec3f) -> VsOut {
  let world = obj.model * vec4f(position, 1.0);
  var out : VsOut;
  out.pos = frame.viewProj * world;
  out.worldPos = world.xyz;
  out.normal = (obj.normalMat * vec4f(normal, 0.0)).xyz;
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4f {
  let n = normalize(in.normal);
  let l = normalize(-frame.lightDir.xyz);
  let v = normalize(frame.eye.xyz - in.worldPos);
  let h = normalize(l + v);
  let diffuse = max(dot(n, l), 0.0);
  let specular = pow(max(dot(n, h), 0.0), 40.0) * 0.3 * step(0.0, diffuse);
  let emissive = obj.color.a;   // alpha is unused for opaque meshes, so it carries emission
  let ambient = 0.18;
  let c = obj.color.rgb * (ambient + 0.82 * diffuse + emissive) + vec3f(specular);
  return vec4f(c, 1.0);
}
`;

export const paintingShader = /* wgsl */ `
${common}
@group(1) @binding(0) var<uniform> obj : Object;
@group(2) @binding(0) var paintSampler : sampler;
@group(2) @binding(1) var paintTexture : texture_2d<f32>;

struct VsOut {
  @builtin(position) pos : vec4f,
  @location(0) uv        : vec2f,
};

@vertex
fn vs(@location(0) position : vec3f, @location(1) uv : vec2f) -> VsOut {
  var out : VsOut;
  out.pos = frame.viewProj * obj.model * vec4f(position, 1.0);
  out.uv = uv;
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4f {
  // The texture is rgba8unorm-srgb, so this sample is already linear.
  return vec4f(textureSample(paintTexture, paintSampler, in.uv).rgb, 1.0);
}
`;

// Used for lines (axes, frustum, control polygon) and for flat overlay triangles
// (curve ribbon, control-point markers). Vertices are already in world space.
export const flatShader = /* wgsl */ `
${common}
struct VsOut {
  @builtin(position) pos : vec4f,
  @location(0) color     : vec4f,
};

@vertex
fn vs(@location(0) position : vec3f, @location(1) color : vec4f) -> VsOut {
  var out : VsOut;
  out.pos = frame.viewProj * vec4f(position, 1.0);
  out.color = color;
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4f {
  return in.color;
}
`;
