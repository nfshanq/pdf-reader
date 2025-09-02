import { useState, useCallback } from 'react';
import { PDFDocument, RenderOptions, ProcessingParams } from '@shared/types';

interface ExportDialogProps {
  pdfDocument: PDFDocument;
  renderOptions: RenderOptions;
  processingParams: ProcessingParams;
  onExport?: (options: ExportOptions) => Promise<void>;
  isExporting?: boolean;
}

interface ExportOptions {
  pageIndices: number[];
  renderOptions: RenderOptions;
  processingParams: ProcessingParams;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
  };
}

export function ExportDialog({ 
  pdfDocument, 
  renderOptions, 
  processingParams, 
  onExport,
  isExporting = false
}: ExportDialogProps) {
  const [exportMode, setExportMode] = useState<'current' | 'all' | 'range'>('current');
  const [pageRange, setPageRange] = useState({ start: 1, end: pdfDocument.pageCount });
  const [customMetadata, setCustomMetadata] = useState({
    title: '',
    author: '',
    subject: ''
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);

  // 计算要导出的页面索引
  const getSelectedPageIndices = useCallback((): number[] => {
    switch (exportMode) {
      case 'current':
        return [0]; // 这里应该是当前页面，但组件没有接收 currentPage prop
      case 'all':
        return Array.from({ length: pdfDocument.pageCount }, (_, i) => i);
      case 'range':
        const start = Math.max(0, pageRange.start - 1);
        const end = Math.min(pdfDocument.pageCount - 1, pageRange.end - 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
      default:
        return [];
    }
  }, [exportMode, pageRange, pdfDocument.pageCount]);

  // 估算文件大小
  const estimateFileSize = useCallback(() => {
    const selectedPages = getSelectedPageIndices();
    const avgPageSize = renderOptions.dpi * renderOptions.dpi * 4; // 估算每页像素数 * 4字节
    const estimated = selectedPages.length * avgPageSize;
    setEstimatedSize(estimated);
  }, [getSelectedPageIndices, renderOptions.dpi]);

  const handleExport = useCallback(async () => {
    if (!onExport) return;

    const exportOptions: ExportOptions = {
      pageIndices: getSelectedPageIndices(),
      renderOptions,
      processingParams,
      metadata: customMetadata.title || customMetadata.author || customMetadata.subject 
        ? customMetadata 
        : undefined
    };

    try {
      await onExport(exportOptions);
    } catch (error) {
      console.error('Export failed:', error);
      alert(`导出失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [onExport, getSelectedPageIndices, renderOptions, processingParams, customMetadata]);

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }, []);

  const selectedPageCount = getSelectedPageIndices().length;

  return (
    <div className="export-dialog">
      <div className="export-header">
        <h3>📤 导出 PDF</h3>
        <p>选择要导出的页面和设置</p>
      </div>

      {/* 页面选择 */}
      <div className="export-section">
        <h4>📄 页面选择</h4>
        
        <div className="export-mode-group">
          <label className="export-mode-option">
            <input
              type="radio"
              value="current"
              checked={exportMode === 'current'}
              onChange={(e) => setExportMode(e.target.value as any)}
            />
            <span>当前页面</span>
          </label>
          
          <label className="export-mode-option">
            <input
              type="radio"
              value="all"
              checked={exportMode === 'all'}
              onChange={(e) => setExportMode(e.target.value as any)}
            />
            <span>全部页面 ({pdfDocument.pageCount} 页)</span>
          </label>
          
          <label className="export-mode-option">
            <input
              type="radio"
              value="range"
              checked={exportMode === 'range'}
              onChange={(e) => setExportMode(e.target.value as any)}
            />
            <span>页面范围</span>
          </label>
        </div>

        {exportMode === 'range' && (
          <div className="page-range-inputs">
            <div className="range-input-group">
              <label>从</label>
              <input
                type="number"
                min="1"
                max={pdfDocument.pageCount}
                value={pageRange.start}
                onChange={(e) => setPageRange(prev => ({ 
                  ...prev, 
                  start: Math.max(1, Math.min(parseInt(e.target.value) || 1, pdfDocument.pageCount))
                }))}
                className="range-input"
              />
            </div>
            <span>到</span>
            <div className="range-input-group">
              <label>到</label>
              <input
                type="number"
                min={pageRange.start}
                max={pdfDocument.pageCount}
                value={pageRange.end}
                onChange={(e) => setPageRange(prev => ({ 
                  ...prev, 
                  end: Math.max(prev.start, Math.min(parseInt(e.target.value) || prev.start, pdfDocument.pageCount))
                }))}
                className="range-input"
              />
            </div>
          </div>
        )}

        <div className="selection-summary">
          选中 <strong>{selectedPageCount}</strong> 页
        </div>
      </div>

      {/* 导出设置摘要 */}
      <div className="export-section">
        <h4>⚙️ 导出设置</h4>
        
        <div className="settings-summary">
          <div className="setting-item">
            <span className="setting-label">分辨率:</span>
            <span className="setting-value">{renderOptions.dpi} DPI</span>
          </div>
          <div className="setting-item">
            <span className="setting-label">色彩:</span>
            <span className="setting-value">
              {renderOptions.colorSpace === 'RGB' ? '彩色' : '灰度'}
            </span>
          </div>
          <div className="setting-item">
            <span className="setting-label">处理:</span>
            <span className="setting-value">
              {processingParams.grayscale && '灰度 '}
              {processingParams.sharpen.sigma > 0 && '锐化 '}
              {processingParams.threshold > 0 && '二值化 '}
              {processingParams.denoise && '降噪 '}
              {!processingParams.grayscale && 
               processingParams.sharpen.sigma === 0 && 
               processingParams.threshold === 0 && 
               !processingParams.denoise && '无特殊处理'}
            </span>
          </div>
        </div>

        <button
          onClick={estimateFileSize}
          className="estimate-button"
          disabled={isExporting}
        >
          🧮 估算文件大小
        </button>

        {estimatedSize && (
          <div className="size-estimate">
            预估大小: <strong>{formatFileSize(estimatedSize)}</strong>
          </div>
        )}
      </div>

      {/* 高级选项 */}
      <div className="export-section">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="advanced-toggle"
        >
          {showAdvanced ? '▼' : '▶'} 高级选项
        </button>

        {showAdvanced && (
          <div className="advanced-options">
            <h5>📝 PDF 元数据</h5>
            
            <div className="metadata-inputs">
              <div className="metadata-input-group">
                <label>标题</label>
                <input
                  type="text"
                  value={customMetadata.title}
                  onChange={(e) => setCustomMetadata(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="文档标题"
                  className="metadata-input"
                />
              </div>
              
              <div className="metadata-input-group">
                <label>作者</label>
                <input
                  type="text"
                  value={customMetadata.author}
                  onChange={(e) => setCustomMetadata(prev => ({ ...prev, author: e.target.value }))}
                  placeholder="作者姓名"
                  className="metadata-input"
                />
              </div>
              
              <div className="metadata-input-group">
                <label>主题</label>
                <input
                  type="text"
                  value={customMetadata.subject}
                  onChange={(e) => setCustomMetadata(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="文档主题或描述"
                  className="metadata-input"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 导出按钮 */}
      <div className="export-actions">
        <button
          onClick={handleExport}
          disabled={isExporting || selectedPageCount === 0}
          className="export-button primary"
        >
          {isExporting ? (
            <>
              <span className="export-spinner"></span>
              导出中...
            </>
          ) : (
            <>
              📤 导出 PDF ({selectedPageCount} 页)
            </>
          )}
        </button>

        {isExporting && (
          <div className="export-progress">
            <div className="progress-bar">
              <div className="progress-fill"></div>
            </div>
            <p>正在处理和导出 PDF，请稍候...</p>
          </div>
        )}
      </div>

      {/* 导出提示 */}
      <div className="export-tips">
        <h5>💡 提示</h5>
        <ul>
          <li>导出过程可能需要几分钟，取决于页面数量和DPI设置</li>
          <li>高DPI设置会产生更大的文件，但图像质量更好</li>
          <li>处理大量页面时建议分批导出</li>
        </ul>
      </div>
    </div>
  );
}

export default ExportDialog;
