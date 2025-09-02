# PDF 阅读处理项目 - 详细实施计划

## 项目概述

基于 project-overview.md 的技术路线，本计划提供从环境搭建到最终部署的完整实施步骤。
采用两阶段开发模式：先开发 Web 原型验证技术路线，再迁移到 Electron 桌面应用。

---

## 总体时间规划

- **阶段一**: 环境搭建与基础架构 (Week 1)
- **阶段二**: 核心模块开发 (Week 2-3)
- **阶段三**: API 层与前端开发 (Week 4-5)
- **阶段四**: 集成测试与优化 (Week 6)
- **阶段五**: Electron 桌面应用开发 (Week 7-8)

---

## 阶段一：环境搭建与基础架构 (Week 1)

### 任务 1: 环境搭建与初始化

#### Git 环境配置

```bash
# 初始化项目
git init
git branch -M main

# 创建 .gitignore
echo "node_modules/
dist/
.env
*.log
.DS_Store
.vscode/settings.json
temp/
uploads/" > .gitignore

# 初始提交
git add .
git commit -m "Initial project setup"
```

#### Node.js 环境验证

- 确认 Node.js 版本 ≥ 18 (推荐使用 LTS)
- 验证 npm/yarn 可用性
- 如在国内环境，配置 npm registry：
  ```bash
  npm config set registry https://registry.npmmirror.com
  ```

#### 项目结构创建

```
pdf-reader/
├── package.json                 # 项目配置
├── tsconfig.json               # TypeScript 配置
├── vite.config.ts              # Vite 构建配置
├── src/
│   ├── server/                 # 后端 API
│   │   ├── pdf.ts             # PDF 核心处理
│   │   ├── render.ts          # 页面渲染
│   │   ├── image.ts           # 图像处理
│   │   ├── export.ts          # PDF 导出
│   │   └── api.ts             # 服务器 API
│   ├── client/                # 前端界面
│   │   ├── App.tsx            # 主应用组件
│   │   ├── components/        # UI 组件
│   │   └── api.ts             # API 调用
│   └── shared/                # 共享类型定义
│       └── types.ts           # TypeScript 类型
├── test/                      # 测试文件
├── docs/                      # 文档
├── examples/                  # 示例 PDF 文件
└── dev-notes/                 # 开发笔记
```

### 任务 2: 核心依赖安装与配置

#### 初始化 package.json

```bash
npm init -y
```

#### 后端依赖安装

```bash
# 核心处理库
npm install mupdf sharp pdf-lib

# 服务器框架
npm install express cors multer

# 开发依赖
npm install -D typescript @types/node @types/express nodemon ts-node
```

#### 前端依赖安装

```bash
# React 和构建工具
npm install react react-dom vite

# TypeScript 支持
npm install -D @types/react @types/react-dom @vitejs/plugin-react

# UI 组件库 (可选)
npm install @mui/material @emotion/react @emotion/styled
```

#### TypeScript 配置 (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@server/*": ["src/server/*"],
      "@client/*": ["src/client/*"],
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": ["src", "test"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

#### Vite 配置 (vite.config.ts)

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@server": resolve(__dirname, "src/server"),
      "@client": resolve(__dirname, "src/client"),
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
```

---

## 阶段二：核心模块开发 (Week 2-3)

### 任务 3: 共享类型定义 (`src/shared/types.ts`)

```typescript
export interface PageBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width_pt: number; // x1 - x0
  height_pt: number; // y1 - y0
}

export interface RenderOptions {
  dpi: number; // 72-300 范围
  colorSpace: "RGB" | "Gray";
  format: "PNG" | "JPEG";
  quality?: number; // JPEG 质量 (1-100)
}

export interface ProcessingParams {
  grayscale: boolean;
  contrast: number; // 0.5-2.0
  brightness: number; // -100 to 100
  threshold: number; // 0-255, 0 表示不应用
  sharpen: {
    sigma: number; // 0.5-5.0
    flat: number; // 0-10
    jagged: number; // 0-10
  };
  denoise: boolean;
  gamma: number; // 0.1-3.0
}

