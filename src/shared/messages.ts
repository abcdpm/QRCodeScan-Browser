/** background → result 页面传递的待解码载荷（存于 chrome.storage.session） */
export type DecodePayload =
  | { kind: "url"; url: string }
  | { kind: "dataUrl"; dataUrl: string }
  | { kind: "error"; message: string };

export const PENDING_DECODE_KEY = "pendingDecode";

/** background ↔ content script 消息 */
export interface FetchBlobMessage {
  type: "fetch-blob";
  url: string;
}

export interface FetchBlobResponse {
  dataUrl?: string;
  error?: string;
}
