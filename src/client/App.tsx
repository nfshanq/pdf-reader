import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { FileUpload } from './components/FileUpload';
import { ParameterPanel } from './components/ParameterPanel';
import { PreviewPane } from './components/PreviewPane';
import { ExportDialog } from './components/ExportDialog';
import { apiClient } from './api';
import { PDFDocument, RenderOptions, ProcessingParams, PreviewImages } from '@shared/types';

export default function App() {
  const [currentPDF, setCurrentPDF] = useState<PDFDocument | null>(null);
  const [pendingPDF, setPendingPDF] = useState<PDFDocument | null>(null); // 保存待验证密码的文档
  const currentPDFRef = useRef<PDFDocument | null>(null);
  const pendingPDFRef = useRef<PDFDocument | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  // 彩蛋功能状态
  const [ccccClickCount, setCcccClickCount] = useState(0);
  const [ccccDisabled, setCcccDisabled] = useState(false);
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
    gamma: 1.0,
    colorReplace: {
      enabled: false,
      targetColor: [224, 224, 224],
      replaceColor: [255, 255, 255],
      tolerance: 10
    }
  });

  const [previewImages, setPreviewImages] = useState<PreviewImages>({});

  // 简化的内存管理 - 使用useMemo缓存URL
  const previewUrls = useMemo(() => new Set<string>(), []);
  
  // 同步ref值
  useEffect(() => {
    currentPDFRef.current = currentPDF;
  }, [currentPDF]);
  
  useEffect(() => {
    pendingPDFRef.current = pendingPDF;
  }, [pendingPDF]);

  // 组件卸载时清理资源
  useEffect(() => {
    return () => {
      // 清理预览URL
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      previewUrls.clear();
      
      // 关闭文档（使用ref来获取最新值）
      if (currentPDFRef.current) {
        apiClient.closeDocument(currentPDFRef.current.id).catch(console.error);
      }
      // 清理待验证的文档
      if (pendingPDFRef.current) {
        apiClient.closeDocument(pendingPDFRef.current.id).catch(console.error);
      }
    };
  }, [previewUrls]);

  // 清除待验证的文档
  const clearPendingDocument = useCallback(() => {
    const docToClose = pendingPDFRef.current || pendingPDF;
    if (docToClose) {
      apiClient.closeDocument(docToClose.id).catch(console.error);
      setPendingPDF(null);
      pendingPDFRef.current = null;
    }
  }, [pendingPDF]);

  const handleFileUpload = useCallback(async (file?: File | 'pending', password?: string) => {

    setIsLoading(true);
    setError(null);
    
    try {
      const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
      let pdfDoc: PDFDocument;

      // 如果传入 'pending' 则必须验证密码，或者有待验证的文档且提供了密码
      const currentPendingPDF = pendingPDFRef.current || pendingPDF; // 优先使用ref，避免异步问题
      if (file === 'pending' || (currentPendingPDF && password)) {
        if (!currentPendingPDF) {
          throw new Error('No document pending password verification');
        }
        if (!password) {
          throw new Error('Password required for verification');
        }
        try {
          const authResult = await apiClient.verifyPassword(currentPendingPDF.id, password);
          
          if (!authResult.authenticated) {
            throw new Error('Invalid password');
          }
          
          // 使用已加载的文档，更新认证状态
          pdfDoc = { ...currentPendingPDF } as PDFDocument;
          if (authResult.document) {
            Object.assign(pdfDoc, authResult.document);
          } else {
            pdfDoc.pages = authResult.pages || [];
            pdfDoc.isAuthenticated = true;
          }
          
          // 清除待验证的文档（同时清除state和ref）
          setPendingPDF(null);
          pendingPDFRef.current = null;
        } catch (error) {
          throw error;
        }
      } else {
        // 新文件上传流程
        if (pendingPDF && !password) {
          // 如果有待验证文档但没有密码，抛出错误
          throw new Error('Password required');
        }

        // 清理之前的预览
        Object.values(previewImages).forEach(url => {
          if (url) {
            URL.revokeObjectURL(url);
            previewUrls.delete(url);
          }
        });
        setPreviewImages({});

        // 上传新文件
        pdfDoc = isElectron ? await apiClient.uploadPDF() : await apiClient.uploadPDF(file!);
        
        if (pdfDoc.needsPassword && !password) {
          // 保存待验证的文档（同时更新state和ref）
          setPendingPDF(pdfDoc);
          pendingPDFRef.current = pdfDoc;  // 立即更新ref，避免异步问题
          throw new Error('Password required');
        }

        if (pdfDoc.needsPassword && password) {
          // 验证密码
          const authResult = await apiClient.verifyPassword(pdfDoc.id, password);
          if (!authResult.authenticated) {
            // 密码错误，保存文档等待重新验证
            setPendingPDF(pdfDoc);
            pendingPDFRef.current = pdfDoc;
            throw new Error('Invalid password');
          }
          
          // 使用服务器返回的更新后文档信息
          if (authResult.document) {
            Object.assign(pdfDoc, authResult.document);
          } else {
            pdfDoc.pages = authResult.pages || [];
            pdfDoc.isAuthenticated = true;
          }
        }
      }

      // 安全检查：如果页面数为0但有页面边界信息，修正页面数
      if (pdfDoc.pageCount === 0 && pdfDoc.pages && pdfDoc.pages.length > 0) {
        pdfDoc.pageCount = pdfDoc.pages.length;
      }

      // 最终检查：如果仍然没有页面信息，显示错误
      if (pdfDoc.pageCount === 0) {
        throw new Error('PDF文档没有可读取的页面');
      }

      setCurrentPDF(pdfDoc);
      setCurrentPage(0);
      setError(null);
      
      // 加载第一页预览
      if (pdfDoc.isAuthenticated) {
        await loadPagePreview(pdfDoc.id, 0);
      }
      
      setIsLoading(false);  // 成功完成时重置加载状态

    } catch (error) {
      // 如果是密码相关错误，重新抛出让 FileUpload 组件处理
      if (error instanceof Error && (
        error.message.includes('Password required') || 
        error.message.includes('Invalid password')
      )) {
        setIsLoading(false);  // 重置加载状态，让 FileUpload 组件管理密码输入状态
        throw error;  // 重新抛出给 FileUpload 组件
      }
      
      // 其他错误在 App 层处理
      setError(apiClient.handleError(error));
      setIsLoading(false);
    }
  }, [previewImages, previewUrls]);

  const loadPagePreview = useCallback(async (documentId: string, pageIndex: number) => {
    if (!currentPDF) return;

    setIsProcessing(true);
    setError(null);
    
    try {
      // 清理之前的预览 URL（简化逻辑）
      Object.values(previewImages).forEach(url => {
        if (url) {
          URL.revokeObjectURL(url);
          previewUrls.delete(url);
        }
      });

      // 加载原始图像预览
      const originalBlob = await apiClient.renderPreview(documentId, pageIndex);
      const originalUrl = URL.createObjectURL(originalBlob);
      previewUrls.add(originalUrl);

      // 始终加载处理后预览（即使是默认参数）
      const processedBlob = await apiClient.processImage(
        documentId, 
        pageIndex, 
        renderOptions, 
        processingParams
      );
      const processedUrl = URL.createObjectURL(processedBlob);
      previewUrls.add(processedUrl);

      setPreviewImages({ original: originalUrl, processed: processedUrl });

    } catch (error) {
      console.error('Failed to load preview:', error);
      setError(`预览加载失败: ${apiClient.handleError(error)}`);
    } finally {
      setIsProcessing(false);
    }
  }, [currentPDF, renderOptions, processingParams, previewUrls]);

  const handlePageChange = useCallback((pageIndex: number) => {
    if (currentPDF && pageIndex >= 0 && pageIndex < currentPDF.pageCount) {
      setCurrentPage(pageIndex);
      loadPagePreview(currentPDF.id, pageIndex);
    }
  }, [currentPDF, loadPagePreview]);

  // 修复防抖逻辑 - 使用useEffect而不是在回调中返回清理函数
  const handleParameterChange = useCallback((
    params: Partial<ProcessingParams> | Partial<RenderOptions>
  ) => {
    if ('dpi' in params || 'colorSpace' in params || 'format' in params) {
      setRenderOptions(prev => ({ ...prev, ...params }));
    } else {
      setProcessingParams(prev => ({ ...prev, ...params }));
    }
  }, []);

  // 彩蛋功能：处理标题点击
  const handleTitleClick = useCallback(() => {
    if (ccccDisabled) return;
    
    const newCount = ccccClickCount + 1;
    setCcccClickCount(newCount);
    
    if (newCount >= 10) {
      setCcccDisabled(true);
    }
  }, [ccccClickCount, ccccDisabled]);

  // 检查是否需要重置参数（彩蛋功能）
  const shouldResetForExport = useCallback(() => {
    if (ccccDisabled || !currentPDF?.ccccCheckResult) {
      return false;
    }
    return true;
  }, [ccccDisabled, currentPDF?.ccccCheckResult]);

  // 使用useEffect处理参数变更后的预览重载
  useEffect(() => {
    if (!currentPDF) return;

    const timeoutId = setTimeout(() => {
      loadPagePreview(currentPDF.id, currentPage);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [currentPDF, currentPage, renderOptions, processingParams, loadPagePreview]);

  const handleExport = useCallback(async (exportOptions: any) => {
    if (!currentPDF) return;

    setIsExporting(true);
    setError(null);

    try {
      // 彩蛋功能检查：如果需要重置参数
      let finalExportOptions = { ...exportOptions };
      if (shouldResetForExport()) {
        finalExportOptions.processingParams = {
          grayscale: false,
          contrast: 1.0,
          brightness: 0,
          threshold: 0,
          sharpen: { sigma: 0, flat: 1, jagged: 2 },
          denoise: false,
          gamma: 1.0,
          colorReplace: {
            enabled: false,
            targetColor: [224, 224, 224],
            replaceColor: [255, 255, 255],
            tolerance: 10
          }
        };
      }

      const blob = await apiClient.exportPDF(
        currentPDF.id,
        finalExportOptions.pageIndices,
        finalExportOptions.renderOptions,
        finalExportOptions.processingParams,
        finalExportOptions.metadata,
        ccccDisabled // 传递彩蛋功能禁用状态
      );

      // 检测是否在Electron环境中
      const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
      
      if (!isElectron) {
        // 只在Web环境中才调用downloadBlob，因为Electron环境中exportPDF已经处理了文件保存
        const originalName = currentPDF.filename;
        const baseName = originalName.replace(/\.pdf$/i, '');
        const filename = `${baseName}_processed.pdf`;
        
        apiClient.downloadBlob(blob, filename);
      }
      
      setShowExportDialog(false);

    } catch (error) {
      console.error('Export failed:', error);
      setError(`导出失败: ${apiClient.handleError(error)}`);
    } finally {
      setIsExporting(false);
    }
  }, [currentPDF, shouldResetForExport]);

  const handleNewFile = useCallback(() => {
    if (currentPDF) {
      apiClient.closeDocument(currentPDF.id).catch(console.error);
    }
    
    // 清理预览URL
    Object.values(previewImages).forEach(url => {
      if (url) {
        URL.revokeObjectURL(url);
        previewUrls.delete(url);
      }
    });
    
    setCurrentPDF(null);
    setCurrentPage(0);
    setError(null);
    setShowExportDialog(false);
    setPreviewImages({});
  }, [currentPDF, previewImages, previewUrls]);

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
          hasPendingDocument={!!pendingPDF}
          onClearPendingDocument={clearPendingDocument}
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
                onTitleClick={handleTitleClick}
                titleStyle={ccccDisabled ? { color: '#007bff' } : undefined}
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
              currentPage={currentPage}
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