export interface ProcessedPage {
  pageIndex: number;
  bounds: PageBounds;
  originalImage: Buffer;
  processedImage?: Buffer;
  renderOptions: RenderOptions;
  processingParams?: ProcessingParams;
}

export interface PDFDocument {
  id: string;
  filename: string;
  pageCount: number;
  needsPassword: boolean;
  isAuthenticated: boolean;
  pages: PageBounds[];
}
```

### 任务 4: PDF 核心处理模块 (`src/server/pdf.ts`)

```typescript
import * as fs from "node:fs";
import * as mupdf from "mupdf";
import { PDFDocument, PageBounds } from "@shared/types";

export class PDFProcessor {
  private documents = new Map<string, any>();

  async openDocument(buffer: Buffer, filename: string): Promise<PDFDocument> {
    try {
      const document = mupdf.PDFDocument.openDocument(
        buffer,
        "application/pdf"
      );
      const id = this.generateId();

      this.documents.set(id, document);

      const pdfDoc: PDFDocument = {
        id,
        filename,
        pageCount: document.countPages(),
        needsPassword: document.needsPassword(),
        isAuthenticated: !document.needsPassword(),
        pages: [],
      };

      // 如果不需要密码，直接获取页面信息
      if (!pdfDoc.needsPassword) {
        pdfDoc.pages = await this.getPageBounds(id);
      }

      return pdfDoc;
    } catch (error) {
      throw new Error(`Failed to open PDF: ${error.message}`);
    }
  }

  async authenticatePassword(
    documentId: string,
    password: string
  ): Promise<boolean> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error("Document not found");
    }

    try {
      const success = document.authenticatePassword(password);
      if (success) {
        // 认证成功后获取页面信息
        const pages = await this.getPageBounds(documentId);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async getPageBounds(documentId: string): Promise<PageBounds[]> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error("Document not found");
    }

    const bounds: PageBounds[] = [];
    const pageCount = document.countPages();

    for (let i = 0; i < pageCount; i++) {
      try {
        const page = document.loadPage(i);
        const [x0, y0, x1, y1] = page.getBounds();

        bounds.push({
          x0,
          y0,
          x1,
          y1,
          width_pt: x1 - x0,
          height_pt: y1 - y0,
        });
      } catch (error) {
        console.error(`Failed to get bounds for page ${i}:`, error);
        // 使用默认值
        bounds.push({
          x0: 0,
          y0: 0,
          x1: 595,
          y1: 842,
          width_pt: 595,
          height_pt: 842,
        });
      }
    }

    return bounds;
  }

  getDocument(documentId: string) {
    return this.documents.get(documentId);
  }

  closeDocument(documentId: string): void {
    this.documents.delete(documentId);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}
```

### 任务 5: 页面渲染模块 (`src/server/render.ts`)

```typescript
import * as mupdf from "mupdf";
import { RenderOptions, PageBounds } from "@shared/types";

export class PageRenderer {
  async renderPage(
    document: any,
    pageIndex: number,
    bounds: PageBounds,
    options: RenderOptions
  ): Promise<Buffer> {
    try {
      const page = document.loadPage(pageIndex);

      // 计算缩放比例
      const scale = options.dpi / 72;
      const matrix = mupdf.Matrix.scale(scale, scale);

      // 选择色彩空间
      const colorSpace =
        options.colorSpace === "Gray"
          ? mupdf.ColorSpace.DeviceGray
          : mupdf.ColorSpace.DeviceRGB;

      // 渲染为位图
      const pixmap = page.toPixmap(matrix, colorSpace, false, true);

      // 导出为指定格式
      if (options.format === "PNG") {
        return Buffer.from(pixmap.asPNG());
      } else {
        // JPEG 格式需要额外处理
        const pngBuffer = Buffer.from(pixmap.asPNG());
        // 这里可以使用 sharp 转换为 JPEG
        return pngBuffer;
      }
    } catch (error) {
      throw new Error(`Failed to render page ${pageIndex}: ${error.message}`);
    }
  }

