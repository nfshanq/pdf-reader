import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { PDFProcessor } from "./pdf";
import { PageRenderer } from "./render";
import { ImageProcessor } from "./image";
import { PDFExporter } from "./export";
import { RenderOptions, ProcessingParams, APIResponse } from "@shared/types";

// 扩展 Express Request 类型以包含 multer 文件
interface MulterRequest extends express.Request {
  file?: Express.Multer.File;
}

const app = express();

// 配置文件上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// 初始化处理器
const pdfProcessor = new PDFProcessor();
const pageRenderer = new PageRenderer();
const imageProcessor = new ImageProcessor();
const pdfExporter = new PDFExporter();

// 中间件配置
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 全局错误处理中间件
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('API Error:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        success: false, 
        error: 'File too large. Maximum size is 100MB.' 
      });
    }
  }
  
  res.status(500).json({ 
    success: false, 
    error: err.message || 'Internal server error' 
  });
});

// API 路由

/**
 * 健康检查
 */
app.get('/api/health', (_req, res) => {
  res.json({ 
    success: true, 
    data: { 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      openDocuments: pdfProcessor.getOpenDocumentCount()
    } 
  });
});

/**
 * 上传 PDF 文件
 */
app.post('/api/pdf/upload', upload.single('pdf'), async (req: MulterRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No PDF file uploaded' 
      });
    }

    console.log(`Processing uploaded file: ${req.file.originalname} (${req.file.size} bytes)`);

    const pdfDoc = await pdfProcessor.openDocument(
      req.file.buffer,
      req.file.originalname
    );

    const response: APIResponse = {
      success: true,
      data: pdfDoc
    };

    res.json(response);
  } catch (error) {
    console.error('Upload error:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to process PDF: ${message}` 
    });
  }
});

/**
 * 验证 PDF 密码
 */
app.post('/api/pdf/:id/verify-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Password is required' 
      });
    }

    console.log(`Verifying password for document: ${id}`);

    const success = await pdfProcessor.authenticatePassword(id, password);
    
    if (success) {
      const bounds = await pdfProcessor.getPageBounds(id);
      const metadata = pdfProcessor.getDocumentMetadata(id);
      
      res.json({ 
        success: true, 
        data: { 
          authenticated: true, 
          pages: bounds,
          document: metadata
        } 
      });
    } else {
      res.json({ 
        success: false, 
        error: 'Invalid password' 
      });
    }
  } catch (error) {
    console.error('Password verification error:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      success: false, 
      error: `Password verification failed: ${message}` 
    });
  }
});

/**
 * 获取文档信息和页面列表
 */
app.get('/api/pdf/:id/info', async (req, res) => {
  try {
    const { id } = req.params;

    if (!pdfProcessor.isDocumentReady(id)) {
      return res.status(404).json({ 
        success: false, 
        error: 'Document not found or not ready' 
      });
    }

    const metadata = pdfProcessor.getDocumentMetadata(id);
    const bounds = await pdfProcessor.getPageBounds(id);

    res.json({ 
      success: true, 
      data: { 
        document: metadata,
        pages: bounds
      } 
    });
  } catch (error) {
    console.error('Get info error:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to get document info: ${message}` 
    });
  }
});

/**
 * 渲染指定页面
 */
app.post('/api/pdf/:id/render', async (req, res) => {
  try {
    const { id } = req.params;
    const { pageIndex, renderOptions }: { pageIndex: number; renderOptions: RenderOptions } = req.body;

    if (typeof pageIndex !== 'number' || pageIndex < 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid page index' 
      });
    }

    if (!pdfProcessor.isDocumentReady(id)) {
      return res.status(404).json({ 
        success: false, 
        error: 'Document not found or not ready' 
      });
    }

    console.log(`Rendering page ${pageIndex} of document ${id} with DPI ${renderOptions.dpi}`);

    const document = pdfProcessor.getDocument(id);
    const bounds = await pdfProcessor.getPageBounds(id);
    
    if (pageIndex >= bounds.length) {
      return res.status(400).json({ 
        success: false, 
        error: `Page index ${pageIndex} out of range (0-${bounds.length - 1})` 
      });
    }

    const imageBuffer = await pageRenderer.renderPage(
      document,
      pageIndex,
      bounds[pageIndex],
      renderOptions
    );

    // 设置适当的响应头
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': imageBuffer.length.toString(),
      'Cache-Control': 'public, max-age=3600'
    });
    
    res.send(imageBuffer);
  } catch (error) {
    console.error('Render error:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to render page: ${message}` 
    });
  }
});

/**
 * 渲染页面预览（低分辨率）
 */
