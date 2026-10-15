/**
 * 工具栏弹窗：拖拽 / 粘贴截图 / 选择本地文件 → 本地解码 → 展示结果。
 */
import { decodeBlob } from "../shared/decode-runner.ts";
import { renderBusy, renderOutcome } from "../shared/result-dom.ts";

const dropzone = document.getElementById("dropzone") as HTMLDivElement;
const pickBtn = document.getElementById("pick-btn") as HTMLButtonElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const previewWrap = document.getElementById("preview-wrap") as HTMLDivElement;
const preview = document.getElementById("preview") as HTMLImageElement;
const resultEl = document.getElementById("result") as HTMLDivElement;

let previewUrl: string | null = null;

function showStatus(message: string): void {
  statusEl.textContent = message;
  statusEl.hidden = false;
}

function hideStatus(): void {
  statusEl.hidden = true;
}

async function handleFile(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) {
    showStatus("请选择图片文件");
    return;
  }
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  previewWrap.hidden = false;

  showStatus(`正在解析：${file.name}`);
  renderBusy(resultEl);
  const outcome = await decodeBlob(file, file.name);
  hideStatus();
  renderOutcome(resultEl, outcome, {
    onOpenLink: (href) => {
      void chrome.tabs.create({ url: href });
      window.close();
    },
  });
}

pickBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const files = Array.from(fileInput.files ?? []);
  void (files[0] ? handleFile(files[0]) : undefined);
  fileInput.value = "";
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
    f.type.startsWith("image/"),
  );
  void (files[0] ? handleFile(files[0]) : undefined);
});

document.addEventListener("paste", (e) => {
  const items = Array.from(e.clipboardData?.items ?? []);
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  const file = imageItem?.getAsFile();
  if (file) {
    e.preventDefault();
    void handleFile(file);
  }
});
