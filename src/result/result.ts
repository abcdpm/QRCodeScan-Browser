/**
 * 结果窗口：右键"解析二维码"后打开，读取后台暂存的载荷并解码展示。
 */
import { decodePayload } from "../shared/decode-runner.ts";
import { PENDING_DECODE_KEY, type DecodePayload } from "../shared/messages.ts";
import { renderOutcome } from "../shared/result-dom.ts";

const statusEl = document.getElementById("status") as HTMLDivElement;
const sourceEl = document.getElementById("source") as HTMLParagraphElement;
const resultEl = document.getElementById("result") as HTMLDivElement;

async function main(): Promise<void> {
  const stored = await chrome.storage.session.get(PENDING_DECODE_KEY);
  const payload = stored[PENDING_DECODE_KEY] as DecodePayload | undefined;

  if (!payload) {
    statusEl.textContent = "没有待解析的图片。请在网页图片上右键选择「解析二维码」。";
    return;
  }
  await chrome.storage.session.remove(PENDING_DECODE_KEY);

  if (payload.kind === "url") sourceEl.textContent = payload.url;
  else if (payload.kind === "error") sourceEl.textContent = "";
  else sourceEl.textContent = "所选图片";

  const outcome = await decodePayload(payload);
  statusEl.hidden = true;
  renderOutcome(resultEl, outcome, {
    onOpenLink: (href) => {
      void chrome.tabs.create({ url: href });
    },
  });
}

void main();
