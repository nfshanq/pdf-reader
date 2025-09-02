import * as mupdf from "mupdf";
import { RenderOptions, PageBounds, ProgressCallback } from "../shared/types.js";

export class PageRenderer {
  
  /**
   * 渲染单个 PDF 页面为位图
   * @param document MuPDF 文档对象
   * @param pageIndex 页面索引
   * @param bounds 页面边界信息
   * @param options 渲染选项
   * @returns 图像 Buffer
   */
  async renderPage(
    document: any,
    pageIndex: number,
    bounds: PageBounds,
    options: RenderOptions
  ): Promise<Buffer> {
    try {
      const page = document.loadPage(pageIndex);

      // 使用正确的 MuPDF.js Matrix API - 严格按照文档
      const scale = options.dpi / 72;
      const matrix = mupdf.Matrix.scale(scale, scale);

      // 使用正确的 ColorSpace API
      const colorSpace = options.colorSpace === "Gray" 
        ? mupdf.ColorSpace.DeviceGray 
        : mupdf.ColorSpace.DeviceRGB;

      console.log(`Rendering page ${pageIndex}: ${bounds.width_pt} x ${bounds.height_pt} pt @ ${options.dpi} DPI`);
      console.log(`Pixel size: ${Math.floor(bounds.width_pt * scale)} x ${Math.floor(bounds.height_pt * scale)} px`);

      // 按照文档规范：toPixmap(matrix, colorSpace, alpha, showAnnotations)
      const pixmap = page.toPixmap(matrix, colorSpace, false, true);

      // 导出为指定格式
      if (options.format === "PNG") {
        return Buffer.from(pixmap.asPNG());
      } else if (options.format === "JPEG") {
        // 对于 JPEG，我们需要先获取 PNG，然后可能需要用 sharp 转换
        // 目前先返回 PNG，后续可以在图像处理模块中转换
        return Buffer.from(pixmap.asPNG());
      } else {
        throw new Error(`Unsupported format: ${options.format}`);
      }

    } catch (error) {
      console.error(`Failed to render page ${pageIndex}:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to render page ${pageIndex}: ${message}`);
    }
  }

  /**
   * 计算给定 DPI 下的像素尺寸
   * @param bounds 页面边界
   * @param dpi DPI 值
   * @returns 像素尺寸
   */
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

  /**
   * 批量渲染多个页面
   * @param document MuPDF 文档对象
   * @param pages 页面信息数组
   * @param options 渲染选项
   * @param onProgress 进度回调
   * @returns 图像 Buffer 数组
   */
  async renderPageBatch(
    document: any,
    pages: Array<{ index: number; bounds: PageBounds }>,
    options: RenderOptions,
    onProgress?: ProgressCallback
  ): Promise<Buffer[]> {
    const results: Buffer[] = [];

    console.log(`Starting batch render of ${pages.length} pages at ${options.dpi} DPI`);

    for (let i = 0; i < pages.length; i++) {
      const { index, bounds } = pages[i];
      
      try {
        const buffer = await this.renderPage(document, index, bounds, options);
        results.push(buffer);

        if (onProgress) {
          onProgress(i + 1, pages.length);
        }

        console.log(`Rendered page ${index} (${i + 1}/${pages.length})`);
      } catch (error) {
        console.error(`Failed to render page ${index}:`, error);
        // 继续渲染其他页面，但记录错误
        throw error;
      }
    }

    console.log(`Batch render completed: ${results.length} pages`);
    return results;
  }

