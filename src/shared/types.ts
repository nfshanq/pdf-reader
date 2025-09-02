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

// API 响应类型
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// 进度回调类型
export type ProgressCallback = (completed: number, total: number) => void;

// 文件上传状态
export interface UploadStatus {
  uploading: boolean;
  progress: number;
  error?: string;
}

// 预览图像状态
export interface PreviewImages {
  original?: string;
  processed?: string;
}
