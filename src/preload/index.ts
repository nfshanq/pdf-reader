import { contextBridge, ipcRenderer } from "electron";
import type { RenderOptions, ProcessingParams, ProcessedPage, PDFDocument } from "../shared/types.js";

// 定义Electron API接口
export interface ElectronAPI {
  // 文件对话框
  openFileDialog: () => Promise<Electron.OpenDialogReturnValue>;
  saveFileDialog: (defaultName: string, format: string) => Promise<Electron.SaveDialogReturnValue>;

  // PDF 操作
  openPDF: (filePath: string) => Promise<PDFDocument>;
  verifyPassword: (documentId: string, password: string) => Promise<boolean>;
  getPDFInfo: (documentId: string) => Promise<PDFDocument>;
  renderPage: (documentId: string, pageIndex: number, options: RenderOptions) => Promise<string>;
  processImage: (imageBase64: string, params: ProcessingParams) => Promise<string>;
  exportPDF: (pages: ProcessedPage[], filePath: string) => Promise<{ success: boolean; filePath: string }>;
  closePDF: (documentId: string) => Promise<{ success: boolean }>;

  // 应用功能
  getAppVersion: () => Promise<string>;
  showItemInFolder: (filePath: string) => void;
  toggleDevTools: () => void;

  // 环境检测
  isElectron: boolean;
}

// 创建API对象
const electronAPI: ElectronAPI = {
  // 文件对话框
  openFileDialog: () => ipcRenderer.invoke("dialog:openFile"),
  saveFileDialog: (defaultName: string, format: string) => 
    ipcRenderer.invoke("dialog:saveFile", defaultName, format),

  // PDF 操作
  openPDF: (filePath: string) => ipcRenderer.invoke("pdf:open", filePath),
  verifyPassword: (documentId: string, password: string) => 
    ipcRenderer.invoke("pdf:verifyPassword", documentId, password),
  getPDFInfo: (documentId: string) => ipcRenderer.invoke("pdf:getInfo", documentId),
  renderPage: (documentId: string, pageIndex: number, options: RenderOptions) => 
    ipcRenderer.invoke("pdf:render", documentId, pageIndex, options),
  processImage: (imageBase64: string, params: ProcessingParams) => 
    ipcRenderer.invoke("pdf:process", imageBase64, params),
  exportPDF: (pages: ProcessedPage[], filePath: string) => 
    ipcRenderer.invoke("pdf:export", pages, filePath),
  closePDF: (documentId: string) => ipcRenderer.invoke("pdf:close", documentId),

  // 应用功能
  getAppVersion: () => ipcRenderer.invoke("app:getVersion"),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke("app:showItemInFolder", filePath),
  toggleDevTools: () => ipcRenderer.invoke("app:toggleDevTools"),

  // 环境检测
  isElectron: true,
};

// 安全地暴露API到渲染进程
contextBridge.exposeInMainWorld("electronAPI", electronAPI);

// 类型声明，供TypeScript使用
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// 类型定义已在上面声明，无需再次导出
