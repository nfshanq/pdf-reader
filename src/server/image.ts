import sharp from "sharp";
import { ProcessingParams, ProgressCallback } from "../shared/types.js";

export class ImageProcessor {

  /**
   * 处理单个图像
   * @param imageBuffer 输入图像 Buffer
   * @param params 处理参数
   * @returns 处理后的图像 Buffer
   */
  async processImage(
    imageBuffer: Buffer,
    params: ProcessingParams
  ): Promise<Buffer> {
    try {
      let pipeline = sharp(imageBuffer);

      console.log("Starting image processing with params:", {
        grayscale: params.grayscale,
        contrast: params.contrast,
        brightness: params.brightness,
        threshold: params.threshold,
        sharpen: params.sharpen,
        denoise: params.denoise,
        gamma: params.gamma
      });

      // 1. 伽马校正（应该在其他处理之前）
      if (params.gamma !== 1.0) {
        pipeline = pipeline.gamma(params.gamma);
        console.log(`Applied gamma correction: ${params.gamma}`);
      }

      // 2. 灰度转换
      if (params.grayscale) {
        pipeline = pipeline.greyscale();
        console.log("Applied grayscale conversion");
      }

      // 3. 对比度和亮度调整
      if (params.contrast !== 1.0 || params.brightness !== 0) {
        pipeline = pipeline.linear(params.contrast, params.brightness);
        console.log(`Applied linear adjustment: contrast=${params.contrast}, brightness=${params.brightness}`);
      }

      // 4. 去噪（在锐化之前）
      if (params.denoise) {
        // 使用轻微的高斯模糊进行去噪
        pipeline = pipeline.blur(0.5);
        console.log("Applied denoising (gaussian blur)");
      }

      // 5. 锐化
      if (params.sharpen.sigma > 0) {
        pipeline = pipeline.sharpen(params.sharpen.sigma, params.sharpen.flat, params.sharpen.jagged);
        console.log(`Applied sharpening: sigma=${params.sharpen.sigma}`);
      }

      // 6. 阈值处理（二值化）- 通常是最后一步
      if (params.threshold > 0) {
        pipeline = pipeline.threshold(params.threshold, {
          greyscale: params.grayscale,
        });
        console.log(`Applied threshold: ${params.threshold}`);
      }

      // 6. 颜色替换（如果启用）
      if (params.colorReplace.enabled) {
        console.log(`Applying color replacement: ${params.colorReplace.targetColor} -> ${params.colorReplace.replaceColor}, tolerance: ${params.colorReplace.tolerance}`);
        const processedBuffer = await pipeline.png().toBuffer();
        const colorReplacedBuffer = await this.replaceColor(
          processedBuffer,
          params.colorReplace.targetColor,
          params.colorReplace.replaceColor,
          params.colorReplace.tolerance
        );
        return colorReplacedBuffer;
      }

      // 输出为 PNG 格式（无损）
      const result = await pipeline.png().toBuffer();
      console.log("Image processing completed successfully");
      
      return result;

    } catch (error) {
      console.error("Failed to process image:", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to process image: ${message}`);
    }
  }

  /**
   * 批量处理多个图像
   * @param images 图像 Buffer 数组
   * @param params 处理参数
   * @param onProgress 进度回调
   * @returns 处理后的图像 Buffer 数组
   */
  async batchProcess(
    images: Buffer[],
    params: ProcessingParams,
    onProgress?: ProgressCallback
  ): Promise<Buffer[]> {
    const results: Buffer[] = [];

    console.log(`Starting batch processing of ${images.length} images`);

    for (let i = 0; i < images.length; i++) {
      try {
        const processed = await this.processImage(images[i], params);
        results.push(processed);

        if (onProgress) {
          onProgress(i + 1, images.length);
        }

        console.log(`Processed image ${i + 1}/${images.length}`);
      } catch (error) {
        console.error(`Failed to process image ${i + 1}:`, error);
        // 决定是否继续处理其他图像或抛出错误
        throw error;
      }
    }

    console.log(`Batch processing completed: ${results.length} images`);
    return results;
  }

  /**
   * 获取图像基本信息
   * @param imageBuffer 图像 Buffer
   * @returns 图像元数据
   */
  async getImageInfo(imageBuffer: Buffer) {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        channels: metadata.channels || 0,
        format: metadata.format || "unknown",
        size: imageBuffer.length,
        density: metadata.density || 72,
        hasAlpha: metadata.hasAlpha || false,
      };
    } catch (error) {
      console.error("Failed to get image info:", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get image info: ${message}`);
    }
  }

