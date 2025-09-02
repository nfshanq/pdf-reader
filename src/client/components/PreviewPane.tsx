import { useState, useEffect, useCallback } from 'react';
import { PDFDocument, PreviewImages } from '@shared/types';

interface PreviewPaneProps {
  pdfDocument: PDFDocument;
  currentPage: number;
  previewImages: PreviewImages;
  onPageChange: (pageIndex: number) => void;
  isProcessing?: boolean;
}

export function PreviewPane({ 
  pdfDocument, 
  currentPage, 
  previewImages, 
  onPageChange,
  isProcessing = false
}: PreviewPaneProps) {
  const [viewMode, setViewMode] = useState<'split' | 'original' | 'processed'>('split');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showPageInfo, setShowPageInfo] = useState(false);

  const currentPageBounds = pdfDocument.pages[currentPage];

  const handlePreviousPage = useCallback(() => {
    if (currentPage > 0) {
      onPageChange(currentPage - 1);
    }
  }, [currentPage, onPageChange]);

  const handleNextPage = useCallback(() => {
    if (currentPage < pdfDocument.pageCount - 1) {
      onPageChange(currentPage + 1);
    }
  }, [currentPage, pdfDocument.pageCount, onPageChange]);

  const handlePageInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const page = parseInt(e.target.value) - 1; // 转换为 0-based 索引
    if (page >= 0 && page < pdfDocument.pageCount) {
      onPageChange(page);
    }
  }, [pdfDocument.pageCount, onPageChange]);

  const handleZoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(prev * 1.2, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(prev / 1.2, 0.5));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomLevel(1);
  }, []);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          handlePreviousPage();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNextPage();
          break;
        case '=':
        case '+':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
          e.preventDefault();
          handleZoomReset();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePreviousPage, handleNextPage, handleZoomIn, handleZoomOut, handleZoomReset]);

  return (
    <div className="preview-pane">
      {/* 工具栏 */}
      <div className="preview-toolbar">
        <div className="page-controls">
          <button 
            onClick={handlePreviousPage}
            disabled={currentPage === 0}
            className="nav-button"
            title="上一页 (←)"
          >
            ◀
          </button>
          
          <div className="page-input-group">
            <input
              type="number"
              min="1"
              max={pdfDocument.pageCount}
              value={currentPage + 1}
              onChange={handlePageInput}
              className="page-input"
            />
            <span className="page-total">/ {pdfDocument.pageCount}</span>
          </div>
          
          <button 
            onClick={handleNextPage}
            disabled={currentPage === pdfDocument.pageCount - 1}
            className="nav-button"
            title="下一页 (→)"
          >
            ▶
          </button>
        </div>

        <div className="view-controls">
          <div className="view-mode-group">
            <button
              onClick={() => setViewMode('original')}
              className={`view-mode-button ${viewMode === 'original' ? 'active' : ''}`}
              title="仅显示原图"
            >
              原图
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`view-mode-button ${viewMode === 'split' ? 'active' : ''}`}
              title="对比显示"
            >
              对比
            </button>
            <button
              onClick={() => setViewMode('processed')}
              className={`view-mode-button ${viewMode === 'processed' ? 'active' : ''}`}
              title="仅显示处理后"
            >
              处理后
            </button>
          </div>

          <div className="zoom-controls">
            <button 
              onClick={handleZoomOut}
              disabled={zoomLevel <= 0.5}
              className="zoom-button"
              title="缩小 (-)"
            >
              🔍-
            </button>
            <span 
              className="zoom-level"
              onClick={handleZoomReset}
              title="重置缩放 (0)"
            >
              {Math.round(zoomLevel * 100)}%
            </span>
            <button 
              onClick={handleZoomIn}
              disabled={zoomLevel >= 3}
              className="zoom-button"
              title="放大 (+)"
            >
              🔍+
            </button>
          </div>

          <button
            onClick={() => setShowPageInfo(!showPageInfo)}
            className={`info-button ${showPageInfo ? 'active' : ''}`}
            title="页面信息"
          >
            ℹ️
          </button>
        </div>
      </div>

      {/* 页面信息面板 */}
      {showPageInfo && currentPageBounds && (
        <div className="page-info-panel">
          <h4>页面 {currentPage + 1} 信息</h4>
          <div className="page-info-grid">
            <div className="info-item">
              <span className="info-label">尺寸:</span>
              <span className="info-value">
                {currentPageBounds.width_pt.toFixed(1)} × {currentPageBounds.height_pt.toFixed(1)} pt
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">边界:</span>
              <span className="info-value">
                ({currentPageBounds.x0.toFixed(1)}, {currentPageBounds.y0.toFixed(1)}) 
                到 ({currentPageBounds.x1.toFixed(1)}, {currentPageBounds.y1.toFixed(1)})
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">比例:</span>
              <span className="info-value">
                {(currentPageBounds.width_pt / currentPageBounds.height_pt).toFixed(2)}:1
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 预览内容区域 */}
      <div className="preview-content">
        {isProcessing && (
          <div className="processing-overlay">
            <div className="processing-spinner"></div>
            <p>正在处理图像...</p>
          </div>
        )}

        <div 
          className={`preview-container ${viewMode}`}
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {/* 原图预览 */}
          {(viewMode === 'original' || viewMode === 'split') && (
            <div className="preview-panel original-panel">
              <div className="panel-header">
                <h4>📄 原始图像</h4>
              </div>
              <div className="image-container">
                {previewImages.original ? (
                  <img
                    src={previewImages.original}
                    alt={`页面 ${currentPage + 1} - 原始`}
                    className="preview-image"
                    loading="lazy"
                  />
                ) : (
                  <div className="image-placeholder">
                    <div className="placeholder-content">
                      <span>🔄</span>
                      <p>加载中...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 处理后预览 */}
          {(viewMode === 'processed' || viewMode === 'split') && (
            <div className="preview-panel processed-panel">
              <div className="panel-header">
                <h4>✨ 处理后图像</h4>
              </div>
              <div className="image-container">
                {previewImages.processed ? (
                  <img
                    src={previewImages.processed}
                    alt={`页面 ${currentPage + 1} - 处理后`}
                    className="preview-image"
                    loading="lazy"
                  />
                ) : (
                  <div className="image-placeholder">
                    <div className="placeholder-content">
                      <span>⚙️</span>
                      <p>调整参数以查看效果</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 快捷键提示 */}
      <div className="keyboard-shortcuts">
        <div className="shortcuts-grid">
          <span>← → 切换页面</span>
          <span>+ - 缩放</span>
          <span>0 重置缩放</span>
        </div>
      </div>
    </div>
  );
}

export default PreviewPane;