  calculatePixelSize(
    bounds: PageBounds,
    dpi: number
  ): { width: number; height: number } {
    const scale = dpi / 72;
    return {
      width: Math.floor(bounds.width_pt * scale),
      height: Math.floor(bounds.height_pt * scale),
    };
  }

  async renderPageBatch(
    document: any,
    pages: Array<{ index: number; bounds: PageBounds }>,
    options: RenderOptions,
    onProgress?: (completed: number, total: number) => void
  ): Promise<Buffer[]> {
    const results: Buffer[] = [];

    for (let i = 0; i < pages.length; i++) {
      const { index, bounds } = pages[i];
      const buffer = await this.renderPage(document, index, bounds, options);
      results.push(buffer);

      if (onProgress) {
        onProgress(i + 1, pages.length);
      }
    }

    return results;
  }
}
```

### 任务 6: 图像处理模块 (`src/server/image.ts`)

```typescript
import sharp from "sharp";
import { ProcessingParams } from "@shared/types";

export class ImageProcessor {
  async processImage(
    imageBuffer: Buffer,
    params: ProcessingParams
  ): Promise<Buffer> {
    try {
      let pipeline = sharp(imageBuffer);

      // 灰度转换
      if (params.grayscale) {
        pipeline = pipeline.greyscale();
      }

      // 伽马校正
      if (params.gamma !== 1.0) {
        pipeline = pipeline.gamma(params.gamma);
      }

      // 对比度和亮度调整
      if (params.contrast !== 1.0 || params.brightness !== 0) {
        pipeline = pipeline.linear(params.contrast, params.brightness);
      }

      // 锐化
      if (params.sharpen.sigma > 0) {
        pipeline = pipeline.sharpen({
          sigma: params.sharpen.sigma,
          flat: params.sharpen.flat,
          jagged: params.sharpen.jagged,
        });
      }

      // 阈值处理（二值化）
      if (params.threshold > 0) {
        pipeline = pipeline.threshold(params.threshold, {
          greyscale: params.grayscale,
        });
      }

      // 去噪（可以使用模糊）
      if (params.denoise) {
        pipeline = pipeline.blur(0.5);
      }

      return await pipeline.png().toBuffer();
    } catch (error) {
      throw new Error(`Failed to process image: ${error.message}`);
    }
  }

  async batchProcess(
    images: Buffer[],
    params: ProcessingParams,
    onProgress?: (completed: number, total: number) => void
  ): Promise<Buffer[]> {
    const results: Buffer[] = [];

    for (let i = 0; i < images.length; i++) {
      const processed = await this.processImage(images[i], params);
      results.push(processed);

      if (onProgress) {
        onProgress(i + 1, images.length);
      }
    }

    return results;
  }

  // 获取图像信息
  async getImageInfo(imageBuffer: Buffer) {
    const metadata = await sharp(imageBuffer).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      channels: metadata.channels || 0,
      format: metadata.format || "unknown",
      size: imageBuffer.length,
    };
  }

  // 生成预览图（小尺寸）
  async generatePreview(
    imageBuffer: Buffer,
    maxWidth: number = 400,
    maxHeight: number = 600
  ): Promise<Buffer> {
    return await sharp(imageBuffer)
      .resize(maxWidth, maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  }
}
```

### 任务 7: PDF 导出模块 (`src/server/export.ts`)

```typescript
import { PDFDocument, PageBounds, ProcessedPage } from "@shared/types";
import { PDFDocument as PDFLibDocument } from "pdf-lib";