app.post('/api/pdf/:id/preview', async (req, res) => {
  try {
    const { id } = req.params;
    const { pageIndex, maxWidth = 400, maxHeight = 600 } = req.body;

    if (!pdfProcessor.isDocumentReady(id)) {
      return res.status(404).json({ 
        success: false, 
        error: 'Document not found or not ready' 
      });
    }

    const document = pdfProcessor.getDocument(id);
    const bounds = await pdfProcessor.getPageBounds(id);
    
    if (pageIndex >= bounds.length) {
      return res.status(400).json({ 
        success: false, 
        error: `Page index ${pageIndex} out of range` 
      });
    }

    console.log(`Rendering preview for page ${pageIndex} (${maxWidth}x${maxHeight})`);

    const imageBuffer = await pageRenderer.renderPagePreview(
      document,
      pageIndex,
      bounds[pageIndex],
      maxWidth,
      maxHeight
    );

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': imageBuffer.length.toString(),
      'Cache-Control': 'public, max-age=7200'
    });
    
    res.send(imageBuffer);
  } catch (error) {
    console.error('Preview error:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to render preview: ${message}` 
    });
  }
});

/**
 * 应用图像处理并返回处理后的图像
 */
app.post('/api/pdf/:id/process', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      pageIndex, 
      renderOptions, 
      processingParams 
    }: { 
      pageIndex: number; 
      renderOptions: RenderOptions; 
      processingParams: ProcessingParams 
    } = req.body;

    if (!pdfProcessor.isDocumentReady(id)) {
      return res.status(404).json({ 
        success: false, 
        error: 'Document not found or not ready' 
      });
    }

    console.log(`Processing page ${pageIndex} with params:`, processingParams);

    // 验证和修正处理参数
    const validation = imageProcessor.validateAndCorrectParams(processingParams);
    if (!validation.valid) {
      console.warn('Parameter validation warnings:', validation.warnings);
    }

    const document = pdfProcessor.getDocument(id);
    const bounds = await pdfProcessor.getPageBounds(id);

    // 先渲染原始页面
    const originalImage = await pageRenderer.renderPage(
      document,
      pageIndex,
      bounds[pageIndex],
      renderOptions
    );

    // 应用图像处理
    const processedImage = await imageProcessor.processImage(
      originalImage,
      validation.correctedParams
    );

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': processedImage.length.toString()
    });
    
    res.send(processedImage);
  } catch (error) {
    console.error('Process error:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to process image: ${message}` 
    });
  }
});

/**
 * 批量处理多个页面
 */
app.post('/api/pdf/:id/batch-process', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      pageIndices, 
      renderOptions, 
      processingParams 
    }: { 
      pageIndices: number[]; 
      renderOptions: RenderOptions; 
      processingParams: ProcessingParams 
    } = req.body;

    if (!Array.isArray(pageIndices) || pageIndices.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Page indices array is required' 
      });
    }

    if (!pdfProcessor.isDocumentReady(id)) {
      return res.status(404).json({ 
        success: false, 
        error: 'Document not found or not ready' 
      });
    }

    console.log(`Batch processing ${pageIndices.length} pages`);

    const document = pdfProcessor.getDocument(id);
    const bounds = await pdfProcessor.getPageBounds(id);

    // 检查内存可行性
    const selectedBounds = pageIndices.map(idx => bounds[idx]);
    const feasibility = pageRenderer.checkRenderFeasibility(selectedBounds, renderOptions);
    
    if (!feasibility.feasible) {
      return res.status(400).json({
        success: false,
        error: `Memory usage too high: ${feasibility.estimatedMemoryMB}MB`,
        suggestions: feasibility.suggestions
      });
    }

    // 批量渲染
    const pageData = pageIndices.map(index => ({ index, bounds: bounds[index] }));
    const renderedImages = await pageRenderer.renderPageBatch(
      document, 
      pageData, 
      renderOptions
    );

    // 批量处理
    const processedImages = await imageProcessor.batchProcess(
      renderedImages, 
      processingParams
    );

    // 返回处理结果摘要
    res.json({
      success: true,
      data: {
        processedCount: processedImages.length,
        totalSize: processedImages.reduce((sum, img) => sum + img.length, 0),
        memoryUsed: feasibility.estimatedMemoryMB
      }
    });

  } catch (error) {
    console.error('Batch process error:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      success: false, 
      error: `Batch processing failed: ${message}` 
    });
  }
});

/**
 * 导出处理后的 PDF
 */
