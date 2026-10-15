/**
 * 后台服务：右键图片 → "解析二维码" → 打开结果窗口。
 * 不在 SW 内解码（WASM 放在扩展页面跑更稳），只负责取图源 + 转交结果窗口。
 */
import type { DecodePayload, FetchBlobResponse, FetchBlobMessage } from "../shared/messages.ts";
import { PENDING_DECODE_KEY } from "../shared/messages.ts";

const MENU_ID = "qrcodescan-decode-image";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "解析二维码",
    contexts: ["image"],
  });
});

async function openResultWindow(): Promise<void> {
  await chrome.windows.create({
    url: chrome.runtime.getURL("result/result.html"),
    type: "popup",
    width: 560,
    height: 480,
  });
}

async function buildPayload(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
): Promise<DecodePayload> {
  const srcUrl = info.srcUrl ?? "";
  if (!srcUrl) {
    return { kind: "error", message: "无法获取该图片的地址，请把图片另存或截图后用工具栏面板解析。" };
  }
  if (srcUrl.startsWith("data:")) {
    return { kind: "dataUrl", dataUrl: srcUrl };
  }
  if (srcUrl.startsWith("blob:")) {
    if (!tab?.id) return { kind: "error", message: "无法读取该图片（blob）。" };
    try {
      const resp = (await chrome.tabs.sendMessage(tab.id, {
        type: "fetch-blob",
        url: srcUrl,
      } satisfies FetchBlobMessage)) as FetchBlobResponse | undefined;
      if (resp?.dataUrl) return { kind: "dataUrl", dataUrl: resp.dataUrl };
      return {
        kind: "error",
        message: `无法读取该图片：${resp?.error ?? "页面未响应"}。可截图后用工具栏面板解析。`,
      };
    } catch {
      return { kind: "error", message: "无法读取该图片（blob）。可截图后用工具栏面板解析。" };
    }
  }
  return { kind: "url", url: srcUrl };
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void (async () => {
    if (info.menuItemId !== MENU_ID) return;
    const payload = await buildPayload(info, tab);
    await chrome.storage.session.set({ [PENDING_DECODE_KEY]: payload });
    await openResultWindow();
  })();
});