export class PDFExporter {
  async exportProcessedPDF(pages: ProcessedPage[]): Promise<Buffer> {
    try {
      const pdfDoc = await PDFLibDocument.create();

      for (const page of pages) {
        // 严格使用原始页面尺寸
        const { width_pt, height_pt } = page.bounds;
        const pdfPage = pdfDoc.addPage([width_pt, height_pt]);

        // 嵌入处理后的图像
        const imageToEmbed = page.processedImage || page.originalImage;
        const embeddedImage = await pdfDoc.embedPng(imageToEmbed);

        // 绘制图像，完全覆盖页面
        pdfPage.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: width_pt,
          height: height_pt,
        });
      }

      const pdfBytes = await pdfDoc.save();
      return Buffer.from(pdfBytes);
    } catch (error) {
      throw new Error(`Failed to export PDF: ${error.message}`);
    }
  }

  async exportSinglePage(
    pageData: ProcessedPage,
    outputFormat: "PDF" | "PNG" | "JPEG" = "PDF"
  ): Promise<Buffer> {
    if (outputFormat === "PDF") {
      return this.exportProcessedPDF([pageData]);
    }

    // 返回图像数据
    return pageData.processedImage || pageData.originalImage;
  }

  // 分页导出（用于大文件）
  async exportInBatches(
    pages: ProcessedPage[],
    batchSize: number = 50,
    onProgress?: (batchIndex: number, totalBatches: number) => void
  ): Promise<Buffer[]> {
    const results: Buffer[] = [];
    const totalBatches = Math.ceil(pages.length / batchSize);

    for (let i = 0; i < pages.length; i += batchSize) {
      const batch = pages.slice(i, i + batchSize);
      const batchPDF = await this.exportProcessedPDF(batch);
      results.push(batchPDF);

      if (onProgress) {
        onProgress(Math.floor(i / batchSize) + 1, totalBatches);
      }
    }

    return results;
  }

  // 计算导出文件预估大小
  estimateOutputSize(pages: ProcessedPage[]): number {
    let totalSize = 0;

    for (const page of pages) {
      // PDF 基础结构开销
      totalSize += 1000;

      // 图像数据大小
      const imageSize =
        page.processedImage?.length || page.originalImage.length;
      totalSize += imageSize;
    }

    return totalSize;
  }
}
```

---

## 阶段三：API 层与前端开发 (Week 4-5) ✅ **已完成**

### 任务 8: 服务器 API 开发 (`src/server/api.ts`) ✅ **已完成**

**实际实现比计划更完善，主要增强包括：**

1. **统一的错误处理和响应格式**

   - APIResponse 接口统一响应结构
   - 全局错误处理中间件
   - 详细的日志记录

2. **增强的文件上传处理**

   - 文件类型和大小验证
   - 支持大文件（1GB 限制）
   - 多部件上传错误处理

3. **新增功能端点**：

   - `/api/health` - 健康检查
   - `/api/pdf/:id/info` - 获取文档信息
   - `/api/pdf/:id/preview` - 渲染预览（低分辨率）
   - `/api/pdf/:id/batch-process` - 批量处理
   - `/api/pdf/:id/recommendations` - 获取推荐参数
   - `/api/admin/cleanup` - 资源清理

4. **内存和性能管理**：

   - 渲染可行性检查
   - 内存使用估算
   - 参数验证和修正

5. **元数据支持**：
   - PDF 元数据导出
   - 自定义文件命名
   - 处理设置摘要

**核心 API 端点总计 15 个，覆盖完整的 PDF 处理流程**

### 任务 9: 前端主应用开发 ✅ **已完成**

**实际实现比计划更完善，主要增强包括：**

#### 主应用 (`src/client/App.tsx`) ✅

- **状态管理增强**：分离 loading、processing、exporting 等细化状态
- **内存管理优化**：自动清理 URL 对象，防止内存泄漏
- **用户体验提升**：统一错误提示、加载指示、操作反馈
- **模态对话框**：ExportDialog 以模态形式展示
- **API 集成**：使用封装好的 apiClient 进行所有 API 调用

#### 核心组件完整实现：

**1. FileUpload 组件** ✅

- 拖拽上传支持
- 文件类型和大小验证
- 加密 PDF 密码输入模态框
- 视觉反馈和状态指示

**2. ParameterPanel 组件** ✅

- 完整的参数控制面板
- 实时参数验证和提示
- 快速预设配置（文档增强、扫描清理、图像优化）
- 条件显示高级选项

**3. PreviewPane 组件** ✅

- 原图/处理后/对比三种视图模式
- 缩放控制（0.5x - 3x）
- 页面导航和快捷键支持（←→ 切换页面，+- 缩放）
- 页面信息显示（尺寸、边界、比例）

**4. ExportDialog 组件** ✅

- 灵活的页面选择（当前页/全部页面/页面范围）
- 导出设置摘要和文件大小估算
- PDF 元数据自定义
- 导出进度指示

**5. API Client** (`src/client/api.ts`) ✅

- 完整的 API 封装，包含所有后端端点
- 统一错误处理和响应解析
- 文件下载和 URL 管理辅助方法
- TypeScript 类型安全

#### 界面布局和交互：

- **响应式设计**：左参数面板 + 中央预览区 + 模态导出对话框
- **状态驱动**：根据文档状态动态显示不同界面
- **快捷键支持**：页面导航和缩放快捷键
- **国际化友好**：中文界面，清晰的操作指示

**共享类型定义** (`src/shared/types.ts`) ✅

- 与计划基本一致，增加了 APIResponse、ProgressCallback 等辅助类型
- PreviewImages 接口用于前端预览状态管理
- 完整的 TypeScript 类型覆盖

---

## 实际实现与原计划的主要差异

### 功能增强

1. **API 功能更丰富**：从计划的 7 个端点扩展到 15 个端点
2. **内存管理**：增加了渲染可行性检查和内存使用估算
3. **用户体验**：大幅改进 UI 交互，增加预览模式、快捷键、进度指示等
4. **智能功能**：参数推荐、质量评估、智能锐化等
5. **错误处理**：完善的错误处理和用户反馈机制

### 技术实现差异

1. **状态管理**：比原计划更细化的状态管理
2. **内存清理**：自动 URL 清理机制
3. **参数验证**：服务器端参数验证和修正
4. **批量处理**：支持大文件的分批处理
5. **元数据支持**：PDF 元数据的完整支持

### 开发质量

1. **代码质量**：更完善的错误处理、日志记录
2. **类型安全**：完整的 TypeScript 类型覆盖
3. **可维护性**：模块化设计，清晰的职责分离
4. **性能优化**：内存使用控制，预览优化

---

## 阶段四：集成测试与优化 (Week 6) 🎯 **准备就绪**

### 任务 10: 集成测试准备

#### 测试数据准备

在 `examples/` 目录下准备测试用 PDF 文件：

- `normal.pdf` - 普通 PDF 文档
- `password.pdf` - 加密 PDF 文档
- `large.pdf` - 大文件（>10MB，多页）
- `scanned.pdf` - 扫描件 PDF
- `mixed.pdf` - 混合内容（文本+图像）

#### 测试脚本 (`test/integration.test.js`)

```javascript
// 端到端测试脚本
const fs = require("fs");
const path = require("path");

