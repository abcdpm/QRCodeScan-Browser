/**
 * 结果渲染（popup 与结果窗口共用）。
 * 安全约束：解码文本是不可信输入，一律用 textContent/createElement，绝不 innerHTML。
 */
import type { DecodeItem, DecodeOutcome } from "./types.ts";
import { asSingleLink, linkify } from "./links.ts";

export interface RenderOptions {
  /** 点击"打开链接"时的处理（默认 window.open） */
  onOpenLink?: (href: string) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderTextWithLinks(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const seg of linkify(text)) {
    if (seg.type === "text") {
      frag.appendChild(document.createTextNode(seg.value));
    } else {
      const a = el("a", "qr-link", seg.value);
      a.href = seg.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = "点击跳转";
      frag.appendChild(a);
    }
  }
  return frag;
}

function renderCard(item: DecodeItem, options: RenderOptions): HTMLElement {
  const card = el("div", "card");
  const meta = el("div", "card-meta");
  meta.appendChild(el("span", "badge", item.format === "QRCode" ? "二维码" : item.format));
  const lineCount = item.text.split("\n").length;
  if (lineCount > 1) meta.appendChild(el("span", "badge badge-muted", `${lineCount} 行`));
  card.appendChild(meta);

  const text = el("div", "card-text");
  text.appendChild(renderTextWithLinks(item.text));
  card.appendChild(text);

  const actions = el("div", "card-actions");
  const copyBtn = el("button", "btn", "复制");
  copyBtn.type = "button";
  copyBtn.addEventListener("click", () => {
    void navigator.clipboard.writeText(item.text).then(() => {
      copyBtn.textContent = "已复制 ✓";
      setTimeout(() => (copyBtn.textContent = "复制"), 1500);
    });
  });
  actions.appendChild(copyBtn);

  const href = asSingleLink(item.text);
  if (href) {
    const openBtn = el("button", "btn btn-primary", "打开链接");
    openBtn.type = "button";
    openBtn.addEventListener("click", () => {
      if (options.onOpenLink) options.onOpenLink(href);
      else window.open(href, "_blank", "noopener");
    });
    actions.appendChild(openBtn);
  }
  card.appendChild(actions);
  return card;
}

/** 渲染完整结果 */
export function renderOutcome(
  container: HTMLElement,
  outcome: DecodeOutcome,
  options: RenderOptions = {},
): void {
  container.replaceChildren();
  if (outcome.ok) {
    const list = el("div", "card-list");
    for (const item of outcome.items) list.appendChild(renderCard(item, options));
    container.appendChild(list);
    return;
  }

  const panel = el("div", "error-panel");
  panel.appendChild(el("h2", "error-title", "未识别到二维码"));
  if (outcome.error) panel.appendChild(el("p", "error-detail", outcome.error));

  const tips = el("ul", "tips");
  for (const tip of [
    "尽量使用原始清晰图片，避免缩略图",
    "把二维码区域裁剪出来，减少背景干扰",
    "截图/翻拍时避免反光、透视变形过大",
    "一张图里有多个码时，可逐个裁剪解析",
  ]) {
    tips.appendChild(el("li", undefined, tip));
  }
  panel.appendChild(tips);
  container.appendChild(panel);
}

/** 渲染"解析中"状态 */
export function renderBusy(container: HTMLElement, message = "正在解析…"): void {
  container.replaceChildren(el("div", "status busy", message));
}

/** 渲染空闲提示 */
export function renderIdle(container: HTMLElement, message: string): void {
  container.replaceChildren(el("div", "status", message));
}