app.post('/api/pdf/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      pageIndices, 
      renderOptions, 
      processingParams,
      metadata 
    }: { 
      pageIndices: number[]; 
      renderOptions: RenderOptions; 
      processingParams: ProcessingParams;
      metadata?: any;
    } = req.body;

    if (!pdfProcessor.isDocumentReady(id)) {
      return res.status(404).json({ 
        success: false, 
        error: 'Document not found or not ready' 
      });
    }

    console.log(`Exporting ${pageIndices.length} pages as PDF`);

    const document = pdfProcessor.getDocument(id);
    const bounds = await pdfProcessor.getPageBounds(id);
    const docMetadata = pdfProcessor.getDocumentMetadata(id);

    const processedPages = [];

    for (const pageIndex of pageIndices) {
      // 渲染原始页面
      const originalImage = await pageRenderer.renderPage(
        document,
        pageIndex,
        bounds[pageIndex],
        renderOptions
      );

      // 应用图像处理
      const processedImage = await imageProcessor.processImage(
        originalImage,
        processingParams
      );

      processedPages.push({
        pageIndex,
        bounds: bounds[pageIndex],
        originalImage,
        processedImage,
        renderOptions,
        processingParams,
      });
    }

    // 导出 PDF
    const outputPDF = metadata 
      ? await pdfExporter.exportWithMetadata(processedPages, {
          title: metadata.title || `Processed ${docMetadata?.filename}`,
          creator: 'PDF Image Processor',
          producer: 'PDF Image Processor v1.0',
          ...metadata
        })
      : await pdfExporter.exportProcessedPDF(processedPages);

    // 生成文件名
    const originalName = docMetadata?.filename || 'document.pdf';
    const baseName = path.parse(originalName).name;
    const exportName = `${baseName}_processed.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${exportName}"`,
      'Content-Length': outputPDF.length.toString()
    });
    
    res.send(outputPDF);

  } catch (error) {
    console.error('Export error:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      success: false, 
      error: `Export failed: ${message}` 
    });
  }
});

/**
 * 获取推荐的处理参数
 */
app.post('/api/pdf/:id/recommendations', async (req, res) => {
  try {
    const { id } = req.params;
    const { pageIndex, purpose = 'web' } = req.body;

    if (!pdfProcessor.isDocumentReady(id)) {
      return res.status(404).json({ 
        success: false, 
        error: 'Document not found or not ready' 
      });
    }

    const bounds = await pdfProcessor.getPageBounds(id);
    const pageBounds = bounds[pageIndex];

    // 获取推荐的 DPI
    const recommendedDPI = pageRenderer.getRecommendedDPI(pageBounds, purpose);

    // 获取推荐的导出设置
    const exportSettings = pdfExporter.getRecommendedExportSettings(purpose, bounds.length);

    res.json({
      success: true,
      data: {
        renderOptions: {
          dpi: recommendedDPI,
          colorSpace: purpose === 'print' ? 'RGB' : 'RGB',
          format: 'PNG'
        },
        processingParams: {
          grayscale: purpose === 'archive',
          contrast: 1.1,
          brightness: 0,
          threshold: 0,
          sharpen: { sigma: 1.0, flat: 1.5, jagged: 2.0 },
          denoise: false,
          gamma: 1.0
        },
        exportSettings
      }
    });

  } catch (error) {
    console.error('Recommendations error:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to get recommendations: ${message}` 
    });
  }
});

/**
 * 关闭文档并清理资源
 */
app.delete('/api/pdf/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Closing document: ${id}`);
    pdfProcessor.closeDocument(id);
    
    res.json({ 
      success: true, 
      data: { message: 'Document closed successfully' } 
    });
  } catch (error) {
    console.error('Close document error:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to close document: ${message}` 
    });
  }
});

/**
 * 清理所有文档（管理端点）
 */
app.post('/api/admin/cleanup', (_req, res) => {
  try {
    console.log('Cleaning up all documents...');
    
    pdfProcessor.closeAllDocuments();
    pageRenderer.cleanup();
    imageProcessor.cleanup();
    pdfExporter.cleanup();
    
    res.json({ 
      success: true, 
      data: { message: 'All resources cleaned up successfully' } 
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      success: false, 
      error: `Cleanup failed: ${message}` 
    });
  }
});

// 404 处理
app.use('*', (_req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'API endpoint not found' 
  });
});

// 启动服务器
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 PDF Processor API Server running on port ${PORT}`);
  console.log(`📖 API Endpoints:`);
  console.log(`   GET  /api/health                     - Health check`);
  console.log(`   POST /api/pdf/upload                 - Upload PDF`);
  console.log(`   POST /api/pdf/:id/verify-password    - Verify password`);
  console.log(`   GET  /api/pdf/:id/info               - Get document info`);
  console.log(`   POST /api/pdf/:id/render             - Render page`);
  console.log(`   POST /api/pdf/:id/preview            - Render preview`);
  console.log(`   POST /api/pdf/:id/process            - Process image`);
  console.log(`   POST /api/pdf/:id/batch-process      - Batch process`);
  console.log(`   POST /api/pdf/:id/export             - Export PDF`);
  console.log(`   POST /api/pdf/:id/recommendations    - Get recommendations`);
  console.log(`   DELETE /api/pdf/:id                  - Close document`);
  console.log(`   POST /api/admin/cleanup              - Cleanup resources`);
});

// 优雅关闭处理
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, cleaning up...');
  pdfProcessor.closeAllDocuments();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, cleaning up...');
  pdfProcessor.closeAllDocuments();
  process.exit(0);
});

export default app;
