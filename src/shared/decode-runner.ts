/**
 * 解码编排层（浏览器）：加载本地 WASM 引擎 → 编码快路径 → 像素重试阶梯。
 */
import {
  initDecoder,
  decodeQRFromEncoded,
  decodeQRFromPixels,
} from "../decoder/decode.ts";
import { blobToRgba, dataUrlToBlob } from "./image.ts";
import type { DecodeItem, DecodeOutcome } from "./types.ts";
import type { DecodePayload } from "./messages.ts";

const WASM_PATH = "wasm/zxing_reader.wasm";

let engineLoader: Promise<void> | null = null;

function ensureDecoder(): Promise<void> {
  if (!engineLoader) {
    engineLoader = fetch(chrome.runtime.getURL(WASM_PATH))
      .then((r) => {
        if (!r.ok) throw new Error("无法加载本地解码引擎（wasm 文件缺失？）");
        return r.arrayBuffer();
      })
      .then((binary) => initDecoder(binary));
  }
  return engineLoader;
}

function toItems(results: Array<{ text: string; format: string }>): DecodeItem[] {
  return results.map((r) => ({ text: r.text, format: r.format }));
}

/** 解码一张图片（Blob），内置快路径 + 像素阶梯兜底 */
export async function decodeBlob(blob: Blob, sourceLabel: string): Promise<DecodeOutcome> {
  try {
    await ensureDecoder();
    let results = await decodeQRFromEncoded(blob);
    if (results.length === 0) {
      const pixels = await blobToRgba(blob);
      results = await decodeQRFromPixels(pixels);
    }
    if (results.length === 0) {
      return {
        ok: false,
        items: [],
        error: "未在图片中识别到二维码。可尝试更清晰的原图，或把二维码区域裁剪出来再试。",
        sourceLabel,
      };
    }
    return { ok: true, items: toItems(results), sourceLabel };
  } catch (e) {
    return {
      ok: false,
      items: [],
      error: `解析失败：${e instanceof Error ? e.message : String(e)}`,
      sourceLabel,
    };
  }
}

/** 解码右键菜单传来的载荷 */
export async function decodePayload(payload: DecodePayload): Promise<DecodeOutcome> {
  switch (payload.kind) {
    case "error":
      return { ok: false, items: [], error: payload.message, sourceLabel: "" };
    case "dataUrl":
      return decodeBlob(dataUrlToBlob(payload.dataUrl), "图片");
    case "url": {
      const label = payload.url;
      try {
        const resp = await fetch(payload.url, { credentials: "include" });
        if (!resp.ok) {
          return {
            ok: false,
            items: [],
            error: `图片下载失败（HTTP ${resp.status}）。可尝试把图片另存后用工具栏面板打开。`,
            sourceLabel: label,
          };
        }
        return decodeBlob(await resp.blob(), label);
      } catch {
        return {
          ok: false,
          items: [],
          error: "图片下载失败（可能是防盗链或跨域限制）。可把图片另存/截图后用工具栏面板打开。",
          sourceLabel: label,
        };
      }
    }
  }
}
