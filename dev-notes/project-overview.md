## 项目总体需求与技术路线

支持打开带密码的 PDF → 每页渲染为图片 → 图像处理（灰度/对比度/锐化/阈值/去噪）→ 将处理后的页面重新合成为一个单一的 PDF，且严格保持原始每页的页面尺寸（不改变 page size）。

---

## 两阶段落地计划

- 第一阶段（Node Web 原型，便于调参与验证）
  - Node 后端提供 API：打开/校验密码、渲染页面位图（PNG/JPEG）、应用图像处理、导出合并 PDF（保持原始页面尺寸）。
  - 轻量前端（Vite + React）：文件上传与密码输入、参数面板（DPI/对比度/阈值/锐化等）、双栏预览（原图 vs 处理后）、导出按钮。
  - 目标：在浏览器内快速预览与调参，确认处理链路与保真策略无误。
- 第二阶段（Electron 桌面应用，macOS/Windows）
  - 复用 Node 阶段的核心模块，转为 Electron 主进程/Worker 执行；通过 Preload 暴露受控 API 给渲染端。
  - 支持离线本地处理、批量任务队列、持久化导出；按平台要求进行代码签名与发布。

---

## 关键技术与库（已核验官方文档）

- MuPDF.js（WASM，Artifex 官方）：打开/校验密码、加载页面、渲染为位图、结构化文本抽取。
  - 文档与示例：
    - 打开/密码/加载/渲染/PNG 导出：参见安装与示例中的 toPixmap → asPNG（见“Render PDF Pages to PNG in Node.js”与“Convert Page to PNG Image”）。
    - 结构化文本：`page.toStructuredText().asText()`；`page.toStructuredText("preserve-whitespace").asJSON()`。
- sharp（Node 图像处理）：灰度、阈值、锐化、线性变换、伽马校正、raw 输入/输出。
- pdf-lib（生成 PDF）：`PDFDocument.create()` → `addPage([w_pt, h_pt])` → `embedPng` → `page.drawImage` → `save()`。

参考文档：

