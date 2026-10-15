import test from "node:test";
import assert from "node:assert/strict";
import {
  binarizeOtsu,
  downscaleBox,
  invertColors,
  sharpen,
  stretchContrast,
  toGrayscale,
  upscaleBilinear,
} from "./.build/preprocess.mjs";

function makeImage(width, height, fill = [10, 20, 30]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = 255;
  }
  return { data, width, height };
}

test("灰度化：RGB 转相同亮度值", () => {
  const img = makeImage(2, 1, [255, 0, 0]);
  const gray = toGrayscale(img);
  const lum = Math.round(0.299 * 255);
  assert.equal(gray.data[0], lum);
  assert.equal(gray.data[1], lum);
  assert.equal(gray.data[2], lum);
  assert.equal(gray.data[3], 255);
});

test("反色两次还原", () => {
  const img = makeImage(3, 3, [100, 150, 200]);
  const twice = invertColors(invertColors(img));
  assert.deepEqual([...twice.data], [...img.data]);
});

test("Otsu 二值化只输出 0/255", () => {
  const img = makeImage(10, 10);
  // 左半黑右半白
  for (let y = 0; y < 10; y++) {
    for (let x = 5; x < 10; x++) {
      const i = (y * 10 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 220;
    }
  }
  const bw = binarizeOtsu(img);
  const values = new Set();
  for (let i = 0; i < bw.data.length; i += 4) values.add(bw.data[i]);
  assert.ok(values.has(0) && values.has(255));
  assert.equal(values.size, 2);
});

test("对比度拉伸把灰图拉到全范围", () => {
  const img = makeImage(4, 4, [100, 100, 100]);
  // 一半亮一点，避免直方图单峰
  for (let y = 0; y < 4; y++) {
    for (let x = 2; x < 4; x++) {
      const i = (y * 4 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 120;
    }
  }
  const stretched = stretchContrast(img);
  let min = 255;
  let max = 0;
  for (let i = 0; i < stretched.data.length; i += 4) {
    min = Math.min(min, stretched.data[i]);
    max = Math.max(max, stretched.data[i]);
  }
  assert.ok(max - min > 200, `拉伸后范围应明显变大，实际 ${min}..${max}`);
});

test("双线性放大尺寸正确", () => {
  const img = makeImage(5, 7);
  const big = upscaleBilinear(img, 2);
  assert.equal(big.width, 10);
  assert.equal(big.height, 14);
  assert.equal(big.data.length, 10 * 14 * 4);
});

test("盒式缩小尺寸正确", () => {
  const img = makeImage(10, 10);
  const small = downscaleBox(img, 2);
  assert.equal(small.width, 5);
  assert.equal(small.height, 5);
});

test("锐化保持尺寸", () => {
  const img = makeImage(6, 6);
  const out = sharpen(img);
  assert.equal(out.width, 6);
  assert.equal(out.height, 6);
});
