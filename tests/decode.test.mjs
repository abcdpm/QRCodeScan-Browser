import test, { before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeQRFromEncoded,
  decodeQRFromPixels,
  initDecoder,
} from "./.build/decode.mjs";
import { invertColors } from "./.build/preprocess.mjs";
import { asSingleLink } from "./.build/links.mjs";
import {
  addNoise,
  boxBlur,
  drawSymbol,
  makeCanvas,
  makeQR,
  mapRange,
  rotateBilinear,
  symbolPixelSize,
} from "./helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

before(async () => {
  const wasm = readFileSync(
    join(root, "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm"),
  );
  await initDecoder(wasm);
});

const URL_TEXT = "https://example.com/qrcode?from=scan&id=42";

/** 把符号点阵摆到 420x420 画布中央 */
async function renderQR(text, { scale = 6, degrade = (img) => img, ecLevel = "H" } = {}) {
  const { symbol } = await makeQR(text, { scale: 2, ecLevel });
  const { width: sw, height: sh } = symbolPixelSize(symbol, scale);
  const canvas = makeCanvas(420, 420);
  drawSymbol(canvas, symbol, Math.floor((420 - sw) / 2), Math.floor((420 - sh) / 2), scale);
  return degrade(canvas);
}

function assertDecoded(results, expected) {
  assert.ok(results.length > 0, "应至少解出一个二维码");
  assert.equal(results[0].text, expected);
}

test("编码字节快路径回环（PNG blob）", async (t) => {
  const { pngBlob } = await makeQR(URL_TEXT);
  if (!pngBlob) return t.skip("Node 环境未产出 PNG Blob");
  const results = await decodeQRFromEncoded(pngBlob);
  assertDecoded(results, URL_TEXT);
});

test("像素回环（清晰标准码）", async () => {
  const img = await renderQR(URL_TEXT);
  assertDecoded(await decodeQRFromPixels(img), URL_TEXT);
});

test("中文文本回环", async () => {
  const text = "你好，二维码！https://example.cn/中文路径";
  const img = await renderQR(text);
  assertDecoded(await decodeQRFromPixels(img), text);
});

test("模糊图片仍可解（对焦不准）", async () => {
  const img = await renderQR(URL_TEXT, {
    degrade: (c) => boxBlur(boxBlur(c, 1), 1),
  });
  assertDecoded(await decodeQRFromPixels(img), URL_TEXT);
});

test("噪声图片仍可解（翻拍噪点）", async () => {
  const img = await renderQR(URL_TEXT, {
    degrade: (c) => addNoise(c, 28, 2026),
  });
  assertDecoded(await decodeQRFromPixels(img), URL_TEXT);
});

test("低对比度图片仍可解（偏灰）", async () => {
  const img = await renderQR(URL_TEXT, {
    degrade: (c) => mapRange(c, 55, 185),
  });
  assertDecoded(await decodeQRFromPixels(img), URL_TEXT);
});

test("倾斜 15 度仍可解", async () => {
  const img = await renderQR(URL_TEXT, {
    degrade: (c) => rotateBilinear(c, 15),
  });
  assertDecoded(await decodeQRFromPixels(img), URL_TEXT);
});

test("反色二维码（白码黑底）仍可解", async () => {
  const img = await renderQR(URL_TEXT, {
    degrade: (c) => invertColors(c),
  });
  assertDecoded(await decodeQRFromPixels(img), URL_TEXT);
});

test("小尺寸 + 模糊仍可解（走放大锐化阶梯）", async () => {
  const text = "https://example.com/small";
  const img = await renderQR(text, {
    scale: 3,
    degrade: (c) => boxBlur(c, 1),
  });
  assertDecoded(await decodeQRFromPixels(img), text);
});

test("一图多码全部解出", async () => {
  const textA = "https://example.com/a";
  const textB = "第二段文本：多码测试";
  const { symbol: sa } = await makeQR(textA, { scale: 2 });
  const { symbol: sb } = await makeQR(textB, { scale: 2 });
  const canvas = makeCanvas(700, 360);
  drawSymbol(canvas, sa, 30, 80, 5);
  drawSymbol(canvas, sb, 370, 80, 5);
  const results = await decodeQRFromPixels(canvas);
  const texts = results.map((r) => r.text).sort();
  assert.deepEqual(texts, [textA, textB].sort());
});

test("模糊 + 噪声 + 低对比度组合退化仍可解", async () => {
  const img = await renderQR(URL_TEXT, {
    degrade: (c) => mapRange(addNoise(boxBlur(boxBlur(c, 1), 1), 18, 7), 60, 180),
  });
  assertDecoded(await decodeQRFromPixels(img), URL_TEXT);
});

test("解出的 URL 会被识别为可点击链接", async () => {
  const img = await renderQR(URL_TEXT);
  const results = await decodeQRFromPixels(img);
  assert.equal(asSingleLink(results[0].text), URL_TEXT);
});