- MuPDF.js：
  - 渲染与 PNG 导出（Matrix.scale/ColorSpace.DeviceRGB/toPixmap/asPNG）[安装指南示例](https://github.com/artifexsoftware/mupdf.js/blob/master/INSTALL.md)
  - 密码 API（`needsPassword`/`authenticatePassword`）与页面加载（`loadPage`）[操作指南](https://github.com/artifexsoftware/mupdf.js/tree/master/docs/how-to-guide)
  - 结构化文本（`toStructuredText().asText()/asJSON()`）[Page 文档](https://github.com/artifexsoftware/mupdf.js/blob/master/docs/how-to-guide/page.rst)
  - 页面边界（`page.getBounds()`）[Page 文档](https://github.com/artifexsoftware/mupdf.js/blob/master/docs/how-to-guide/page.rst)
- sharp：`greyscale()`、`threshold()`、`sharpen()`、`linear()`、`gamma()`、`raw()` [API 文档](https://github.com/lovell/sharp/tree/main/docs/src/content/docs)
- pdf-lib：`PDFDocument.create()`、`addPage()`、`embedPng()`、`drawImage()`、`save()` [README](https://github.com/hopding/pdf-lib#readme)

---

## 保留原始页面尺寸（硬性约束）

- 渲染位图时仅改变像素密度（DPI），不改变“页面物理尺寸”（pt，1 pt = 1/72 inch）。
- 记录每页原始尺寸：由 `const [ulx, uly, lrx, lry] = page.getBounds()` 得到宽高 `w_pt = lrx - ulx`，`h_pt = lry - uly`。
- 典型缩放关系：设 `s = dpi / 72`，则 `w_px = floor(w_pt × s)`，`h_px = floor(h_pt × s)`；像素图按 (0,0) 对齐铺满整页。
- 导出阶段严格使用 `addPage([w_pt, h_pt])`，禁止再缩放页面尺寸；仅在渲染阶段通过 `Matrix.scale(dpi/72, dpi/72)` 控制分辨率。

---

## 架构分层（两阶段共用思路）

- 第一阶段（Web 原型）
  - Server（Node）：
    - PDF 打开/密码校验：MuPDF.js → `needsPassword()` / `authenticatePassword()`
    - 页面渲染：`page.toPixmap(mupdf.Matrix.scale(dpi/72, dpi/72), mupdf.ColorSpace.DeviceRGB, false, true).asPNG()`
    - 图像处理：sharp（灰度/阈值/锐化/线性/伽马/去噪等）
    - 合并导出：pdf-lib 按原始 `w_pt × h_pt` 建页，嵌入处理后位图
  - Client（React）：
    - 文件/密码输入、参数面板（DPI/对比度/阈值/锐化/去噪）
    - 预览区域（原图 vs 处理图并排）
    - 导出按钮（触发合并 PDF 下载）
- 第二阶段（Electron 桌面）
  - 主进程（Main）：文件选择、任务队列、渲染与处理调度、生成导出文件
  - 预加载（Preload）：受控暴露 IPC API（打开 PDF、渲染页、应用处理、导出 PDF）
  - 渲染端（Renderer）：UI 复用 Web 原型，集成本地文件对话框与进度反馈

---

## 数据流（保持 page size 的要点标注）

1. 读取 PDF（Buffer/路径）→ `mupdf.PDFDocument.openDocument(data, "application/pdf")`
2. 若 `document.needsPassword()` → `document.authenticatePassword(userPwd)`
3. 获取每页尺寸：`const [x0, y0, x1, y1] = page.getBounds()` → 记录 `w_pt = x1 - x0`、`h_pt = y1 - y0`
4. 渲染：`page.toPixmap(mupdf.Matrix.scale(dpi/72, dpi/72), mupdf.ColorSpace.DeviceRGB, false, true).asPNG()`（或输出 RGBA 原始数据）
5. 图像处理：sharp/raw 管线（灰度/对比度/阈值/锐化/去噪等）
6. 预览：返回小尺寸 PNG 给前端对照
7. 导出：按 `w_pt × h_pt` 新建 PDF 页面 → 嵌入处理后位图，像素与页面物理尺寸一一对应

---

## 关键 API（已按官方文档核验）

### 打开 & 密码（MuPDF.js）

```javascript
import * as fs from "node:fs";
import * as mupdf from "mupdf";

const data = fs.readFileSync("test.pdf");
const document = mupdf.PDFDocument.openDocument(data, "application/pdf");
if (document.needsPassword()) {
  const ok = document.authenticatePassword(userInputPwd);
}
```

### 渲染为图片（MuPDF.js）

```javascript
const page = document.loadPage(index);
const pixmap = page.toPixmap(
  mupdf.Matrix.scale(dpi / 72, dpi / 72),
  mupdf.ColorSpace.DeviceRGB,
  false,
  true
);
const pngBytes = pixmap.asPNG();
```

### 文本抽取（MuPDF.js）

```javascript
const text = page.toStructuredText().asText();
const sjson = page.toStructuredText("preserve-whitespace").asJSON();
```

### 合并导出 PDF（pdf-lib）

```javascript
import { PDFDocument } from "pdf-lib";

const pdfDoc = await PDFDocument.create();
for (const { w_pt, h_pt, imageBytes } of pages) {
  const page = pdfDoc.addPage([w_pt, h_pt]);
  const img = await pdfDoc.embedPng(imageBytes);
  page.drawImage(img, { x: 0, y: 0, width: w_pt, height: h_pt });
}
const outBytes = await pdfDoc.save();
```

### 图像处理（sharp）

```javascript
import sharp from "sharp";

const processed = await sharp(inputPngBytes)
  .greyscale() // 或 .gamma().greyscale()
  .threshold(128, { greyscale: true })
  .sharpen({ sigma: 2 })
  .linear(1.1, 0) // 线性对比度
  .toBuffer();
```

---

## 参数与质量策略

- DPI：常用 72–300；DPI 越高，像素越大、导出体积越大，但细节更清晰。
- 压缩：PNG（无损，适合文本线稿）；JPEG（有损，适合扫描图像，可配置 quality）。
- 速度：
  - 优先流水线：页面渲染 → 图像处理 → 预览/导出并行
  - 大文件/多页：批次/队列处理（Worker/子进程），可限流并发数
- 一致性：统一在 Node 侧操作像素，避免浏览器/平台差异。

---

## 目录建议

### 第一阶段（Node Web 原型）

```
web-proto/
├─ package.json
├─ src/
│  ├─ server/
│  │  ├─ pdf.ts        # 打开/校验密码/渲染/文本抽取
│  │  ├─ image.ts      # sharp 管线（灰度/对比度/锐化/阈值/去噪）
│  │  └─ export.ts     # 合并导出 PDF（保持 page size）
│  └─ client/
│     ├─ App.tsx       # UI：上传/密码/参数/预览/导出
│     └─ api.ts        # 调用 server 的 REST/JSON-RPC
└─ README.md
```

### 第二阶段（Electron 集成）

```
electron-app/
├─ package.json
├─ src/
│  ├─ main/            # 主进程：文件对话框、任务队列、生成导出
│  │  ├─ main.ts
│  │  └─ pdf-worker.ts # 可选：独立进程/Worker 跑渲染与图像处理
│  ├─ preload/
│  │  └─ index.ts      # 受控暴露 IPC API 给渲染端
│  └─ renderer/
│     ├─ App.tsx       # 复用 Web 原型 UI
│     └─ api.ts        # ipcRenderer.invoke 封装
└─ build/              # 打包配置（electron-builder/forge）
```

---

## 打包与发布（CI/CD 要点）

- 各平台构建各自安装包：macOS 在 macOS 上构建，Windows 在 Windows Runner 上构建（可用 GitHub Actions 多平台 Runner）。
- 代码签名与公证：
  - macOS：签名与（常见场景下的）公证
  - Windows：代码签名（EV/普通证书）
- 版本更新：可考虑 electron-builder 的 auto update 或第三方服务。

---

## 许可与合规注意

- MuPDF.js：AGPL/commercial（商业闭源需商业许可），尽早确定授权模式。
- sharp、pdf-lib：参考各自开源许可（通常为宽松许可）。

---

## 小结（可执行路线）

1. 先完成 Node Web 原型：密码 → 渲染 → 图像处理 → 合并导出（保持 page size）。
2. 验证处理质量与体积（DPI/压缩/锐化与阈值组合），固化默认参数。
3. 迁移到 Electron：模块下沉到主进程/Worker，复用 UI，完善签名/发布。
4. 持续关注许可合规与二次分发策略。
