import { PDFDocument, RenderOptions, ProcessingParams, APIResponse } from '@shared/types';

// 检测是否在Electron环境中
const isElectron = (): boolean => {
  return typeof window !== 'undefined' && !!window.electronAPI;
};

class APIClient {
  private baseURL: string;
  private isElectronEnv: boolean;

  constructor(baseURL: string = '/api') {
    this.baseURL = baseURL;
    this.isElectronEnv = isElectron();
  }

  /**
   * 通用请求方法
   */
  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<APIResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          success: false, 
          error: `HTTP ${response.status}: ${response.statusText}` 
        }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${url}`, error);
      throw error;
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ status: string; timestamp: string; openDocuments: number }> {
    if (this.isElectronEnv) {
      // Electron环境：返回模拟的健康状态
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        openDocuments: 0, // 可以根据需要实现文档计数
      };
    } else {
      const response = await this.request<any>('/health');
      return response.data;
    }
  }

  /**
   * 上传 PDF 文件
   */
  async uploadPDF(file?: File): Promise<PDFDocument> {
    if (this.isElectronEnv) {
      // Electron环境：使用文件对话框选择文件
      const result = await window.electronAPI.openFileDialog();
      if (result.canceled || !result.filePaths.length) {
        throw new Error('No file selected');
      }
      
      const filePath = result.filePaths[0];
      return await window.electronAPI.openPDF(filePath);
    } else {
      // Web环境：使用原有的文件上传逻辑
      if (!file) {
        throw new Error('File is required in web environment');
      }

      const formData = new FormData();
      formData.append('pdf', file);

      try {
        const response = await fetch(`${this.baseURL}/pdf/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ 
            success: false, 
            error: `Upload failed: ${response.status}` 
          }));
          throw new Error(errorData.error || 'Upload failed');
        }

        const result: APIResponse<PDFDocument> = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'Upload failed');
        }

        return result.data!;
      } catch (error) {
        console.error('Upload failed:', error);
        throw error;
      }
    }
  }

  /**
   * 验证 PDF 密码
   */
  async verifyPassword(documentId: string, password: string): Promise<{
    authenticated: boolean;
    pages?: any[];
    document?: PDFDocument;
  }> {
    if (this.isElectronEnv) {
      const authenticated = await window.electronAPI.verifyPassword(documentId, password);
      if (authenticated) {
                  // 等待一小段时间确保服务器端元数据更新完成
          await new Promise(resolve => setTimeout(resolve, 100));
          
          let documentInfo = await window.electronAPI.getPDFInfo(documentId);
          
          // 如果页面信息仍然为空，重试几次
          let retryCount = 0;
          while ((!documentInfo.pages || documentInfo.pages.length === 0) && retryCount < 3) {
            await new Promise(resolve => setTimeout(resolve, 200));
            documentInfo = await window.electronAPI.getPDFInfo(documentId);
            retryCount++;
          }
          
          // 确保返回的文档标记为已认证
          const authenticatedDocument = {
            ...documentInfo,
            isAuthenticated: true,
            needsPassword: false, // 已认证后不再需要密码
          };
        
        return {
          authenticated: true,
          pages: documentInfo.pages,
          document: authenticatedDocument,
        };
      }
      return { authenticated: false };
    } else {
      const response = await this.request<any>(`/pdf/${documentId}/verify-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });

      if (!response.success) {
        throw new Error(response.error || 'Password verification failed');
      }

      return response.data;
    }
  }

  /**
   * 获取文档信息
   */
  async getDocumentInfo(documentId: string): Promise<{
    document: PDFDocument;
    pages: any[];
  }> {
    if (this.isElectronEnv) {
      const documentInfo = await window.electronAPI.getPDFInfo(documentId);
      return {
        document: documentInfo,
        pages: documentInfo.pages,
      };
    } else {
      const response = await this.request<any>(`/pdf/${documentId}/info`);
      return response.data;
    }
  }

  /**
   * 渲染页面
   */
  async renderPage(
    documentId: string, 
    pageIndex: number, 
    renderOptions: RenderOptions
  ): Promise<Blob> {
    if (this.isElectronEnv) {
      const base64Data = await window.electronAPI.renderPage(documentId, pageIndex, renderOptions);
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      return new Blob([byteArray], { type: 'image/png' });
    } else {
      try {
        const response = await fetch(`${this.baseURL}/pdf/${documentId}/render`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ pageIndex, renderOptions }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ 
            error: `Render failed: ${response.status}` 
          }));
          throw new Error(errorData.error || 'Render failed');
        }

        return await response.blob();
      } catch (error) {
        console.error('Render failed:', error);
        throw error;
      }
    }
  }

  /**
   * 渲染页面预览
   */
  async renderPreview(
    documentId: string, 
    pageIndex: number, 
    maxWidth: number = 400, 
    maxHeight: number = 600
  ): Promise<Blob> {
    if (this.isElectronEnv) {
      // Electron环境：使用低DPI渲染作为预览
      const previewOptions = { dpi: 72, colorSpace: 'RGB' as const, format: 'PNG' as const };
      const base64Data = await window.electronAPI.renderPage(documentId, pageIndex, previewOptions);
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      return new Blob([byteArray], { type: 'image/png' });
    } else {
      // Web环境：使用原有的预览API
      try {
        const response = await fetch(`${this.baseURL}/pdf/${documentId}/preview`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ pageIndex, maxWidth, maxHeight }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ 
            error: `Preview failed: ${response.status}` 
          }));
          throw new Error(errorData.error || 'Preview failed');
        }

        return await response.blob();
      } catch (error) {
        console.error('Preview failed:', error);
        throw error;
      }
    }
  }

  /**
   * 处理图像
   */
  async processImage(
    documentId: string,
    pageIndex: number,
    renderOptions: RenderOptions,
    processingParams: ProcessingParams
  ): Promise<Blob> {
    if (this.isElectronEnv) {
      // Electron环境：先渲染，再处理
      const base64Data = await window.electronAPI.renderPage(documentId, pageIndex, renderOptions);
      const processedBase64 = await window.electronAPI.processImage(base64Data, processingParams);
      const byteCharacters = atob(processedBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      return new Blob([byteArray], { type: 'image/png' });
    } else {
      // Web环境：使用原有的处理API
      try {
        const response = await fetch(`${this.baseURL}/pdf/${documentId}/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ pageIndex, renderOptions, processingParams }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ 
            error: `Processing failed: ${response.status}` 
          }));
          throw new Error(errorData.error || 'Processing failed');
        }

        return await response.blob();
      } catch (error) {
        console.error('Processing failed:', error);
        throw error;
      }
    }
  }

  /**
   * 批量处理
   */
  async batchProcess(
    documentId: string,
    pageIndices: number[],
    renderOptions: RenderOptions,
    processingParams: ProcessingParams
  ): Promise<{
    processedCount: number;
    totalSize: number;
    memoryUsed: number;
  }> {
    if (this.isElectronEnv) {
      // Electron环境：简化批量处理，返回基本统计信息
      return {
        processedCount: pageIndices.length,
        totalSize: pageIndices.length * 1024 * 1024, // 估算值
        memoryUsed: pageIndices.length * 512 * 1024, // 估算值
      };
    } else {
      // Web环境：使用原有的批量处理API
      const response = await this.request<any>(`/pdf/${documentId}/batch-process`, {
        method: 'POST',
        body: JSON.stringify({ pageIndices, renderOptions, processingParams }),
      });

      return response.data;
    }
  }

  /**
   * 导出 PDF
   */
  async exportPDF(
    documentId: string,
    pageIndices: number[],
    renderOptions: RenderOptions,
    processingParams: ProcessingParams,
    metadata?: {
      title?: string;
      author?: string;
      subject?: string;
    },
    ccccDisabled?: boolean
  ): Promise<Blob> {
    if (this.isElectronEnv) {
      // Electron环境：处理页面并导出
      try {
        const documentInfo = await window.electronAPI.getPDFInfo(documentId);
        const processedPages = [];

        for (const pageIndex of pageIndices) {
          const pageBounds = documentInfo.pages[pageIndex];
          
          // 渲染页面
          const originalImageBase64 = await window.electronAPI.renderPage(documentId, pageIndex, renderOptions);
          
          // 处理页面（如果需要）
          let processedImageBase64 = null;
          const needsProcessing = processingParams.grayscale || 
                                processingParams.contrast !== 1.0 || 
                                processingParams.brightness !== 0 || 
                                processingParams.threshold > 0 ||
                                processingParams.sharpen.sigma > 0 ||
                                processingParams.denoise ||
                                processingParams.gamma !== 1.0;

          if (needsProcessing) {
            processedImageBase64 = await window.electronAPI.processImage(originalImageBase64, processingParams);
          }

          processedPages.push({
            pageIndex,
            bounds: pageBounds,
            originalImage: originalImageBase64 as any, // 类型转换：主进程期望base64字符串
            processedImage: processedImageBase64 as any,
            renderOptions,
            processingParams,
          });
        }

        // 使用保存对话框
        const defaultName = `${documentInfo.filename}_processed.pdf`;
        const result = await window.electronAPI.saveFileDialog(defaultName, 'PDF');
        if (result.canceled || !result.filePath) {
          throw new Error('Export cancelled');
        }

        // 导出PDF
        await window.electronAPI.exportPDF(processedPages, result.filePath);
        
        // 返回空Blob（在Electron中文件已直接保存）
        return new Blob([], { type: 'application/pdf' });
      } catch (error) {
        console.error('Export failed:', error);
        throw error;
      }
    } else {
      // Web环境：使用原有的导出API
      try {
        const response = await fetch(`${this.baseURL}/pdf/${documentId}/export`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            pageIndices, 
            renderOptions, 
            processingParams,
            metadata,
            ccccDisabled
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ 
            error: `Export failed: ${response.status}` 
          }));
          throw new Error(errorData.error || 'Export failed');
        }

        return await response.blob();
      } catch (error) {
        console.error('Export failed:', error);
        throw error;
      }
    }
  }

  /**
   * 获取推荐设置
   */
  async getRecommendations(
    documentId: string,
    pageIndex: number,
    purpose: 'web' | 'print' | 'archive' | 'email' = 'web'
  ): Promise<{
    renderOptions: RenderOptions;
    processingParams: ProcessingParams;
    exportSettings: any;
  }> {
    if (this.isElectronEnv) {
      // Electron环境：提供默认推荐设置
      const dpiMap = { web: 72, print: 300, archive: 150, email: 72 };
      return {
        renderOptions: {
          dpi: dpiMap[purpose],
          colorSpace: 'RGB',
          format: 'PNG',
        },
        processingParams: {
          grayscale: purpose === 'email',
          contrast: 1.1,
          brightness: 0,
          threshold: 0,
          sharpen: { sigma: 1.0, flat: 1, jagged: 2 },
          denoise: false,
          gamma: 1.0,
          colorReplace: {
            enabled: false,
            targetColor: [224, 224, 224],
            replaceColor: [255, 255, 255],
            tolerance: 10
          }
        },
        exportSettings: { purpose }
      };
    } else {
      // Web环境：使用原有的推荐API
      const response = await this.request<any>(`/pdf/${documentId}/recommendations`, {
        method: 'POST',
        body: JSON.stringify({ pageIndex, purpose }),
      });

      return response.data;
    }
  }

  /**
   * 关闭文档
   */
  async closeDocument(documentId: string): Promise<void> {
    if (this.isElectronEnv) {
      await window.electronAPI.closePDF(documentId);
    } else {
      await this.request(`/pdf/${documentId}`, {
        method: 'DELETE',
      });
    }
  }

  /**
   * 清理所有资源
   */
  async cleanup(): Promise<void> {
    if (this.isElectronEnv) {
      // Electron环境：清理不是必需的，主进程会管理资源
      return;
    } else {
      await this.request('/admin/cleanup', {
        method: 'POST',
      });
    }
  }

  /**
   * 创建对象 URL（用于显示图像）
   */
  createObjectURL(blob: Blob): string {
    return URL.createObjectURL(blob);
  }

  /**
   * 释放对象 URL
   */
  revokeObjectURL(url: string): void {
    URL.revokeObjectURL(url);
  }

  /**
   * 下载文件
   */
  async downloadBlob(blob: Blob, filename: string): Promise<void> {
    if (this.isElectronEnv) {
      // Electron环境：使用保存对话框
      const result = await window.electronAPI.saveFileDialog(filename, filename.split('.').pop() || 'PDF');
      if (!result.canceled && result.filePath) {
        // 将Blob转换为ArrayBuffer然后保存
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // 这里需要通过IPC保存文件
        await this.saveFileToPath(buffer, result.filePath);
      }
    } else {
      // Web环境：使用原有的下载逻辑
      const url = this.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.revokeObjectURL(url);
    }
  }

  /**
   * Electron环境专用：保存文件到指定路径
   */
  private async saveFileToPath(_buffer: Buffer, filePath: string): Promise<void> {
    if (this.isElectronEnv) {
      // 这里可以通过IPC调用主进程保存文件
      // 暂时使用showItemInFolder作为占位符
      window.electronAPI.showItemInFolder(filePath);
    }
  }

  /**
   * Electron环境专用：获取应用版本
   */
  async getAppVersion(): Promise<string> {
    if (this.isElectronEnv) {
      return await window.electronAPI.getAppVersion();
    }
    return 'Web Version';
  }

  /**
   * Electron环境专用：显示文件在文件夹中
   */
  showItemInFolder(filePath: string): void {
    if (this.isElectronEnv) {
      window.electronAPI.showItemInFolder(filePath);
    }
  }

  /**
   * Electron环境专用：切换开发者工具
   */
  toggleDevTools(): void {
    if (this.isElectronEnv) {
      window.electronAPI.toggleDevTools();
    }
  }

  /**
   * 错误处理辅助方法
   */
  handleError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

// 创建全局 API 客户端实例
export const apiClient = new APIClient();

export default APIClient;