  /**
   * 渲染页面的预览版本（低分辨率）
   * @param document MuPDF 文档对象
   * @param pageIndex 页面索引
   * @param bounds 页面边界
   * @param maxWidth 最大宽度（像素）
   * @param maxHeight 最大高度（像素）
   * @returns 预览图像 Buffer
   */
  async renderPagePreview(
    document: any,
    pageIndex: number,
    bounds: PageBounds,
    maxWidth: number = 400,
    maxHeight: number = 600
  ): Promise<Buffer> {
    try {
      // 计算合适的 DPI 以满足尺寸限制
      const scaleX = maxWidth / bounds.width_pt;
      const scaleY = maxHeight / bounds.height_pt;
      const scale = Math.min(scaleX, scaleY, 2.0); // 最大 2 倍缩放
      const previewDPI = Math.max(72 * scale, 72); // 最小 72 DPI

      const previewOptions: RenderOptions = {
        dpi: previewDPI,
        colorSpace: "RGB",
        format: "PNG"
      };

      console.log(`Rendering preview for page ${pageIndex}: DPI=${previewDPI}`);
      return await this.renderPage(document, pageIndex, bounds, previewOptions);

    } catch (error) {
      console.error(`Failed to render preview for page ${pageIndex}:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to render preview: ${message}`);
    }
  }

  /**
   * 估算渲染内存使用量
   * @param bounds 页面边界
   * @param options 渲染选项
   * @returns 估算的内存使用量（字节）
   */
  estimateMemoryUsage(bounds: PageBounds, options: RenderOptions): number {
    const pixelSize = this.calculatePixelSize(bounds, options.dpi);
    const channels = options.colorSpace === "Gray" ? 1 : 3;
    const bytesPerPixel = channels + 1; // RGB + Alpha 或 Gray + Alpha
    
    const pixelDataSize = pixelSize.width * pixelSize.height * bytesPerPixel;
    const compressionOverhead = 1.5; // 压缩前的临时数据
    
    return Math.floor(pixelDataSize * compressionOverhead);
  }

  /**
   * 检查渲染是否可行（内存和性能考虑）
   * @param bounds 页面边界数组
   * @param options 渲染选项
   * @param maxMemoryMB 最大内存限制（MB）
   * @returns 是否可行及建议
   */
  checkRenderFeasibility(
    bounds: PageBounds[],
    options: RenderOptions,
    maxMemoryMB: number = 500
  ): { feasible: boolean; estimatedMemoryMB: number; suggestions?: string[] } {
    const totalMemory = bounds.reduce((sum, bound) => {
      return sum + this.estimateMemoryUsage(bound, options);
    }, 0);

    const estimatedMemoryMB = totalMemory / (1024 * 1024);
    const feasible = estimatedMemoryMB <= maxMemoryMB;

    const suggestions: string[] = [];
    if (!feasible) {
      if (options.dpi > 150) {
        suggestions.push(`Consider reducing DPI from ${options.dpi} to 150 or lower`);
      }
      if (bounds.length > 50) {
        suggestions.push("Consider batch processing for large documents");
      }
      if (options.colorSpace === "RGB") {
        suggestions.push("Consider using grayscale to reduce memory usage");
      }
    }

    return {
      feasible,
      estimatedMemoryMB: Math.round(estimatedMemoryMB * 100) / 100,
      suggestions: suggestions.length > 0 ? suggestions : undefined
    };
  }

  /**
   * 获取推荐的渲染 DPI
   * @param bounds 页面边界
   * @param purpose 渲染目的
   * @returns 推荐的 DPI 值
   */
  getRecommendedDPI(
    bounds: PageBounds,
    purpose: "preview" | "print" | "archive" | "web"
  ): number {
    const pageArea = bounds.width_pt * bounds.height_pt; // 页面面积（平方点）
    const isLargePage = pageArea > 500000; // 大约 A3 尺寸

    switch (purpose) {
      case "preview":
        return isLargePage ? 72 : 96;
      case "web":
        return isLargePage ? 96 : 120;
      case "print":
        return isLargePage ? 150 : 200;
      case "archive":
        return isLargePage ? 200 : 300;
      default:
        return 150;
    }
  }

  /**
   * 清理渲染资源（如果需要）
   */
  cleanup(): void {
    // MuPDF.js 通常会自动管理内存，但我们可以在这里添加清理逻辑
    console.log("PageRenderer cleanup completed");
  }
}
