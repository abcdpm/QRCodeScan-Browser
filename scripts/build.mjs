/**
 * 构建脚本：
 *  - esbuild 打包 background / content / popup / result
 *  - 拷贝 manifest、HTML、CSS、zxing_reader.wasm、图标到 dist/
 *  - --test 时额外产出 tests/.build/（供 node --test 使用）
 */
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateIcons } from "./gen-icons.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const testBuild = join(root, "tests", ".build");

async function bundle(entry, outfile, format, outRoot) {
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: join(outRoot, outfile),
    bundle: true,
    format,
    target: "chrome110",
    logLevel: "warning",
  });
}

async function buildExtension() {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  await Promise.all([
    bundle("src/background/service-worker.ts", "background.js", "esm", dist),
    bundle("src/content/content.ts", "content.js", "iife", dist),
    bundle("src/popup/popup.ts", "popup/popup.js", "esm", dist),
    bundle("src/result/result.ts", "result/result.js", "esm", dist),
  ]);

  mkdirSync(join(dist, "popup"), { recursive: true });
  mkdirSync(join(dist, "result"), { recursive: true });
  mkdirSync(join(dist, "wasm"), { recursive: true });

  cpSync(join(root, "src/manifest.json"), join(dist, "manifest.json"));
  cpSync(join(root, "src/popup/popup.html"), join(dist, "popup/popup.html"));
  cpSync(join(root, "src/result/result.html"), join(dist, "result/result.html"));
  cpSync(join(root, "src/styles/ui.css"), join(dist, "popup/popup.css"));
  cpSync(join(root, "src/styles/ui.css"), join(dist, "result/result.css"));
  cpSync(
    join(root, "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm"),
    join(dist, "wasm/zxing_reader.wasm"),
  );
  generateIcons(join(dist, "icons"));

  console.log("✔ dist/ 扩展构建完成");
}

async function buildTests() {
  rmSync(testBuild, { recursive: true, force: true });
  mkdirSync(testBuild, { recursive: true });
  const entries = [
    ["src/decoder/decode.ts", "decode.mjs"],
    ["src/decoder/preprocess.ts", "preprocess.mjs"],
    ["src/shared/links.ts", "links.mjs"],
  ];
  for (const [entry, name] of entries) {
    await esbuild.build({
      entryPoints: [join(root, entry)],
      outfile: join(testBuild, name),
      bundle: true,
      format: "esm",
      platform: "neutral",
      logLevel: "warning",
    });
  }
  console.log("✔ tests/.build/ 测试构建完成");
}

const testOnly = process.argv.includes("--test");
if (!testOnly) await buildExtension();
await buildTests();
