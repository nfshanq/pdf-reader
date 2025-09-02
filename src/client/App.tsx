import { useState, useCallback, useEffect, useRef } from 'react';
import { FileUpload } from './components/FileUpload';
import { ParameterPanel } from './components/ParameterPanel';
import { PreviewPane } from './components/PreviewPane';
import { ExportDialog } from './components/ExportDialog';
import { apiClient } from './api';
import { PDFDocument, RenderOptions, ProcessingParams, PreviewImages } from '@shared/types';

export default function App() {
  const [currentPDF, setCurrentPDF] = useState<PDFDocument | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // 渲染参数
  const [renderOptions, setRenderOptions] = useState<RenderOptions>({
    dpi: 150,
    colorSpace: 'RGB',
    format: 'PNG'
  });

  // 处理参数
  const [processingParams, setProcessingParams] = useState<ProcessingParams>({
    grayscale: false,
    contrast: 1.0,
    brightness: 0,
    threshold: 0,
    sharpen: { sigma: 0, flat: 1, jagged: 2 },
    denoise: false,
    gamma: 1.0
  });

  const [previewImages, setPreviewImages] = useState<PreviewImages>({});

  // 用于存储对象 URL，避免内存泄漏
  const previewUrlsRef = useRef<Set<string>>(new Set());

  // 清理预览 URL
  const cleanupPreviewUrls = useCallback(() => {
    previewUrlsRef.current.forEach(url => {
      apiClient.revokeObjectURL(url);
    });
    previewUrlsRef.current.clear();
  }, []);

  // 组件卸载时清理资源
  useEffect(() => {
    return () => {
      cleanupPreviewUrls();
      if (currentPDF) {
        apiClient.closeDocument(currentPDF.id).catch(console.error);
      }
    };
  }, [cleanupPreviewUrls, currentPDF]);

  const handleFileUpload = useCallback(async (file: File, password?: string) => {
    setIsLoading(true);
    setError(null);
    cleanupPreviewUrls();
    
    try {
      // 上传文件
      const pdfDoc = await apiClient.uploadPDF(file);
      
      if (pdfDoc.needsPassword && !password) {
        setError('Password required');
        return;
      }

      if (pdfDoc.needsPassword && password) {
        // 验证密码
        const authResult = await apiClient.verifyPassword(pdfDoc.id, password);
        if (!authResult.authenticated) {
          setError('Invalid password');
          return;
        }
        
        // 更新文档信息
        pdfDoc.pages = authResult.pages || [];
        pdfDoc.isAuthenticated = true;
      }

      setCurrentPDF(pdfDoc);
      setCurrentPage(0);
      setError(null);
      
      // 加载第一页预览
      if (pdfDoc.isAuthenticated) {
        await loadPagePreview(pdfDoc.id, 0);
      }

    } catch (error) {
      console.error('Upload failed:', error);
      setError(apiClient.handleError(error));
    } finally {
      setIsLoading(false);
    }
  }, [cleanupPreviewUrls]);

  const loadPagePreview = useCallback(async (documentId: string, pageIndex: number) => {
    if (!currentPDF) return;

    setIsProcessing(true);
    
    try {
      // 清理之前的预览 URL
      if (previewImages.original) {
        apiClient.revokeObjectURL(previewImages.original);
        previewUrlsRef.current.delete(previewImages.original);
      }
      if (previewImages.processed) {
        apiClient.revokeObjectURL(previewImages.processed);
        previewUrlsRef.current.delete(previewImages.processed);
      }

      // 加载原始图像预览
      const originalBlob = await apiClient.renderPreview(documentId, pageIndex);
      const originalUrl = apiClient.createObjectURL(originalBlob);
      previewUrlsRef.current.add(originalUrl);

      setPreviewImages(prev => ({ ...prev, original: originalUrl, processed: undefined }));

      // 如果有处理参数，加载处理后预览
      const hasProcessing = processingParams.grayscale || 
                           processingParams.contrast !== 1.0 || 
                           processingParams.brightness !== 0 ||
                           processingParams.sharpen.sigma > 0 ||
                           processingParams.threshold > 0 ||
                           processingParams.denoise ||
                           processingParams.gamma !== 1.0;

      if (hasProcessing) {
        const processedBlob = await apiClient.processImage(
          documentId, 
          pageIndex, 
          renderOptions, 
          processingParams
        );
        const processedUrl = apiClient.createObjectURL(processedBlob);
        previewUrlsRef.current.add(processedUrl);

        setPreviewImages(prev => ({ ...prev, processed: processedUrl }));
      }

    } catch (error) {
      console.error('Failed to load preview:', error);
      setError(`预览加载失败: ${apiClient.handleError(error)}`);
    } finally {
      setIsProcessing(false);
    }
  }, [currentPDF, renderOptions, processingParams, previewImages]);

  const handlePageChange = useCallback((pageIndex: number) => {
    if (currentPDF && pageIndex >= 0 && pageIndex < currentPDF.pageCount) {
      setCurrentPage(pageIndex);
      loadPagePreview(currentPDF.id, pageIndex);
    }
  }, [currentPDF, loadPagePreview]);

  const handleParameterChange = useCallback((
    params: Partial<ProcessingParams> | Partial<RenderOptions>
  ) => {
    if ('dpi' in params || 'colorSpace' in params || 'format' in params) {
      setRenderOptions(prev => ({ ...prev, ...params }));
    } else {
      setProcessingParams(prev => ({ ...prev, ...params }));
    }
    
    // 延迟重新加载预览，避免频繁请求
    if (currentPDF) {
      const timeoutId = setTimeout(() => {
        loadPagePreview(currentPDF.id, currentPage);
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [currentPDF, currentPage, loadPagePreview]);

  const handleExport = useCallback(async (exportOptions: any) => {
    if (!currentPDF) return;

    setIsExporting(true);
    setError(null);

    try {
      const blob = await apiClient.exportPDF(
        currentPDF.id,
        exportOptions.pageIndices,
        exportOptions.renderOptions,
        exportOptions.processingParams,
        exportOptions.metadata
      );

      // 下载文件
      const originalName = currentPDF.filename;
      const baseName = originalName.replace(/\.pdf$/i, '');
      const filename = `${baseName}_processed.pdf`;
      
      apiClient.downloadBlob(blob, filename);
      setShowExportDialog(false);

    } catch (error) {
      console.error('Export failed:', error);
      setError(`导出失败: ${apiClient.handleError(error)}`);
    } finally {
      setIsExporting(false);
    }
  }, [currentPDF]);

  const handleNewFile = useCallback(() => {
    if (currentPDF) {
      apiClient.closeDocument(currentPDF.id).catch(console.error);
    }
    setCurrentPDF(null);
    setCurrentPage(0);
    setError(null);
    setShowExportDialog(false);
    cleanupPreviewUrls();
    setPreviewImages({});
  }, [currentPDF, cleanupPreviewUrls]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>PDF Image Processor</h1>
          <p>PDF 图像处理与增强工具</p>
          
          {currentPDF && (
            <div className="header-actions">
              <button 
                onClick={() => setShowExportDialog(true)}
                disabled={isExporting}
                className="export-button"
              >
                📤 导出 PDF
              </button>
              <button 
                onClick={handleNewFile}
                className="new-file-button"
              >
                📄 新文件
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="app-main">
        {!currentPDF ? (
          <div className="upload-section">
            <FileUpload
              onFileUpload={handleFileUpload}
              isLoading={isLoading}
              error={error}
            />
          </div>
        ) : (
          <div className="workspace">
            <aside className="left-panel">
              <ParameterPanel
                renderOptions={renderOptions}
                processingParams={processingParams}
                onParameterChange={handleParameterChange}
                disabled={isLoading || isProcessing}
              />
            </aside>

            <section className="preview-section">
              <PreviewPane
                pdfDocument={currentPDF}
                currentPage={currentPage}
                previewImages={previewImages}
                onPageChange={handlePageChange}
                isProcessing={isProcessing}
              />
            </section>

            {showExportDialog && (
              <div className="export-modal">
                <div className="export-modal-backdrop" onClick={() => setShowExportDialog(false)} />
                <div className="export-modal-content">
                  <button 
                    className="export-modal-close"
                    onClick={() => setShowExportDialog(false)}
                  >
                    ✕
                  </button>
                  <ExportDialog
                    pdfDocument={currentPDF}
                    renderOptions={renderOptions}
                    processingParams={processingParams}
                    onExport={handleExport}
                    isExporting={isExporting}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="error-notification">
            <span className="error-icon">⚠️</span>
            <span className="error-message">{error}</span>
            <button 
              onClick={() => setError(null)}
              className="error-close"
            >
              ✕
            </button>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-content">
          <span>PDF Image Processor v1.0</span>
          {currentPDF && (
            <span className="document-info">
              {currentPDF.filename} | {currentPDF.pageCount} 页
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
