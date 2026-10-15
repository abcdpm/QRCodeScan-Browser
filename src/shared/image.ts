/**
 * 浏览器端图片加载工具（Blob / data URL → RGBA 像素）。
 * 仅在扩展页面 / popup 中使用；Node 测试不经过此模块。
 */
import type { RgbaImage } from "../decoder/preprocess.ts";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** data URL → Blob */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("无效的 data URL");
  const meta = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = (/^data:([^;,]*)/.exec(meta)?.[1] || "application/octet-stream");
  const isBase64 = /;base64$/i.test(meta);
  const bytes = isBase64
    ? base64ToBytes(body)
    : new TextEncoder().encode(decodeURIComponent(body));
  // 注：本项目中 bytes 均为精确分配的独立缓冲，可直接作为 BlobPart
  return new Blob([bytes.buffer as ArrayBuffer], { type: mime });
}

/** 图片字节 → RGBA 像素（用 OffscreenCanvas 光栅化） */
export async function blobToRgba(blob: Blob): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建画布上下文");
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
    };
  } finally {
    bitmap.close();
  }
}
