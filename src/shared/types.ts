/** 一条解码结果 */
export interface DecodeItem {
  /** 解码出的文本 */
  text: string;
  /** 条码格式，如 "QRCode" */
  format: string;
}

/** 解码任务的最终结果 */
export interface DecodeOutcome {
  ok: boolean;
  items: DecodeItem[];
  /** 失败时的错误信息（面向用户，中文） */
  error?: string;
  /** 图片来源描述（URL 或 "粘贴的截图" 等） */
  sourceLabel: string;
}