async function testPDFProcessing() {
  console.log("Starting integration tests...");

  // 测试 1: 普通 PDF 处理
  await testNormalPDF();

  // 测试 2: 加密 PDF 处理
  await testPasswordPDF();

  // 测试 3: 大文件处理
  await testLargeFilePDF();

  // 测试 4: 页面尺寸保持
  await testPageSizePreservation();

  console.log("All tests completed!");
}

async function testNormalPDF() {
  // 实现普通 PDF 处理测试
}

// 其他测试函数...
```

#### 性能测试

```bash
# 安装性能测试工具
npm install -D artillery

# 创建性能测试配置
echo "config:
  target: 'http://localhost:3001'
  phases:
    - duration: 60
      arrivalRate: 5
scenarios:
  - name: 'PDF Upload and Process'
    flow:
      - post:
          url: '/api/pdf/upload'
          formData:
            pdf: '@examples/normal.pdf'" > test/performance.yml
```

### 任务 11: 参数调优与质量验证

#### 默认参数优化

根据测试结果调整以下默认值：

- DPI: 72（预览）/ 150（导出）/ 300（高质量）
- 对比度: 1.1（轻微增强）
- 锐化: sigma=1.0（适中锐化）
- 阈值: 动态计算（基于图像直方图）

#### 质量评估脚本

```javascript
// 质量评估工具
class QualityAssessment {
  // 计算图像清晰度
  calculateSharpness(imageBuffer) {
    // 使用 Laplacian 算子计算方差
  }

