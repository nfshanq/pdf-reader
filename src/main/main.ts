import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { PDFProcessor } from "../server/pdf.js";
import { PageRenderer } from "../server/render.js";
import { ImageProcessor } from "../server/image.js";
import { PDFExporter } from "../server/export.js";
import type { RenderOptions, ProcessingParams, ProcessedPage } from "../shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ElectronApp {
  private mainWindow: BrowserWindow | null = null;
  private pdfProcessor = new PDFProcessor();
  private pageRenderer = new PageRenderer();
  private imageProcessor = new ImageProcessor();
  private pdfExporter = new PDFExporter();

  async createWindow() {
    // 创建主窗口
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1000,
      minHeight: 700,
      title: "PDF图像处理器",
      titleBarStyle: "default", // 使用标准标题栏，确保窗口可以拖拽
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, "../preload/index.js"),
        webSecurity: true,
      },
      show: false, // 先不显示，等加载完成后再显示
    });

    // 窗口加载完成后显示
    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow?.show();
      
      // 开发环境下打开开发者工具
      if (process.env.NODE_ENV === "development") {
        this.mainWindow?.webContents.openDevTools();
      }
    });

    // 加载应用内容
    const isDev = process.env.NODE_ENV === "development" || process.env.ELECTRON_IS_DEV === "true";
    if (isDev) {
      // 开发环境：加载Vite开发服务器
      try {
        await this.mainWindow.loadURL("http://localhost:5173");
        console.log("✅ 已连接到Vite开发服务器 (http://localhost:5173)");
      } catch (error) {
        console.error("❌ 无法连接到Vite开发服务器，尝试加载本地文件");
        await this.mainWindow.loadFile(join(__dirname, "../../dist/index.html"));
      }
    } else {
      // 生产环境：加载打包后的文件
      await this.mainWindow.loadFile(join(__dirname, "../../dist/index.html"));
      console.log("✅ 已加载生产环境文件");
    }

    // 处理窗口关闭
    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
    });

    // 处理外部链接
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });
  }

  setupIPC() {
    // 文件对话框相关
    ipcMain.handle("dialog:openFile", async () => {
      if (!this.mainWindow) return { canceled: true };

      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ["openFile"],
        filters: [
          { name: "PDF Files", extensions: ["pdf"] },
          { name: "All Files", extensions: ["*"] },
        ],
        title: "选择PDF文件",
      });

      return result;
    });

    ipcMain.handle("dialog:saveFile", async (_, defaultName: string, format: string) => {
      if (!this.mainWindow) return { canceled: true };

      const filters = [];
      if (format === "PDF" || !format) {
        filters.push({ name: "PDF Files", extensions: ["pdf"] });
      }
      if (format === "PNG") {
        filters.push({ name: "PNG Images", extensions: ["png"] });
      }
      if (format === "JPEG") {
        filters.push({ name: "JPEG Images", extensions: ["jpg", "jpeg"] });
      }
      filters.push({ name: "All Files", extensions: ["*"] });

      const result = await dialog.showSaveDialog(this.mainWindow, {
        defaultPath: defaultName,
        filters,
        title: "保存文件",
      });

      return result;
    });

    // PDF 处理相关
    ipcMain.handle("pdf:open", async (_, filePath: string) => {
      try {
        const buffer = readFileSync(filePath);
        const filename = filePath.split(/[/\\]/).pop() || "unknown.pdf";
        return await this.pdfProcessor.openDocument(buffer, filename);
      } catch (error) {
        console.error("打开PDF文件失败:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`打开PDF文件失败: ${errorMessage}`);
      }
    });

    ipcMain.handle("pdf:verifyPassword", async (_, documentId: string, password: string) => {
      try {
        return await this.pdfProcessor.authenticatePassword(documentId, password);
      } catch (error) {
        console.error("验证密码失败:", error);
        return false;
      }
    });

    ipcMain.handle("pdf:getInfo", async (_, documentId: string) => {
      try {
        const document = this.pdfProcessor.getDocument(documentId);
        if (!document) {
          throw new Error("文档未找到");
        }

        const metadata = this.pdfProcessor.getDocumentMetadata(documentId);
        const bounds = await this.pdfProcessor.getPageBounds(documentId);
        
        return {
          ...metadata,
          pages: bounds,
        };
      } catch (error) {
        console.error("获取文档信息失败:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`获取文档信息失败: ${errorMessage}`);
      }
    });

    ipcMain.handle("pdf:render", async (_, documentId: string, pageIndex: number, options: RenderOptions) => {
      try {
        const document = this.pdfProcessor.getDocument(documentId);
        if (!document) {
          throw new Error("文档未找到");
        }

        const bounds = await this.pdfProcessor.getPageBounds(documentId);
        if (!bounds[pageIndex]) {
          throw new Error(`页面 ${pageIndex} 不存在`);
        }

        const imageBuffer = await this.pageRenderer.renderPage(
          document,
          pageIndex,
          bounds[pageIndex],
          options
        );

        // 返回Base64编码的图像数据，方便在渲染进程中使用
        return imageBuffer.toString("base64");
      } catch (error) {
        console.error("渲染页面失败:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`渲染页面失败: ${errorMessage}`);
      }
    });

    ipcMain.handle("pdf:process", async (_, imageBase64: string, params: ProcessingParams) => {
      try {
        const imageBuffer = Buffer.from(imageBase64, "base64");
        const processedBuffer = await this.imageProcessor.processImage(imageBuffer, params);
        
        // 返回Base64编码的处理后图像数据
        return processedBuffer.toString("base64");
      } catch (error) {
        console.error("处理图像失败:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`处理图像失败: ${errorMessage}`);
      }
    });

    ipcMain.handle("pdf:export", async (_, pages: ProcessedPage[], filePath: string) => {
      try {
        // 将Base64图像数据转换回Buffer
        const processedPages = pages.map(page => ({
          ...page,
          originalImage: Buffer.from(page.originalImage as any, "base64"),
          processedImage: page.processedImage 
            ? Buffer.from(page.processedImage as any, "base64")
            : undefined,
        }));

        const pdfBuffer = await this.pdfExporter.exportProcessedPDF(processedPages);
        writeFileSync(filePath, pdfBuffer);
        
        return { success: true, filePath };
      } catch (error) {
        console.error("导出PDF失败:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`导出PDF失败: ${errorMessage}`);
      }
    });

    ipcMain.handle("pdf:close", async (_, documentId: string) => {
      try {
        this.pdfProcessor.closeDocument(documentId);
        return { success: true };
      } catch (error) {
        console.error("关闭文档失败:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`关闭文档失败: ${errorMessage}`);
      }
    });

    // 应用信息相关
    ipcMain.handle("app:getVersion", () => {
      return app.getVersion();
    });

    ipcMain.handle("app:showItemInFolder", (_, filePath: string) => {
      shell.showItemInFolder(filePath);
    });

    // 开发工具
    ipcMain.handle("app:toggleDevTools", () => {
      if (this.mainWindow) {
        this.mainWindow.webContents.toggleDevTools();
      }
    });
  }

  async initialize() {
    // 等待应用准备就绪
    await app.whenReady();

    // 设置IPC处理器
    this.setupIPC();

    // 创建主窗口
    await this.createWindow();

    // macOS应用激活处理
    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await this.createWindow();
      }
    });

    // 处理协议（可用于将来的文件关联）
    app.setAsDefaultProtocolClient("pdf-processor");
  }

  cleanup() {
    // 清理资源
    this.pdfProcessor = null as any;
    this.pageRenderer = null as any;
    this.imageProcessor = null as any;
    this.pdfExporter = null as any;
  }
}

// 创建应用实例
const electronApp = new ElectronApp();

// 初始化应用
electronApp.initialize().catch(console.error);

// 处理应用退出
app.on("window-all-closed", () => {
  electronApp.cleanup();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  electronApp.cleanup();
});

// 安全设置
app.on("web-contents-created", (_, contents) => {
  // 禁止导航到外部URL
  contents.on("will-navigate", (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    if (parsedUrl.origin !== "http://localhost:5173" && parsedUrl.origin !== "file://") {
      event.preventDefault();
    }
  });

  // 禁止创建新窗口
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
});