  /**
   * 生成预览图（小尺寸）
   * @param imageBuffer 输入图像 Buffer
   * @param maxWidth 最大宽度
   * @param maxHeight 最大高度
   * @returns 预览图像 Buffer
   */
  async generatePreview(
    imageBuffer: Buffer,
    maxWidth: number = 400,
    maxHeight: number = 600
  ): Promise<Buffer> {
    try {
      return await sharp(imageBuffer)
        .resize(maxWidth, maxHeight, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
    } catch (error) {
      console.error("Failed to generate preview:", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to generate preview: ${message}`);
    }
  }

  /**
   * 转换图像格式
   * @param imageBuffer 输入图像 Buffer
   * @param format 目标格式
   * @param quality JPEG 质量（1-100）
   * @returns 转换后的图像 Buffer
   */
  async convertFormat(
    imageBuffer: Buffer,
    format: "png" | "jpeg" | "webp",
    quality: number = 90
  ): Promise<Buffer> {
    try {
      let pipeline = sharp(imageBuffer);

      switch (format) {
        case "png":
          return await pipeline.png().toBuffer();
        case "jpeg":
          return await pipeline.jpeg({ quality }).toBuffer();
        case "webp":
          return await pipeline.webp({ quality }).toBuffer();
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
    } catch (error) {
      console.error(`Failed to convert to ${format}:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to convert to ${format}: ${message}`);
    }
  }

  /**
   * 自动调整图像对比度（基于直方图）
   * @param imageBuffer 输入图像 Buffer
   * @param targetMean 目标平均亮度 (0-255)
   * @returns 调整后的图像 Buffer 和应用的参数
   */
  async autoAdjustContrast(
    imageBuffer: Buffer,
    targetMean: number = 128
  ): Promise<{ image: Buffer; appliedParams: { contrast: number; brightness: number } }> {
    try {
      // 获取图像统计信息
      const stats = await sharp(imageBuffer).stats();
      
      // 计算当前平均亮度（取 RGB 通道平均）
      const currentMean = stats.channels.length === 1 
        ? stats.channels[0].mean 
        : stats.channels.slice(0, 3).reduce((sum: number, ch: any) => sum + ch.mean, 0) / 3;

      // 计算调整参数
      const brightnessAdjust = targetMean - currentMean;
      const contrastAdjust = Math.max(0.5, Math.min(2.0, 1.0 + (targetMean - currentMean) / 255));

      console.log(`Auto-adjust: current mean=${currentMean}, target=${targetMean}`);
      console.log(`Applying: contrast=${contrastAdjust}, brightness=${brightnessAdjust}`);

      const adjustedImage = await sharp(imageBuffer)
        .linear(contrastAdjust, brightnessAdjust)
        .png()
        .toBuffer();

      return {
        image: adjustedImage,
        appliedParams: {
          contrast: contrastAdjust,
          brightness: brightnessAdjust
        }
      };

    } catch (error) {
      console.error("Failed to auto-adjust contrast:", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to auto-adjust contrast: ${message}`);
    }
  }

  /**
   * 计算图像质量分数（基于清晰度和对比度）
   * @param imageBuffer 图像 Buffer
   * @returns 质量分数 (0-100)
   */
  async calculateQualityScore(imageBuffer: Buffer): Promise<number> {
    try {
      // 使用简化的方法计算清晰度（避免 sharp 版本兼容性问题）
      const grayImage = await sharp(imageBuffer)
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // 计算基本方差作为清晰度指标
      const pixels = new Uint8Array(grayImage.data);
      const mean = pixels.reduce((sum, val) => sum + val, 0) / pixels.length;
      const variance = pixels.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / pixels.length;
      
      // 获取对比度信息
      const stats = await sharp(imageBuffer).stats();
      const contrast = stats.channels[0].stdev; // 标准差作为对比度指标

      // 计算综合质量分数
      const sharpnessScore = Math.min(100, variance / 10); // 归一化清晰度分数
      const contrastScore = Math.min(100, contrast / 2);   // 归一化对比度分数
      
      const qualityScore = (sharpnessScore * 0.6 + contrastScore * 0.4);

      console.log(`Quality analysis: sharpness=${sharpnessScore.toFixed(1)}, contrast=${contrastScore.toFixed(1)}, overall=${qualityScore.toFixed(1)}`);

      return Math.round(qualityScore);

    } catch (error) {
      console.error("Failed to calculate quality score:", error);
      return 50; // 返回中等分数作为后备
    }
  }

  /**
   * 智能锐化（根据图像内容调整参数）
   * @param imageBuffer 输入图像 Buffer
   * @returns 锐化后的图像 Buffer 和使用的参数
   */
  async smartSharpen(
    imageBuffer: Buffer
  ): Promise<{ image: Buffer; appliedParams: { sigma: number; flat: number; jagged: number } }> {
    try {
      const qualityScore = await this.calculateQualityScore(imageBuffer);
      
      // 根据质量分数调整锐化参数
      let sigma: number;
      let flat: number;
      let jagged: number;

      if (qualityScore < 30) {
        // 低质量图像，使用强锐化
        sigma = 2.0;
        flat = 1.0;
        jagged = 2.0;
      } else if (qualityScore < 60) {
        // 中等质量，使用中等锐化
        sigma = 1.5;
        flat = 1.5;
        jagged = 2.5;
      } else {
        // 高质量图像，使用轻微锐化
        sigma = 1.0;
        flat = 2.0;
        jagged = 3.0;
      }

      console.log(`Smart sharpen for quality ${qualityScore}: sigma=${sigma}, flat=${flat}, jagged=${jagged}`);

      const sharpenedImage = await sharp(imageBuffer)
        .sharpen(sigma, flat, jagged)
        .png()
        .toBuffer();

      return {
        image: sharpenedImage,
        appliedParams: { sigma, flat, jagged }
      };

    } catch (error) {
      console.error("Failed to apply smart sharpening:", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to apply smart sharpening: ${message}`);
    }
  }

  /**
   * 验证处理参数的有效性
   * @param params 处理参数
   * @returns 验证结果和修正后的参数
   */
  validateAndCorrectParams(params: ProcessingParams): { 
    valid: boolean; 
    correctedParams: ProcessingParams; 
    warnings: string[] 
  } {
    const warnings: string[] = [];
    const correctedParams: ProcessingParams = { ...params };

    // 验证和修正各个参数
    if (correctedParams.contrast < 0.1 || correctedParams.contrast > 3.0) {
      warnings.push(`Contrast ${correctedParams.contrast} out of range [0.1, 3.0], clamped`);
      correctedParams.contrast = Math.max(0.1, Math.min(3.0, correctedParams.contrast));
    }

    if (correctedParams.brightness < -100 || correctedParams.brightness > 100) {
      warnings.push(`Brightness ${correctedParams.brightness} out of range [-100, 100], clamped`);
      correctedParams.brightness = Math.max(-100, Math.min(100, correctedParams.brightness));
    }

    if (correctedParams.threshold < 0 || correctedParams.threshold > 255) {
      warnings.push(`Threshold ${correctedParams.threshold} out of range [0, 255], clamped`);
      correctedParams.threshold = Math.max(0, Math.min(255, correctedParams.threshold));
    }

    if (correctedParams.gamma < 0.1 || correctedParams.gamma > 3.0) {
      warnings.push(`Gamma ${correctedParams.gamma} out of range [0.1, 3.0], clamped`);
      correctedParams.gamma = Math.max(0.1, Math.min(3.0, correctedParams.gamma));
    }

    // 验证锐化参数
    if (correctedParams.sharpen.sigma < 0 || correctedParams.sharpen.sigma > 10) {
      warnings.push(`Sharpen sigma ${correctedParams.sharpen.sigma} out of range [0, 10], clamped`);
      correctedParams.sharpen.sigma = Math.max(0, Math.min(10, correctedParams.sharpen.sigma));
    }

    // 验证颜色替换参数
    if (correctedParams.colorReplace.enabled) {
      // 验证目标颜色
      correctedParams.colorReplace.targetColor = correctedParams.colorReplace.targetColor.map(
        value => Math.max(0, Math.min(255, Math.floor(value)))
      ) as [number, number, number];

      // 验证替换颜色
      correctedParams.colorReplace.replaceColor = correctedParams.colorReplace.replaceColor.map(
        value => Math.max(0, Math.min(255, Math.floor(value)))
      ) as [number, number, number];

      // 验证容差
      if (correctedParams.colorReplace.tolerance < 0 || correctedParams.colorReplace.tolerance > 50) {
        warnings.push(`Color tolerance ${correctedParams.colorReplace.tolerance} out of range [0, 50], clamped`);
        correctedParams.colorReplace.tolerance = Math.max(0, Math.min(50, correctedParams.colorReplace.tolerance));
      }
    }

    return {
      valid: warnings.length === 0,
      correctedParams,
      warnings
    };
  }

  /**
   * 颜色替换功能
   * @param imageBuffer 输入图像 Buffer
   * @param targetColor 目标颜色 RGB [r, g, b]
   * @param replaceColor 替换颜色 RGB [r, g, b]
   * @param tolerance 颜色容差
   * @returns 处理后的图像 Buffer
   */
  async replaceColor(
    imageBuffer: Buffer,
    targetColor: [number, number, number],
    replaceColor: [number, number, number],
    tolerance: number
  ): Promise<Buffer> {
    try {
      // 获取图像的原始像素数据
      const { data, info } = await sharp(imageBuffer)
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { width, height, channels } = info;
      const [targetR, targetG, targetB] = targetColor;
      const [replaceR, replaceG, replaceB] = replaceColor;

      console.log(`Processing ${width}x${height} image with ${channels} channels`);
      console.log(`Target color: RGB(${targetR}, ${targetG}, ${targetB}), tolerance: ±${tolerance}`);
      console.log(`Replace with: RGB(${replaceR}, ${replaceG}, ${replaceB})`);

      let replacedPixels = 0;

      // 遍历每个像素
      for (let i = 0; i < data.length; i += channels) {
        const pixelR = data[i];
        const pixelG = data[i + 1];
        const pixelB = data[i + 2];

        // 检查是否在目标颜色的容差范围内
        const diffR = Math.abs(pixelR - targetR);
        const diffG = Math.abs(pixelG - targetG);
        const diffB = Math.abs(pixelB - targetB);

        if (diffR <= tolerance && diffG <= tolerance && diffB <= tolerance) {
          // 替换颜色
          data[i] = replaceR;     // R
          data[i + 1] = replaceG; // G
          data[i + 2] = replaceB; // B
          // Alpha 通道保持不变 (如果存在)
          replacedPixels++;
        }
      }

      console.log(`Replaced ${replacedPixels} pixels`);

      // 重新构建图像
      const result = await sharp(data, {
        raw: {
          width,
          height,
          channels
        }
      })
      .png()
      .toBuffer();

      return result;

    } catch (error) {
      console.error("Failed to replace color:", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to replace color: ${message}`);
    }
  }

  /**
   * 清理图像处理资源
   */
  cleanup(): void {
    // Sharp 会自动管理内存，但可以在这里添加额外的清理逻辑
    console.log("ImageProcessor cleanup completed");
  }
}
