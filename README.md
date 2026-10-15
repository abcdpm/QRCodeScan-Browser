# QRCodeScan-Browser

Chrome 浏览器扩展：右键网页图片（或拖入/粘贴/选择本地图片）快速把二维码解析成文字，**http(s) 链接自动变为可点击超链接**，一键跳转或复制。

- ✅ **纯本地解码**：图片不上传、不联网，隐私安全、离线可用
- ✅ **容错强**：针对不清晰 / 不标准的二维码（模糊、噪点、偏灰、倾斜、反色、小尺寸、一图多码）内置多轮预处理重试阶梯
- ✅ **零服务器**：不需要部署任何 API

## 安装

```bash
npm install
npm run build      # 产出 dist/
```

然后在 Chrome 中：

1. 打开 `chrome://extensions/`
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本项目的 `dist/` 目录

## 使用

| 入口 | 操作 | 场景 |
|---|---|---|
| **右键图片** | 在任意网页图片上右键 →「解析二维码」 | 最快的日常入口 |
| **工具栏弹窗** | 点扩展图标（或 <kbd>Alt</kbd>+<kbd>Q</kbd>） | 拖入图片 / <kbd>Ctrl</kbd>+<kbd>V</kbd> 粘贴截图 / 选择本地文件 |

结果面板：

- 解码文本可选中、**一键复制**
- 文本中的 **http(s) 链接自动渲染为可点击超链接**，并提供「打开链接」按钮（新标签页打开）
- 一张图含多个二维码时**全部列出**
- 识别失败时给出排查建议

## 对「不清晰 / 不标准」二维码的处理

解码引擎为 [zxing-wasm](https://github.com/Sec-ant/zxing-wasm)（ZXing-C++ 的 WebAssembly 版，业界最强开源二维码识别库之一），并内置**多轮重试阶梯**（任一轮成功即停止）：

| 轮次 | 预处理 | 二值化器 | 针对的问题 |
|---|---|---|---|
| 1–2 | 原图 | LocalAverage / GlobalHistogram | 清晰标准码（快路径） |
| 3 | 灰度化 | LocalAverage | 彩色二维码 |
| 4–5 | 灰度 + 对比度拉伸 | LocalAverage / GlobalHistogram | 偏灰、低对比度、光照不均 |
| 6 | 放大 2x + 锐化 | LocalAverage | 小尺寸、模糊 |
| 7–8 | Otsu 二值化 | LocalAverage / FixedThreshold | 严重噪点、渐变背景 |

同时全程启用 zxing 内建容错：`tryHarder`（多尺度）、`tryRotate`（任意角度倾斜/透视变形）、`tryInvert`（反色：白码黑底）、`tryDownscale`（超大图）。支持标准二维码、Micro QR、rMQR，一图多码。

## 常见问题

**Q：为什么不部署 API 来解码？**
二维码解码是纯图像算法，浏览器本地即可完成。本地解码 = 零延迟 + 零成本 + 图片不出本机。只有极端退化到本地多轮重试仍失败时，才值得考虑云端 Vision API 兜底（本项目未包含）。

**Q：为什么是扩展而不是油猴脚本？**
右键菜单、跨域图片取像素（防盗链/CDN 图）、本地 WASM 稳定加载、干净的结果面板，这四点都只有扩展能做到。

**Q：右键某些图片解析失败？**
部分站点用 CSS 背景图或懒加载，右键拿到的地址可能不是最终图片。可把图片另存 / 截图后，用工具栏弹窗（拖入或 <kbd>Ctrl</kbd>+<kbd>V</kbd>）解析。登录态图片已自动携带 Cookie 尝试下载。

**Q：快捷键怎么改？**
`chrome://extensions/shortcuts` 中修改「打开二维码解析面板」。

## 开发

```
src/
├── manifest.json            # MV3 manifest（含 wasm-unsafe-eval CSP）
├── background/service-worker.ts   # 右键菜单 → 取图源 → 打开结果窗口
├── content/content.ts       # 协助读取页面 blob: 图片
├── popup/                   # 工具栏弹窗（拖拽/粘贴/选文件）
├── result/                  # 右键解析的结果窗口
├── decoder/                 # 解码核心（zxing-wasm + 预处理重试阶梯，Node 可测）
│   ├── decode.ts
│   └── preprocess.ts        # 纯像素算法：灰度/对比度/二值化/放大/锐化/缩小
└── shared/                  # 消息协议、链接识别、解码编排、结果渲染
scripts/
├── build.mjs                # esbuild 打包 + 拷贝静态资源 + 图标
└── gen-icons.mjs            # 纯 Node 生成 PNG 图标（无第三方依赖）
tests/                       # node --test：单元测试 + 真实二维码退化回环测试
```

```bash
npm run build       # 构建扩展到 dist/
npm run typecheck   # tsc --noEmit
npm test            # 26 个测试：解码回环 + 模糊/噪声/低对比度/倾斜/反色等退化场景
npm run icons       # 重新生成图标
```

安全设计：解码文本视为不可信输入，结果渲染全程 `textContent`（防 XSS）；WASM 与所有代码打包在扩展内（无远程代码）；`manifest.json` 中 CSP 显式声明 `wasm-unsafe-eval`。

## License

MIT
