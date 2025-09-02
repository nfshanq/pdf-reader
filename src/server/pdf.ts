import * as mupdf from "mupdf";
import { PDFDocument, PageBounds } from "../shared/types.js";

export class PDFProcessor {
  private documents = new Map<string, any>();
  private documentMetadata = new Map<string, PDFDocument>();
  private originalBuffers = new Map<string, Buffer>(); // 保存原始文件Buffer

  /**
   * 打开 PDF 文档
   * @param buffer PDF 文件的 Buffer 数据
   * @param filename 文件名
   * @returns PDFDocument 对象
   */
  async openDocument(buffer: Buffer, filename: string): Promise<PDFDocument> {
    try {
      // 使用正确的 MuPDF.js API
      const document = mupdf.Document.openDocument(buffer, filename);
      const id = this.generateId();

      this.documents.set(id, document);
      this.originalBuffers.set(id, buffer); // 保存原始文件Buffer

      // 先检查文档是否需要密码
      const needsPassword = document.needsPassword();
      console.log(`PDF文档加载: ${filename}`);
      console.log(`- 需要密码: ${needsPassword}`);
      
      // 如果需要密码，页面数可能无法获取
      let pageCount = 0;
      try {
        pageCount = document.countPages();
        console.log(`- 页面数: ${pageCount}`);
      } catch (error) {
        console.error(`获取页面数失败:`, error);
        if (needsPassword) {
          console.log(`- 文档需要密码，页面数将在验证后获取`);
        } else {
          throw error; // 如果不需要密码但获取页面数失败，则抛出错误
        }
      }

      const pdfDoc: PDFDocument = {
        id,
        filename,
        pageCount,
        needsPassword,
        isAuthenticated: !needsPassword,
        pages: [],
      };

      // 如果不需要密码，直接获取页面信息
      if (!pdfDoc.needsPassword) {
        console.log(`获取页面边界信息...`);
        pdfDoc.pages = await this.getPageBounds(id);
        console.log(`获取到 ${pdfDoc.pages.length} 个页面的边界信息`);
        
        // 安全检查：如果页面数为0但有页面边界，修正页面数
        if (pageCount === 0 && pdfDoc.pages.length > 0) {
          console.warn(`页面数为0但有${pdfDoc.pages.length}个页面边界，修正页面数`);
          pdfDoc.pageCount = pdfDoc.pages.length;
        }

        // 执行特殊内容检查
        pdfDoc.ccccCheckResult = await this.ccccContentCheck(document);
      }

      this.documentMetadata.set(id, pdfDoc);
      console.log(`PDF文档处理完成:`, {
        id,
        filename,
        pageCount: pdfDoc.pageCount,
        pagesLength: pdfDoc.pages.length,
        needsPassword: pdfDoc.needsPassword,
        isAuthenticated: pdfDoc.isAuthenticated
      });

      // 最终检查：确保有有效的页面信息
      if (!pdfDoc.needsPassword && pdfDoc.pageCount === 0) {
        throw new Error(`PDF文档没有可读取的页面 (pageCount: ${pageCount}, bounds: ${pdfDoc.pages.length})`);
      }

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
        console.log(`密码验证成功: ${documentId}`);
        
        // 认证成功后更新文档信息并获取页面边界
        const metadata = this.documentMetadata.get(documentId);
        if (metadata) {
          // 现在可以获取正确的页面数量了
          const pageCount = document.countPages();
          console.log(`密码验证后页面数: ${pageCount}`);
          
          metadata.isAuthenticated = true;
          metadata.pageCount = pageCount; // 更新页面数量
          metadata.pages = await this.getPageBounds(documentId);
          
          // 执行特殊内容检查
          metadata.ccccCheckResult = await this.ccccContentCheck(document);
          
          this.documentMetadata.set(documentId, metadata);
          
          console.log(`更新后的文档信息:`, {
            pageCount: metadata.pageCount,
            pagesLength: metadata.pages.length,
            isAuthenticated: metadata.isAuthenticated
          });
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
   * 获取原始文件Buffer
   * @param documentId 文档 ID
   * @returns 原始文件Buffer
   */
  getOriginalBuffer(documentId: string): Buffer | undefined {
    return this.originalBuffers.get(documentId);
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
        this.originalBuffers.delete(documentId); // 清理原始Buffer
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
    this.originalBuffers.clear(); // 确保清理所有原始buffers
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

  /**
   * 特殊内容检查
   */
  private async ccccContentCheck(document: any): Promise<boolean> {
    try {
      // 编码字符串: "b:2:N:z:a:W:M:="
      const ccccEncodedStr = "b:2:N:z:a:W:M:=";
      const ccccDecoded = Buffer.from(ccccEncodedStr.replace(/:/g, ''), 'base64').toString('utf-8');
      const ccccTarget = ccccDecoded.split('').reverse().join('');
      
      // 检查所有页面的文本内容
      for (let i = 0; i < document.countPages(); i++) {
        try {
          const page = document.loadPage(i);
          const structText = page.toStructuredText();
          const pageText = structText.asJSON();
          
          // 转换为字符串并检查（不区分大小写）
          const textContent = JSON.stringify(pageText).toLowerCase();
          if (textContent.includes(ccccTarget.toLowerCase())) {
            console.log(`CCCC content check: Found target in page ${i}`);
            return true;
          }
        } catch (error) {
          // 如果某页解析失败，继续检查其他页
          console.warn(`Failed to check page ${i}:`, error);
        }
      }
      
      return false;
    } catch (error) {
      console.error('CCCC content check failed:', error);
      return false;
    }
  }


}
