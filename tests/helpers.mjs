/**
 * 测试辅助：用 zxing-wasm writer 生成真实二维码，模拟各种"不清晰/不标准"的退化。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let writerReady = null;

export function initWriter() {
  if (!writerReady) {
    const wasmBinary = readFileSync(
      join(root, "node_modules/zxing-wasm/dist/writer/zxing_writer.wasm"),
    );
    writerReady = prepareZXingModule({
      overrides: { wasmBinary },
      fireImmediately: true,
    }).then(() => undefined);
  }
  return writerReady;
}

/** 生成二维码，返回 PNG Blob 与符号点阵 */
export async function makeQR(text, { scale = 8, ecLevel = "H" } = {}) {
  await initWriter();
  const { image, error, symbol } = await writeBarcode(text, {
    format: "QRCode",
    scale,
    addQuietZones: true,
    options: `ecLevel=${ecLevel}`,
  });
  if (error) throw new Error(`生成二维码失败：${error}`);
  return { pngBlob: image, symbol };
}

/** 生成空白 RGBA 画布（默认白色） */
export function makeCanvas(width, height, bg = 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = bg;
    data[i + 3] = 255;
  }
  return { data, width, height };
}

/**
 * 把符号点阵画到画布上（scale = 每模块像素数）。
 * 自动检测点阵极性：二维码左上角模块必为深色。
 */
export function drawSymbol(target, symbol, x, y, scale) {
  const darkIsHigh = symbol.data[0] >= 128;
  for (let my = 0; my < symbol.height; my++) {
    for (let mx = 0; mx < symbol.width; mx++) {
      const v = symbol.data[my * symbol.width + mx];
      const dark = darkIsHigh ? v >= 128 : v < 128;
      if (!dark) continue;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const tx = x + mx * scale + px;
          const ty = y + my * scale + py;
          if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue;
          const i = (ty * target.width + tx) * 4;
          target.data[i] = target.data[i + 1] = target.data[i + 2] = 0;
        }
      }
    }
  }
  return target;
}

export function symbolPixelSize(symbol, scale) {
  return { width: symbol.width * scale, height: symbol.height * scale };
}

/** 盒式模糊 —— 模拟对焦不准 / 轻微晃动 */
export function boxBlur(img, radius = 1) {
  const { width: w, height: h, data: src } = img;
  const out = makeCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const i = (yy * w + xx) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out.data[o] = r / n;
      out.data[o + 1] = g / n;
      out.data[o + 2] = b / n;
    }
  }
  return out;
}

/** 随机噪声（确定性 LCG）—— 模拟翻拍噪点 */
export function addNoise(img, amplitude = 24, seed = 1234) {
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  const out = { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
  for (let i = 0; i < out.data.length; i += 4) {
    const delta = (rand() * 2 - 1) * amplitude;
    out.data[i] = img.data[i] + delta;
    out.data[i + 1] = img.data[i + 1] + delta;
    out.data[i + 2] = img.data[i + 2] + delta;
  }
  return out;
}

/** 对比度压缩到 [lo, hi] —— 模拟偏灰、低对比度 */
export function mapRange(img, lo, hi) {
  const out = { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
  const k = (hi - lo) / 255;
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = lo + img.data[i] * k;
    out.data[i + 1] = lo + img.data[i + 1] * k;
    out.data[i + 2] = lo + img.data[i + 2] * k;
  }
  return out;
}

/** 任意角度旋转（双线性采样，白色背景）—— 模拟倾斜 / 透视变形 */
export function rotateBilinear(img, deg) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const w = img.width;
  const h = img.height;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const out = makeCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = cos * dx + sin * dy + cx;
      const sy = -sin * dx + cos * dy + cy;
      if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const wx = sx - x0;
      const wy = sy - y0;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = img.data[(y0 * w + x0) * 4 + c] * (1 - wx) + img.data[(y0 * w + x1) * 4 + c] * wx;
        const bottom = img.data[(y1 * w + x0) * 4 + c] * (1 - wx) + img.data[(y1 * w + x1) * 4 + c] * wx;
        out.data[o + c] = top * (1 - wy) + bottom * wy;
      }
    }
  }
  return out;
}
