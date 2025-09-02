import { ProcessedPage, ProgressCallback } from "../shared/types.js";
import { PDFDocument as PDFLibDocument } from "pdf-lib";

export class PDFExporter {

  /**
   * 导出处理后的 PDF
   * @param pages 处理后的页面数据数组
   * @returns PDF Buffer
   */
  async exportProcessedPDF(pages: ProcessedPage[]): Promise<Buffer> {
    try {
      console.log(`Starting PDF export with ${pages.length} pages`);

      const pdfDoc = await PDFLibDocument.create();

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const { width_pt, height_pt } = page.bounds;

        console.log(`Adding page ${i + 1}: ${width_pt} x ${height_pt} pt`);

        // 严格使用原始页面尺寸 - 这是关键要求
        const pdfPage = pdfDoc.addPage([width_pt, height_pt]);

        // 嵌入处理后的图像（优先使用处理后的，否则使用原始的）
        const imageToEmbed = page.processedImage || page.originalImage;
        
        if (!imageToEmbed) {
          throw new Error(`No image data available for page ${page.pageIndex}`);
        }

        try {
          // 尝试作为 PNG 嵌入
          const embeddedImage = await pdfDoc.embedPng(imageToEmbed);

          // 绘制图像，完全覆盖页面，保持原始页面尺寸
          pdfPage.drawImage(embeddedImage, {
            x: 0,
            y: 0,
            width: width_pt,
            height: height_pt,
          });

          console.log(`Page ${i + 1} embedded successfully`);

        } catch (pngError) {
          // 如果 PNG 嵌入失败，尝试作为 JPEG
          const pngMessage = pngError instanceof Error ? pngError.message : String(pngError);
          console.warn(`PNG embed failed for page ${i + 1}, trying JPEG:`, pngMessage);
          
          try {
            const embeddedImage = await pdfDoc.embedJpg(imageToEmbed);
            pdfPage.drawImage(embeddedImage, {
              x: 0,
              y: 0,
              width: width_pt,
              height: height_pt,
            });

            console.log(`Page ${i + 1} embedded as JPEG`);
          } catch (jpegError) {
            console.error(`Failed to embed page ${i + 1} as both PNG and JPEG:`, jpegError);
            const jpegMessage = jpegError instanceof Error ? jpegError.message : String(jpegError);
            throw new Error(`Failed to embed image for page ${page.pageIndex}: ${jpegMessage}`);
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const resultBuffer = Buffer.from(pdfBytes);

      console.log(`PDF export completed: ${resultBuffer.length} bytes`);
      return resultBuffer;

    } catch (error) {
      console.error("Failed to export PDF:", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to export PDF: ${message}`);
    }
  }

  /**
   * 导出单个页面
   * @param pageData 页面数据
   * @param outputFormat 输出格式
   * @returns 输出 Buffer
   */
  async exportSinglePage(
    pageData: ProcessedPage,
    outputFormat: "PDF" | "PNG" | "JPEG" = "PDF"
  ): Promise<Buffer> {
    
    if (outputFormat === "PDF") {
      return this.exportProcessedPDF([pageData]);
    }

    // 返回图像数据
    const imageBuffer = pageData.processedImage || pageData.originalImage;
    if (!imageBuffer) {
      throw new Error(`No image data available for page ${pageData.pageIndex}`);
    }

    return imageBuffer;
  }

  /**
   * 分批导出（用于大文件）
   * @param pages 页面数据数组
   * @param batchSize 每批的页面数
   * @param onProgress 进度回调
   * @returns PDF Buffer 数组
   */
  async exportInBatches(
    pages: ProcessedPage[],
    batchSize: number = 50,
    onProgress?: ProgressCallback
  ): Promise<Buffer[]> {
    const results: Buffer[] = [];
    const totalBatches = Math.ceil(pages.length / batchSize);

    console.log(`Exporting ${pages.length} pages in ${totalBatches} batches of ${batchSize}`);

    for (let i = 0; i < pages.length; i += batchSize) {
      const batch = pages.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize);
      
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (pages ${i + 1}-${Math.min(i + batchSize, pages.length)})`);
      
      try {
        const batchPDF = await this.exportProcessedPDF(batch);
        results.push(batchPDF);

        if (onProgress) {
          onProgress(batchIndex + 1, totalBatches);
        }

        console.log(`Batch ${batchIndex + 1} completed: ${batchPDF.length} bytes`);
      } catch (error) {
        console.error(`Failed to export batch ${batchIndex + 1}:`, error);
        throw error;
      }
    }

    console.log(`Batch export completed: ${results.length} PDF files`);
    return results;
  }

  /**
   * 合并多个 PDF 文件
   * @param pdfBuffers PDF Buffer 数组
   * @returns 合并后的 PDF Buffer
   */
  async mergePDFs(pdfBuffers: Buffer[]): Promise<Buffer> {
    try {
      console.log(`Merging ${pdfBuffers.length} PDF files`);

      const mergedPdf = await PDFLibDocument.create();

      for (let i = 0; i < pdfBuffers.length; i++) {
        const pdfToMerge = await PDFLibDocument.load(pdfBuffers[i]);
        const pageCount = pdfToMerge.getPageCount();
        
        console.log(`Merging PDF ${i + 1}: ${pageCount} pages`);

        // 复制所有页面
        const pageIndices = Array.from({ length: pageCount }, (_, idx) => idx);
        const copiedPages = await mergedPdf.copyPages(pdfToMerge, pageIndices);

        copiedPages.forEach(page => mergedPdf.addPage(page));
      }

      const mergedBytes = await mergedPdf.save();
      const resultBuffer = Buffer.from(mergedBytes);

      console.log(`PDF merge completed: ${resultBuffer.length} bytes`);
      return resultBuffer;

    } catch (error) {
      console.error("Failed to merge PDFs:", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to merge PDFs: ${message}`);
    }
  }

  /**
   * 计算导出文件的预估大小
   * @param pages 页面数据数组
   * @returns 预估大小（字节）
   */
  estimateOutputSize(pages: ProcessedPage[]): number {
    let totalSize = 0;

    // PDF 基础结构开销（每页约 1KB）
    totalSize += pages.length * 1024;

    // 图像数据大小
    for (const page of pages) {
      const imageSize =
        page.processedImage?.length || page.originalImage.length;
      totalSize += imageSize;
    }

    // PDF 压缩和元数据开销（约 10%）
    totalSize = Math.floor(totalSize * 1.1);

    console.log(`Estimated output size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    return totalSize;
  }

  /**
   * 验证页面数据的完整性
   * @param pages 页面数据数组
   * @returns 验证结果
   */
  validatePagesData(pages: ProcessedPage[]): { 
    valid: boolean; 
    errors: string[]; 
    warnings: string[] 
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (pages.length === 0) {
      errors.push("No pages provided for export");
      return { valid: false, errors, warnings };
    }

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];

      // 检查页面索引
      if (typeof page.pageIndex !== 'number' || page.pageIndex < 0) {
        errors.push(`Invalid page index for page ${i}: ${page.pageIndex}`);
      }

      // 检查页面边界
      if (!page.bounds || typeof page.bounds.width_pt !== 'number' || typeof page.bounds.height_pt !== 'number') {
        errors.push(`Invalid page bounds for page ${i}`);
      } else {
        if (page.bounds.width_pt <= 0 || page.bounds.height_pt <= 0) {
          errors.push(`Invalid page dimensions for page ${i}: ${page.bounds.width_pt} x ${page.bounds.height_pt}`);
        }
        if (page.bounds.width_pt > 14400 || page.bounds.height_pt > 14400) { // 200 inches at 72 DPI
          warnings.push(`Very large page dimensions for page ${i}: ${page.bounds.width_pt} x ${page.bounds.height_pt} pt`);
        }
      }

      // 检查图像数据
      if (!page.originalImage) {
        errors.push(`Missing original image data for page ${i}`);
      } else if (page.originalImage.length === 0) {
        errors.push(`Empty original image data for page ${i}`);
      }

      // 检查处理后图像（如果存在）
      if (page.processedImage && page.processedImage.length === 0) {
        warnings.push(`Empty processed image data for page ${i}, will use original`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 添加 PDF 元数据
   * @param pages 页面数据
   * @param metadata 元数据选项
   * @returns 包含元数据的 PDF Buffer
   */
  async exportWithMetadata(
    pages: ProcessedPage[],
    metadata: {
      title?: string;
      author?: string;
      subject?: string;
      creator?: string;
      producer?: string;
      keywords?: string[];
    } = {}
  ): Promise<Buffer> {
    try {
      console.log("Exporting PDF with metadata:", metadata);

      const pdfDoc = await PDFLibDocument.create();

      // 设置元数据
      if (metadata.title) pdfDoc.setTitle(metadata.title);
      if (metadata.author) pdfDoc.setAuthor(metadata.author);
      if (metadata.subject) pdfDoc.setSubject(metadata.subject);
      if (metadata.creator) pdfDoc.setCreator(metadata.creator);
      if (metadata.producer) pdfDoc.setProducer(metadata.producer);
      if (metadata.keywords) pdfDoc.setKeywords(metadata.keywords);

      // 设置创建和修改时间
      const now = new Date();
      pdfDoc.setCreationDate(now);
      pdfDoc.setModificationDate(now);

      // 添加页面（复用现有逻辑）
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const { width_pt, height_pt } = page.bounds;

        const pdfPage = pdfDoc.addPage([width_pt, height_pt]);
        const imageToEmbed = page.processedImage || page.originalImage;
        
        const embeddedImage = await pdfDoc.embedPng(imageToEmbed);
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
      console.error("Failed to export PDF with metadata:", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to export PDF with metadata: ${message}`);
    }
  }

  /**
   * 获取导出格式的推荐设置
   * @param purpose 导出目的
   * @param pageCount 页面数量
   * @returns 推荐设置
   */
  getRecommendedExportSettings(
    purpose: "print" | "web" | "archive" | "email",
    pageCount: number
  ): {
    format: "PDF";
    compression: boolean;
    batchSize: number;
    metadata: boolean;
  } {
    switch (purpose) {
      case "print":
        return {
          format: "PDF",
          compression: false,
          batchSize: pageCount > 100 ? 25 : 50,
          metadata: true
        };
      case "web":
        return {
          format: "PDF",
          compression: true,
          batchSize: 50,
          metadata: false
        };
      case "archive":
        return {
          format: "PDF",
          compression: false,
          batchSize: pageCount > 200 ? 20 : 50,
          metadata: true
        };
      case "email":
        return {
          format: "PDF",
          compression: true,
          batchSize: Math.min(20, pageCount),
          metadata: false
        };
      default:
        return {
          format: "PDF",
          compression: false,
          batchSize: 50,
          metadata: true
        };
    }
  }

  /**
   * 清理导出资源
   */
  cleanup(): void {
    // PDF-lib 会自动管理内存
    console.log("PDFExporter cleanup completed");
  }
}
