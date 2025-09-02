import * as mupdf from "mupdf";
import { PDFDocument, PageBounds } from "@shared/types";

export class PDFProcessor {
  private documents = new Map<string, any>();
  private documentMetadata = new Map<string, PDFDocument>();

  /**
   * 打开 PDF 文档
   * @param buffer PDF 文件的 Buffer 数据
   * @param filename 文件名
   * @returns PDFDocument 对象
   */
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

      this.documentMetadata.set(id, pdfDoc);
      return pdfDoc;
    } catch (error) {
      console.error("Failed to open PDF document:", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to open PDF: ${message}`);
    }
  }

  /**
   * 验证 PDF 密码
   * @param documentId 文档 ID
   * @param password 密码
   * @returns 验证是否成功
   */
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
        // 认证成功后更新文档信息并获取页面边界
        const metadata = this.documentMetadata.get(documentId);
        if (metadata) {
          metadata.isAuthenticated = true;
          metadata.pages = await this.getPageBounds(documentId);
          this.documentMetadata.set(documentId, metadata);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("Password authentication failed:", error);
      return false;
    }
  }

  /**
   * 获取所有页面的边界信息
   * @param documentId 文档 ID
   * @returns 页面边界数组
   */
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

        console.log(`Page ${i}: ${x1 - x0} x ${y1 - y0} pt`);
      } catch (error) {
        console.error(`Failed to get bounds for page ${i}:`, error);
        // 使用 A4 默认尺寸作为回退
        bounds.push({
          x0: 0,
          y0: 0,
          x1: 595.28,
          y1: 841.89,
          width_pt: 595.28,
          height_pt: 841.89,
        });
      }
    }

    return bounds;
  }

  /**
   * 获取单个页面的边界信息
   * @param documentId 文档 ID
   * @param pageIndex 页面索引
   * @returns 页面边界
   */
  async getPageBound(documentId: string, pageIndex: number): Promise<PageBounds> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error("Document not found");
    }

    try {
      const page = document.loadPage(pageIndex);
      const [x0, y0, x1, y1] = page.getBounds();

      return {
        x0,
        y0,
        x1,
        y1,
        width_pt: x1 - x0,
        height_pt: y1 - y0,
      };
          } catch (error) {
        console.error(`Failed to get bounds for page ${pageIndex}:`, error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get page bounds: ${message}`);
      }
  }

  /**
   * 获取页面的结构化文本
   * @param documentId 文档 ID
   * @param pageIndex 页面索引
   * @returns 文本内容
   */
  async getPageText(documentId: string, pageIndex: number): Promise<string> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error("Document not found");
    }

    try {
      const page = document.loadPage(pageIndex);
      const structuredText = page.toStructuredText();
      return structuredText.asText();
    } catch (error) {
      console.error(`Failed to extract text from page ${pageIndex}:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to extract text: ${message}`);
    }
  }

  /**
   * 获取页面的 JSON 格式结构化文本
   * @param documentId 文档 ID
   * @param pageIndex 页面索引
   * @returns JSON 结构化文本
   */
  async getPageStructuredText(documentId: string, pageIndex: number): Promise<any> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error("Document not found");
    }

    try {
      const page = document.loadPage(pageIndex);
      const structuredText = page.toStructuredText("preserve-whitespace");
      return JSON.parse(structuredText.asJSON());
    } catch (error) {
      console.error(`Failed to extract structured text from page ${pageIndex}:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to extract structured text: ${message}`);
    }
  }

  /**
   * 获取文档对象（用于其他模块）
   * @param documentId 文档 ID
   * @returns MuPDF 文档对象
   */
  getDocument(documentId: string) {
    return this.documents.get(documentId);
  }

  /**
   * 获取文档元数据
   * @param documentId 文档 ID
   * @returns 文档元数据
   */
  getDocumentMetadata(documentId: string): PDFDocument | undefined {
    return this.documentMetadata.get(documentId);
  }

  /**
   * 检查文档是否存在且已认证
   * @param documentId 文档 ID
   * @returns 是否可用
   */
  isDocumentReady(documentId: string): boolean {
    const document = this.documents.get(documentId);
    const metadata = this.documentMetadata.get(documentId);
    return !!(document && metadata && metadata.isAuthenticated);
  }

  /**
   * 关闭并清理文档
   * @param documentId 文档 ID
   */
  closeDocument(documentId: string): void {
    try {
      const document = this.documents.get(documentId);
      if (document) {
        // MuPDF.js 不需要显式关闭，但我们清理引用
        this.documents.delete(documentId);
        this.documentMetadata.delete(documentId);
        console.log(`Document ${documentId} closed and cleaned up`);
      }
    } catch (error) {
      console.error(`Failed to close document ${documentId}:`, error);
    }
  }

  /**
   * 清理所有文档
   */
  closeAllDocuments(): void {
    for (const documentId of this.documents.keys()) {
      this.closeDocument(documentId);
    }
  }

  /**
   * 获取当前打开的文档数量
   */
  getOpenDocumentCount(): number {
    return this.documents.size;
  }

  /**
   * 生成唯一文档 ID
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `pdf_${timestamp}_${random}`;
  }


}
