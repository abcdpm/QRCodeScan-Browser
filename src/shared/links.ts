/**
 * 纯文本链接识别工具 —— 无任何平台依赖，可在 Node 中直接测试。
 * 目标：把解码文本中的 http(s) 链接识别出来，渲染成可点击超链接。
 */

export type TextSegment =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

/** 匹配 http(s):// 或独立的 www. 开头的 URL */
const URL_RE =
  /(?:https?:\/\/|www\.)[^\s<>"'。，；！？、（）【】`]+/gi;

/**
 * 判断单段文本是否是"整条都是链接"（用于一键打开）。
 * 返回规范化后的 href；不是链接则返回 null。
 */
export function asSingleLink(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    } catch {
      return null;
    }
    return null;
  }
  if (/^www\./i.test(trimmed)) {
    try {
      return new URL(`https://${trimmed}`).href;
    } catch {
      return null;
    }
  }
  return null;
}

/** 把文本切成「普通文本 / 链接」交替片段，供 UI 渲染超链接 */
export function linkify(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    const raw = match[0];
    // 去掉尾部可能被吞进来的标点
    const trimmedRaw = raw.replace(/[.,;:!?)\]}]+$/g, "");
    if (!trimmedRaw) continue;
    const href = /^www\./i.test(trimmedRaw)
      ? `https://${trimmedRaw}`
      : trimmedRaw;
    if (start > last) segments.push({ type: "text", value: text.slice(last, start) });
    segments.push({ type: "link", value: trimmedRaw, href });
    last = start + trimmedRaw.length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments.length ? segments : [{ type: "text", value: text }];
}