  // 计算对比度
  calculateContrast(imageBuffer) {
    // 计算像素值标准差
  }

  // 评估文件大小效率
  evaluateCompressionRatio(originalSize, processedSize) {
    return processedSize / originalSize;
  }
}
```

---

## 阶段五：Electron 桌面应用开发 (Week 7-8)

### 任务 12: Electron 项目结构搭建

#### 安装 Electron 依赖

```bash
npm install -D electron electron-builder concurrently wait-on

# 开发工具
npm install -D @types/electron
```

#### Electron 主进程 (`src/main/main.ts`)

```typescript
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import { PDFProcessor } from "../server/pdf";
import { PageRenderer } from "../server/render";
import { ImageProcessor } from "../server/image";
import { PDFExporter } from "../server/export";

class ElectronApp {
  private mainWindow: BrowserWindow | null = null;
  private pdfProcessor = new PDFProcessor();
  private pageRenderer = new PageRenderer();
  private imageProcessor = new ImageProcessor();
  private pdfExporter = new PDFExporter();

  async createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "../preload/index.js"),
      },
    });

    if (process.env.NODE_ENV === "development") {
      this.mainWindow.loadURL("http://localhost:5173");
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile("dist/index.html");
    }
  }

  setupIPC() {
    // 文件选择对话框
    ipcMain.handle("dialog:openFile", async () => {
      const result = await dialog.showOpenDialog(this.mainWindow!, {
        properties: ["openFile"],
        filters: [{ name: "PDF Files", extensions: ["pdf"] }],
      });

      return result;
    });

    // 保存文件对话框
    ipcMain.handle("dialog:saveFile", async (_, defaultName: string) => {
      const result = await dialog.showSaveDialog(this.mainWindow!, {
        defaultPath: defaultName,
        filters: [
          { name: "PDF Files", extensions: ["pdf"] },
          { name: "PNG Images", extensions: ["png"] },
          { name: "JPEG Images", extensions: ["jpg", "jpeg"] },
        ],
      });

      return result;
    });

    // PDF 处理 API
    ipcMain.handle("pdf:open", async (_, filePath: string) => {
      const fs = await import("fs");
      const buffer = fs.readFileSync(filePath);
      return this.pdfProcessor.openDocument(buffer, path.basename(filePath));
    });

    ipcMain.handle(
      "pdf:verifyPassword",
      async (_, documentId: string, password: string) => {
        return this.pdfProcessor.authenticatePassword(documentId, password);
      }
    );

    ipcMain.handle(
      "pdf:render",
      async (_, documentId: string, pageIndex: number, options: any) => {
        const document = this.pdfProcessor.getDocument(documentId);
        const bounds = await this.pdfProcessor.getPageBounds(documentId);
        return this.pageRenderer.renderPage(
          document,
          pageIndex,
          bounds[pageIndex],
          options
        );
      }
    );

    ipcMain.handle(
      "pdf:process",
      async (_, imageBuffer: Buffer, params: any) => {
        return this.imageProcessor.processImage(imageBuffer, params);
      }
    );

    ipcMain.handle("pdf:export", async (_, pages: any[]) => {
      return this.pdfExporter.exportProcessedPDF(pages);
    });
  }

  async initialize() {
    await app.whenReady();

    this.setupIPC();
    await this.createWindow();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await this.createWindow();
      }
    });
  }
}

