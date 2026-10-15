import test from "node:test";
import assert from "node:assert/strict";
import { asSingleLink, linkify } from "./.build/links.mjs";

test("整条文本是 http 链接时识别为单链接", () => {
  assert.equal(asSingleLink("https://example.com/a?b=1"), "https://example.com/a?b=1");
  // URL 规范化会给无路径域名补 "/"
  assert.equal(asSingleLink("http://example.com"), "http://example.com/");
});

test("www 开头补全 https", () => {
  assert.equal(asSingleLink("www.example.com/x"), "https://www.example.com/x");
});

test("非链接文本返回 null", () => {
  assert.equal(asSingleLink("普通文本"), null);
  assert.equal(asSingleLink("包含 空格 的 https://example.com"), null);
  assert.equal(asSingleLink("ftp://example.com"), null);
  assert.equal(asSingleLink("这不是链接：你好"), null);
});

test("linkify 切分文本中的链接", () => {
  const segs = linkify("看这里 https://example.com 结束");
  assert.deepEqual(
    segs.map((s) => s.type),
    ["text", "link", "text"],
  );
  assert.equal(segs[1].href, "https://example.com");
  assert.equal(segs[0].value, "看这里 ");
  assert.equal(segs[2].value, " 结束");
});

test("linkify 识别多个链接与 www 形式", () => {
  const segs = linkify("a https://a.com b www.b.com c");
  const links = segs.filter((s) => s.type === "link");
  assert.equal(links.length, 2);
  assert.equal(links[0].href, "https://a.com");
  assert.equal(links[1].href, "https://www.b.com");
});

test("linkify 去掉 URL 尾部标点", () => {
  const segs = linkify("见 https://example.com/path。");
  const link = segs.find((s) => s.type === "link");
  assert.equal(link.value, "https://example.com/path");
  assert.equal(link.href, "https://example.com/path");
});

test("无链接文本原样返回", () => {
  assert.deepEqual(linkify("hello 世界"), [{ type: "text", value: "hello 世界" }]);
});
