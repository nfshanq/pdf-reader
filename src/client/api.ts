import { PDFDocument, RenderOptions, ProcessingParams, APIResponse } from '@shared/types';

class APIClient {
  private baseURL: string;

  constructor(baseURL: string = '/api') {
    this.baseURL = baseURL;
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
    const response = await this.request<any>('/health');
    return response.data;
  }

  /**
   * 上传 PDF 文件
   */
  async uploadPDF(file: File): Promise<PDFDocument> {
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

  /**
   * 验证 PDF 密码
   */
  async verifyPassword(documentId: string, password: string): Promise<{
    authenticated: boolean;
    pages?: any[];
    document?: PDFDocument;
  }> {
    const response = await this.request<any>(`/pdf/${documentId}/verify-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });

    if (!response.success) {
      throw new Error(response.error || 'Password verification failed');
    }

    return response.data;
  }

  /**
   * 获取文档信息
   */
  async getDocumentInfo(documentId: string): Promise<{
    document: PDFDocument;
    pages: any[];
  }> {
    const response = await this.request<any>(`/pdf/${documentId}/info`);
    return response.data;
  }

  /**
   * 渲染页面
   */
  async renderPage(
    documentId: string, 
    pageIndex: number, 
    renderOptions: RenderOptions
  ): Promise<Blob> {
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

  /**
   * 渲染页面预览
   */
  async renderPreview(
    documentId: string, 
    pageIndex: number, 
    maxWidth: number = 400, 
    maxHeight: number = 600
  ): Promise<Blob> {
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

  /**
   * 处理图像
   */
  async processImage(
    documentId: string,
    pageIndex: number,
    renderOptions: RenderOptions,
    processingParams: ProcessingParams
  ): Promise<Blob> {
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
    const response = await this.request<any>(`/pdf/${documentId}/batch-process`, {
      method: 'POST',
      body: JSON.stringify({ pageIndices, renderOptions, processingParams }),
    });

    return response.data;
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
    }
  ): Promise<Blob> {
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
          metadata 
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
    const response = await this.request<any>(`/pdf/${documentId}/recommendations`, {
      method: 'POST',
      body: JSON.stringify({ pageIndex, purpose }),
    });

    return response.data;
  }

  /**
   * 关闭文档
   */
  async closeDocument(documentId: string): Promise<void> {
    await this.request(`/pdf/${documentId}`, {
      method: 'DELETE',
    });
  }

  /**
   * 清理所有资源
   */
  async cleanup(): Promise<void> {
    await this.request('/admin/cleanup', {
      method: 'POST',
    });
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
  downloadBlob(blob: Blob, filename: string): void {
    const url = this.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.revokeObjectURL(url);
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
