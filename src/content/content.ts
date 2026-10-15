/**
 * 内容脚本：协助 background 读取页面内 blob: 图片（background 无法直接 fetch blob URL）。
 */
import type { FetchBlobMessage, FetchBlobResponse } from "../shared/messages.ts";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败"));
    reader.readAsDataURL(blob);
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as FetchBlobMessage;
  if (msg?.type !== "fetch-blob") return;
  void (async () => {
    try {
      const resp = await fetch(msg.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const dataUrl = await blobToDataUrl(await resp.blob());
      sendResponse({ dataUrl } satisfies FetchBlobResponse);
    } catch (e) {
      sendResponse({ error: e instanceof Error ? e.message : String(e) } satisfies FetchBlobResponse);
    }
  })();
  return true; // 异步 sendResponse
});
