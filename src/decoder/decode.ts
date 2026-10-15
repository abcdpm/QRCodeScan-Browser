/**
 * 二维码解码核心 —— 基于 zxing-wasm（ZXing-C++）。
 * 通过"多轮预处理 + 多种二值化"的重试阶梯，尽量啃下不清晰 / 不标准的二维码。
 * 本模块除 WASM 外无平台依赖，像素路径可在 Node 中测试。
 */
import {
  prepareZXingModule,
  readBarcodes,
  type ReadResult,
  type ReaderOptions,
} from "zxing-wasm/reader";
import {
  type RgbaImage,
  toGrayscale,
  stretchContrast,
  binarizeOtsu,
  upscaleBilinear,
  sharpen,
  downscaleBox,
} from "./preprocess.ts";

export interface QRDecodeResult {
  text: string;
  format: string;
}

/** 与 zxing-wasm 的 Binarizer 联合类型保持一致 */
type BinarizerName = "LocalAverage" | "GlobalHistogram" | "FixedThreshold" | "BoolCast";

/** 像素数安全上限（约 64MB RGBA 缓冲），超大截图先降采样防止内存爆掉 */
const MAX_PIXELS = 16_000_000;
/** 小于该像素数才做 2x 放大锐化（否则内存开销过大） */
const UPSCALE_PIXEL_LIMIT = 4_000_000;

let initPromise: Promise<void> | null = null;

/**
 * 初始化解码引擎（必须先调用一次）。
 * @param wasmBinary 本地 zxing_reader.wasm 的字节（扩展内由 chrome.runtime.getURL 获取）
 */
export function initDecoder(wasmBinary: ArrayBuffer | Uint8Array): Promise<void> {
  if (!initPromise) {
    initPromise = prepareZXingModule({
      overrides: { wasmBinary },
      fireImmediately: true,
    }).then(() => undefined);
  }
  return initPromise;
}

const BASE_OPTIONS: ReaderOptions = {
  formats: ["QRCode", "MicroQRCode", "RMQRCode"],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  maxNumberOfSymbols: 255,
  textMode: "Plain",
};

function toResults(raw: ReadResult[]): QRDecodeResult[] {
  return raw
    .filter((r) => r.isValid && r.text.length > 0)
    .map((r) => ({ text: r.text, format: r.format }));
}

function ensureInitialized(): void {
  if (!initPromise) {
    throw new Error("解码引擎尚未初始化（请先调用 initDecoder）");
  }
}

/**
 * 从原始像素解码（RGBA）。内置针对不清晰图片的重试阶梯：
 * 原图 → 灰度 → 对比度拉伸 → 放大锐化 → Otsu 二值化，配合多种二值化器。
 */
export async function decodeQRFromPixels(image: RgbaImage): Promise<QRDecodeResult[]> {
  ensureInitialized();

  // 超大图降采样到安全范围（一般二维码在降采样后仍可识别）
  let base = image;
  while (base.width * base.height > MAX_PIXELS) {
    base = downscaleBox(base, 2);
  }

  const gray = toGrayscale(base);
  const contrast = stretchContrast(gray);
  const pixelCount = base.width * base.height;
  const upscaled =
    pixelCount <= UPSCALE_PIXEL_LIMIT ? sharpen(upscaleBilinear(contrast, 2)) : contrast;
  const otsu = binarizeOtsu(contrast);

  const attempts: Array<{ img: RgbaImage; binarizer: BinarizerName }> = [
    { img: base, binarizer: "LocalAverage" },
    { img: base, binarizer: "GlobalHistogram" },
    { img: gray, binarizer: "LocalAverage" },
    { img: contrast, binarizer: "LocalAverage" },
    { img: contrast, binarizer: "GlobalHistogram" },
    { img: upscaled, binarizer: "LocalAverage" },
    { img: otsu, binarizer: "LocalAverage" },
    { img: otsu, binarizer: "FixedThreshold" },
  ];

  for (const attempt of attempts) {
    const raw = await readBarcodes(attempt.img as unknown as ImageData, {
      ...BASE_OPTIONS,
      binarizer: attempt.binarizer,
    });
    const results = toResults(raw);
    if (results.length > 0) return results;
  }
  return [];
}

/**
 * 直接从编码后的图片字节解码（PNG/JPEG/WebP 等，由 WASM 内置 stb_image 解码）。
 * 快路径：清晰图片通常一轮即中；失败后由调用方转像素阶梯兜底。
 */
export async function decodeQRFromEncoded(
  input: Blob | ArrayBuffer | Uint8Array,
): Promise<QRDecodeResult[]> {
  ensureInitialized();
  for (const binarizer of ["LocalAverage", "GlobalHistogram"] as const) {
    const raw = await readBarcodes(input, { ...BASE_OPTIONS, binarizer });
    const results = toResults(raw);
    if (results.length > 0) return results;
  }
  return [];
}