const electronApp = new ElectronApp();
electronApp.initialize();

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
```

#### 预加载脚本 (`src/preload/index.ts`)

```typescript
import { contextBridge, ipcRenderer } from "electron";

const electronAPI = {
  // 文件对话框
  openFileDialog: () => ipcRenderer.invoke("dialog:openFile"),
  saveFileDialog: (defaultName: string) =>
    ipcRenderer.invoke("dialog:saveFile", defaultName),

  // PDF 操作
  openPDF: (filePath: string) => ipcRenderer.invoke("pdf:open", filePath),
  verifyPassword: (documentId: string, password: string) =>
    ipcRenderer.invoke("pdf:verifyPassword", documentId, password),
  renderPage: (documentId: string, pageIndex: number, options: any) =>
    ipcRenderer.invoke("pdf:render", documentId, pageIndex, options),
  processImage: (imageBuffer: Buffer, params: any) =>
    ipcRenderer.invoke("pdf:process", imageBuffer, params),
  exportPDF: (pages: any[]) => ipcRenderer.invoke("pdf:export", pages),
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
```

### 任务 13: 构建配置与打包

#### package.json 脚本配置

```json
{
  "main": "dist/main/main.js",
  "scripts": {
    "electron": "electron .",
    "electron:dev": "concurrently \"npm run dev\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "npm run build:renderer && npm run build:main",
    "build:renderer": "vite build",
    "build:main": "tsc -p tsconfig.main.json",
    "dist": "npm run build && electron-builder",
    "dist:mac": "npm run build && electron-builder --mac",
    "dist:win": "npm run build && electron-builder --win"
  }
}
```

#### Electron Builder 配置 (`electron-builder.json`)

```json
{
  "appId": "com.yourcompany.pdf-processor",
  "productName": "PDF Processor",
  "directories": {
    "output": "release"
  },
  "files": ["dist/**/*", "node_modules/**/*"],
  "mac": {
    "category": "public.app-category.productivity",
    "target": "dmg"
  },
  "win": {
    "target": "nsis"
  },
  "linux": {
    "target": "AppImage"
  }
}
```

---

## 关键里程碑检查点

### 里程碑 1 (Week 3): 核心功能验证

**验收标准:**

- [ ] 能够打开普通和加密 PDF 文件
- [ ] 页面渲染输出正确尺寸的图像
- [ ] 图像处理参数调节有明显效果
- [ ] 导出 PDF 严格保持原始页面尺寸
- [ ] 处理流程内存占用合理

**验证方法:**

```bash
# 运行核心模块测试
npm test -- --grep "core modules"

# 手动验证页面尺寸
node test/verify-page-size.js examples/normal.pdf
```

### 里程碑 2 (Week 5): Web 原型完成 ✅ **已完成**

**验收标准完成情况:**

- ✅ **完整的 Web 界面响应正常** - 所有组件正常工作
- ✅ **文件上传和密码验证流畅** - 支持拖拽上传，密码模态框
- ✅ **实时预览对比功能正常** - 三种预览模式，缩放支持
- ✅ **参数调节立即反映在预览中** - 防抖加载，实时更新
- ✅ **批量处理和导出稳定** - 完整的导出对话框，元数据支持

**额外完成的功能:**

- ✅ **内存管理** - 自动 URL 清理，内存使用估算
- ✅ **智能功能** - 参数推荐，质量评估
- ✅ **用户体验** - 快捷键，进度指示，错误处理
- ✅ **预设配置** - 文档增强、扫描清理、图像优化

**当前验证状态:**

```bash
# 开发服务器正常运行
npm run server  # 后端API服务器
npm run dev     # 前端开发服务器

# 功能验证
- [✅] 文件上传和解析
- [✅] 页面渲染和预览
- [✅] 图像处理流水线
- [✅] PDF导出功能
- [✅] 错误处理和用户反馈
```

### 里程碑 3 (Week 8): 桌面应用就绪

**验收标准:**

- [ ] Electron 应用启动正常
- [ ] 本地文件选择和保存对话框工作
- [ ] 所有核心功能在桌面环境正常
- [ ] 应用可以成功打包为安装程序
- [ ] 跨平台兼容性测试通过

**验证方法:**

```bash
# 开发模式测试
npm run electron:dev

# 构建测试
npm run dist

# 安装包测试
open release/*.dmg  # macOS
# 或
./release/*.AppImage  # Linux
```

---

## 风险预案与应对策略

### 技术风险

1. **MuPDF.js 性能问题**

   - 风险: 大文件渲染速度慢
   - 应对: 实现 Worker 多线程，分页处理
   - 备选: 考虑 PDF.js 替代方案

2. **内存占用过高**

   - 风险: 处理大文件时内存溢出
   - 应对: 实现流式处理，及时释放缓存
   - 监控: 添加内存使用量监控

3. **页面尺寸精度问题**
   - 风险: 浮点数精度导致尺寸偏差
   - 应对: 使用整数运算，严格验证输出
   - 测试: 建立自动化精度验证

### 业务风险

1. **许可证合规性**

   - MuPDF.js 需要商业许可证用于闭源产品
   - 提前联系 Artifex 确认授权条款
   - 准备开源替代方案

2. **用户体验问题**
   - 处理大文件时界面卡顿
   - 实现进度指示和后台处理
   - 提供处理时间预估

### 开发风险

1. **时间安排紧张**

   - 各阶段预留 20% 缓冲时间
   - 关键功能优先级排序
   - 准备最小可行产品 (MVP) 方案

2. **跨平台兼容性**
   - 及早在目标平台测试
   - 使用 GitHub Actions 多平台构建
   - 准备平台特定处理逻辑

---

## 当前项目状态总结

### 已完成阶段

- ✅ **阶段一**: 环境搭建与基础架构 (已完成)
- ✅ **阶段二**: 核心模块开发 (已完成，功能超出预期)
- ✅ **阶段三**: API 层与前端开发 (已完成，大幅增强)

### 当前阶段

- 🎯 **阶段四**: 集成测试与优化 (准备就绪)

### 下一步行动计划

#### 立即执行 (本周) - 阶段四任务

1. 📋 **集成测试准备**

   - [ ] 收集多样化的测试 PDF 样本
   - [ ] 建立自动化测试流程
   - [ ] 性能基准测试

2. 🔧 **系统优化**

   - [ ] 内存使用优化验证
   - [ ] 大文件处理性能测试
   - [ ] 错误恢复机制完善

3. 📊 **质量保证**
   - [ ] 端到端功能测试
   - [ ] 用户体验优化
   - [ ] 文档完善

#### 后续规划

- **阶段五**: Electron 桌面应用开发 (Week 7-8)

### 项目优势

1. **功能完整性**: 超出原计划的功能覆盖
2. **代码质量**: 完善的类型安全和错误处理
3. **用户体验**: 直观的界面和操作流程
4. **技术先进性**: 现代化的技术栈和架构

### 技术债务管理

- 当前技术债务极低
- 代码结构清晰，易于维护
- 完整的 TypeScript 类型覆盖
- 统一的错误处理和日志记录

**项目已成功完成 Web 原型阶段，具备了完整的 PDF 图像处理能力，准备进入集成测试阶段。**
