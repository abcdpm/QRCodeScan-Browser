/**
 * 图像预处理工具 —— 纯函数、无 DOM 依赖（Node 可测试）。
 * 用于对"不清晰 / 不标准"的二维码做多轮预处理后再解码。
 */

export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

function makeImage(width: number, height: number): RgbaImage {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** 复制一份 */
export function cloneImage(img: RgbaImage): RgbaImage {
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
}

/** 灰度化（保留 RGBA 布局，alpha=255） */
export function toGrayscale(img: RgbaImage): RgbaImage {
  const out = makeImage(img.width, img.height);
  const src = img.data;
  const dst = out.data;
  for (let i = 0; i < src.length; i += 4) {
    const lum = Math.round(luminance(src[i], src[i + 1], src[i + 2]));
    dst[i] = dst[i + 1] = dst[i + 2] = lum;
    dst[i + 3] = 255;
  }
  return out;
}

/**
 * 对比度线性拉伸：按直方图去掉最低/最高各 2% 后拉满 0..255。
 * 对付"整体偏灰、对比度低"的图片。
 */
export function stretchContrast(img: RgbaImage): RgbaImage {
  const histogram = new Uint32Array(256);
  const src = img.data;
  const pixelCount = img.width * img.height;
  for (let i = 0; i < src.length; i += 4) {
    histogram[Math.round(luminance(src[i], src[i + 1], src[i + 2]))]++;
  }
  const lowCut = pixelCount * 0.02;
  const highCut = pixelCount * 0.98;
  let lo = 0;
  let hi = 255;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += histogram[v];
    if (acc >= lowCut) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += histogram[v];
    if (acc >= pixelCount - highCut) {
      hi = v;
      break;
    }
  }
  if (hi <= lo) return cloneImage(img);
  const scale = 255 / (hi - lo);
  const out = makeImage(img.width, img.height);
  for (let i = 0; i < src.length; i += 4) {
    const lum = Math.round(luminance(src[i], src[i + 1], src[i + 2]));
    const v = Math.max(0, Math.min(255, Math.round((lum - lo) * scale)));
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  return out;
}

/** 反色（应对"白码黑底"的反色二维码） */
export function invertColors(img: RgbaImage): RgbaImage {
  const out = makeImage(img.width, img.height);
  for (let i = 0; i < img.data.length; i += 4) {
    out.data[i] = 255 - img.data[i];
    out.data[i + 1] = 255 - img.data[i + 1];
    out.data[i + 2] = 255 - img.data[i + 2];
    out.data[i + 3] = 255;
  }
  return out;
}

/** Otsu 全局阈值二值化 */
export function binarizeOtsu(img: RgbaImage): RgbaImage {
  const histogram = new Uint32Array(256);
  const src = img.data;
  const pixelCount = img.width * img.height;
  for (let i = 0; i < src.length; i += 4) {
    histogram[Math.round(luminance(src[i], src[i + 1], src[i + 2]))]++;
  }
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * histogram[v];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let v = 0; v < 256; v++) {
    wB += histogram[v];
    if (wB === 0) continue;
    const wF = pixelCount - wB;
    if (wF === 0) break;
    sumB += v * histogram[v];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = v;
    }
  }
  const out = makeImage(img.width, img.height);
  for (let i = 0; i < src.length; i += 4) {
    const lum = Math.round(luminance(src[i], src[i + 1], src[i + 2]));
    const v = lum <= threshold ? 0 : 255;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  return out;
}

/** 双线性整数倍放大（factor >= 2），用于小图/模糊图 */
export function upscaleBilinear(img: RgbaImage, factor: number): RgbaImage {
  const f = Math.max(2, Math.floor(factor));
  const out = makeImage(img.width * f, img.height * f);
  const src = img.data;
  const dst = out.data;
  for (let y = 0; y < out.height; y++) {
    const sy = (y + 0.5) / f - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(img.height - 1, y0 + 1);
    const wy = sy - y0;
    for (let x = 0; x < out.width; x++) {
      const sx = (x + 0.5) / f - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(img.width - 1, x0 + 1);
      const wx = sx - x0;
      const i00 = (y0 * img.width + x0) * 4;
      const i01 = (y0 * img.width + x1) * 4;
      const i10 = (y1 * img.width + x0) * 4;
      const i11 = (y1 * img.width + x1) * 4;
      const di = (y * out.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c] * (1 - wx) + src[i01 + c] * wx;
        const bottom = src[i10 + c] * (1 - wx) + src[i11 + c] * wx;
        dst[di + c] = Math.round(top * (1 - wy) + bottom * wy);
      }
      dst[di + 3] = 255;
    }
  }
  return out;
}

/** 盒式整数倍缩小（box average），用于超大图防内存爆掉 */
export function downscaleBox(img: RgbaImage, factor: number): RgbaImage {
  const f = Math.max(2, Math.floor(factor));
  const out = makeImage(Math.max(1, Math.floor(img.width / f)), Math.max(1, Math.floor(img.height / f)));
  const src = img.data;
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = 0; dy < f; dy++) {
        const sy = y * f + dy;
        if (sy >= img.height) break;
        for (let dx = 0; dx < f; dx++) {
          const sx = x * f + dx;
          if (sx >= img.width) break;
          const si = (sy * img.width + sx) * 4;
          r += src[si];
          g += src[si + 1];
          b += src[si + 2];
          n++;
        }
      }
      const di = (y * out.width + x) * 4;
      out.data[di] = Math.round(r / n);
      out.data[di + 1] = Math.round(g / n);
      out.data[di + 2] = Math.round(b / n);
      out.data[di + 3] = 255;
    }
  }
  return out;
}

/** 轻锐化（unsharp 3x3），改善模糊边界 */
export function sharpen(img: RgbaImage): RgbaImage {
  const out = makeImage(img.width, img.height);
  const src = img.data;
  const dst = out.data;
  const w = img.width;
  const h = img.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4;
      const xm = Math.max(0, x - 1);
      const xp = Math.min(w - 1, x + 1);
      const ym = Math.max(0, y - 1);
      const yp = Math.min(h - 1, y + 1);
      for (let c = 0; c < 3; c++) {
        const center = src[di + c];
        const left = src[(y * w + xm) * 4 + c];
        const right = src[(y * w + xp) * 4 + c];
        const up = src[(ym * w + x) * 4 + c];
        const down = src[(yp * w + x) * 4 + c];
        dst[di + c] = Math.max(0, Math.min(255, Math.round(center * 5 - left - right - up - down)));
      }
      dst[di + 3] = 255;
    }
  }
  return out;
}

