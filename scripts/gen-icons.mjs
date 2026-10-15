/**
 * 纯 Node 的 PNG 图标生成器（无第三方依赖）。
 * 画一个"蓝底白码"的二维码风格图标（三个定位角 + 伪随机数据模块）。
 * 用法：node scripts/gen-icons.mjs [输出目录]
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const GRID = 16;

function isWhiteModule(m, n) {
  const inTopLeft = m < 7 && n < 7;
  const inTopRight = m > 8 && n < 7;
  const inBottomLeft = m < 7 && n > 8;
  if (inTopLeft || inTopRight || inBottomLeft) {
    const lx = inTopRight ? m - 9 : m;
    const ly = inBottomLeft ? n - 9 : n;
    const d = Math.max(Math.abs(lx - 3), Math.abs(ly - 3));
    return d === 3 || d <= 1; // 外环 + 核心为白，中间环为底色
  }
  return (m * 31 + n * 17 + m * n * 7 + 5) % 7 < 2;
}

export function generateIcons(outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const size of [16, 48, 128]) {
    const rgba = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const m = Math.floor((x * GRID) / size);
        const n = Math.floor((y * GRID) / size);
        const white = isWhiteModule(m, n);
        const i = (y * size + x) * 4;
        if (white) {
          rgba[i] = 255;
          rgba[i + 1] = 255;
          rgba[i + 2] = 255;
        } else {
          rgba[i] = 26;
          rgba[i + 1] = 115;
          rgba[i + 2] = 232;
        }
        rgba[i + 3] = 255;
      }
    }
    writeFileSync(join(outDir, `icon${size}.png`), encodePng(size, size, rgba));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = process.argv[2] ?? join(fileURLToPath(import.meta.url), "../../dist/icons");
  generateIcons(outDir);
  console.log(`✔ 图标已生成：${outDir}`);
}
