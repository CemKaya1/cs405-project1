// Colours are picked as sRGB hex codes but the shaders work in linear light
// (the render target is an -srgb view, so the GPU encodes on write).

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function srgb(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => toLinear(x / 255));
  return alpha === undefined ? rgb : [...rgb, alpha];
}
