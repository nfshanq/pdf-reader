import { useCallback } from 'react';
import { RenderOptions, ProcessingParams } from '@shared/types';

interface ParameterPanelProps {
  renderOptions: RenderOptions;
  processingParams: ProcessingParams;
  onParameterChange: (params: Partial<ProcessingParams> | Partial<RenderOptions>) => void;
  disabled?: boolean;
}

export function ParameterPanel({ 
  renderOptions, 
  processingParams, 
  onParameterChange, 
  disabled = false 
}: ParameterPanelProps) {

  const handleRenderOptionChange = useCallback((key: keyof RenderOptions, value: any) => {
    onParameterChange({ [key]: value });
  }, [onParameterChange]);

  const handleProcessingParamChange = useCallback((key: keyof ProcessingParams, value: any) => {
    onParameterChange({ [key]: value });
  }, [onParameterChange]);

  const handleSharpenChange = useCallback((key: keyof ProcessingParams['sharpen'], value: number) => {
    onParameterChange({
      sharpen: {
        ...processingParams.sharpen,
        [key]: value
      }
    });
  }, [onParameterChange, processingParams.sharpen]);

  const resetToDefaults = useCallback(() => {
    onParameterChange({
      dpi: 150,
      colorSpace: "RGB" as const,
      format: "PNG" as const
    });
    onParameterChange({
      grayscale: false,
      contrast: 1.0,
      brightness: 0,
      threshold: 0,
      sharpen: { sigma: 0, flat: 1, jagged: 2 },
      denoise: false,
      gamma: 1.0
    });
  }, [onParameterChange]);

  return (
    <div className="parameter-panel">
      <div className="panel-header">
        <h3>📊 处理参数</h3>
        <button 
          onClick={resetToDefaults}
          className="reset-button"
          disabled={disabled}
        >
          重置
        </button>
      </div>

      {/* 渲染选项 */}
      <div className="parameter-section">
        <h4>🖼️ 渲染设置</h4>
        
        <div className="parameter-group">
          <label className="parameter-label">
            分辨率 (DPI)
            <span className="parameter-value">{renderOptions.dpi}</span>
          </label>
          <input
            type="range"
            min="72"
            max="300"
            step="6"
            value={renderOptions.dpi}
            onChange={(e) => handleRenderOptionChange('dpi', parseInt(e.target.value))}
            disabled={disabled}
            className="parameter-slider"
          />
          <div className="parameter-hint">
            72: 预览 | 150: 标准 | 300: 高质量
          </div>
        </div>

        <div className="parameter-group">
          <label className="parameter-label">色彩空间</label>
          <div className="parameter-radio-group">
            <label className="radio-option">
              <input
                type="radio"
                value="RGB"
                checked={renderOptions.colorSpace === "RGB"}
                onChange={(e) => handleRenderOptionChange('colorSpace', e.target.value)}
                disabled={disabled}
              />
              <span>彩色 (RGB)</span>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                value="Gray"
                checked={renderOptions.colorSpace === "Gray"}
                onChange={(e) => handleRenderOptionChange('colorSpace', e.target.value)}
                disabled={disabled}
              />
              <span>灰度</span>
            </label>
          </div>
        </div>
      </div>

      {/* 图像处理参数 */}
      <div className="parameter-section">
        <h4>🎨 图像增强</h4>

        <div className="parameter-group">
          <label className="parameter-checkbox">
            <input
              type="checkbox"
              checked={processingParams.grayscale}
              onChange={(e) => handleProcessingParamChange('grayscale', e.target.checked)}
              disabled={disabled}
            />
            <span>转为灰度</span>
          </label>
        </div>

        <div className="parameter-group">
          <label className="parameter-label">
            对比度
            <span className="parameter-value">{processingParams.contrast.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={processingParams.contrast}
            onChange={(e) => handleProcessingParamChange('contrast', parseFloat(e.target.value))}
            disabled={disabled}
            className="parameter-slider"
          />
          <div className="parameter-hint">
            0.5: 低对比度 | 1.0: 原始 | 2.0: 高对比度
          </div>
        </div>

        <div className="parameter-group">
          <label className="parameter-label">
            亮度
            <span className="parameter-value">{processingParams.brightness}</span>
          </label>
          <input
            type="range"
            min="-50"
            max="50"
            step="5"
            value={processingParams.brightness}
            onChange={(e) => handleProcessingParamChange('brightness', parseInt(e.target.value))}
            disabled={disabled}
            className="parameter-slider"
          />
          <div className="parameter-hint">
            -50: 变暗 | 0: 原始 | 50: 变亮
          </div>
        </div>

        <div className="parameter-group">
          <label className="parameter-label">
            伽马校正
            <span className="parameter-value">{processingParams.gamma.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={processingParams.gamma}
            onChange={(e) => handleProcessingParamChange('gamma', parseFloat(e.target.value))}
            disabled={disabled}
            className="parameter-slider"
          />
          <div className="parameter-hint">
            0.5: 中间调变亮 | 1.0: 原始 | 2.0: 中间调变暗
          </div>
        </div>
      </div>

      {/* 锐化设置 */}
      <div className="parameter-section">
        <h4>🔍 锐化设置</h4>

        <div className="parameter-group">
          <label className="parameter-label">
            锐化强度
            <span className="parameter-value">{processingParams.sharpen.sigma.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="3"
            step="0.1"
            value={processingParams.sharpen.sigma}
            onChange={(e) => handleSharpenChange('sigma', parseFloat(e.target.value))}
            disabled={disabled}
            className="parameter-slider"
          />
          <div className="parameter-hint">
            0: 无锐化 | 1.0: 轻微 | 3.0: 强锐化
          </div>
        </div>

        {processingParams.sharpen.sigma > 0 && (
          <>
            <div className="parameter-group">
              <label className="parameter-label">
                平坦区域阈值
                <span className="parameter-value">{processingParams.sharpen.flat.toFixed(1)}</span>
              </label>
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.1"
                value={processingParams.sharpen.flat}
                onChange={(e) => handleSharpenChange('flat', parseFloat(e.target.value))}
                disabled={disabled}
                className="parameter-slider"
              />
            </div>

            <div className="parameter-group">
              <label className="parameter-label">
                边缘锐化
                <span className="parameter-value">{processingParams.sharpen.jagged.toFixed(1)}</span>
              </label>
              <input
                type="range"
                min="1"
                max="5"
                step="0.1"
                value={processingParams.sharpen.jagged}
                onChange={(e) => handleSharpenChange('jagged', parseFloat(e.target.value))}
                disabled={disabled}
                className="parameter-slider"
              />
            </div>
          </>
        )}
      </div>

      {/* 高级选项 */}
      <div className="parameter-section">
        <h4>⚙️ 高级选项</h4>

        <div className="parameter-group">
          <label className="parameter-checkbox">
            <input
              type="checkbox"
              checked={processingParams.denoise}
              onChange={(e) => handleProcessingParamChange('denoise', e.target.checked)}
              disabled={disabled}
            />
            <span>降噪处理</span>
          </label>
          <div className="parameter-hint">
            轻微的高斯模糊降噪，适用于扫描文档
          </div>
        </div>

        <div className="parameter-group">
          <label className="parameter-label">
            二值化阈值
            <span className="parameter-value">
              {processingParams.threshold === 0 ? '关闭' : processingParams.threshold}
            </span>
          </label>
          <input
            type="range"
            min="0"
            max="255"
            step="5"
            value={processingParams.threshold}
            onChange={(e) => handleProcessingParamChange('threshold', parseInt(e.target.value))}
            disabled={disabled}
            className="parameter-slider"
          />
          <div className="parameter-hint">
            0: 关闭 | 128: 标准 | 255: 最强二值化
          </div>
        </div>
      </div>

      {/* 预设配置 */}
      <div className="parameter-section">
        <h4>🎯 快速预设</h4>
        <div className="preset-buttons">
          <button
            onClick={() => onParameterChange({
              contrast: 1.2,
              brightness: 5,
              sharpen: { sigma: 1.0, flat: 1.5, jagged: 2.0 },
              gamma: 1.0,
              denoise: false,
              threshold: 0
            })}
            disabled={disabled}
            className="preset-button"
          >
            📖 文档增强
          </button>
          <button
            onClick={() => onParameterChange({
              grayscale: true,
              contrast: 1.5,
              brightness: 10,
              sharpen: { sigma: 1.5, flat: 1.0, jagged: 2.5 },
              gamma: 0.9,
              denoise: true,
              threshold: 128
            })}
            disabled={disabled}
            className="preset-button"
          >
            📄 扫描清理
          </button>
          <button
            onClick={() => onParameterChange({
              contrast: 1.1,
              brightness: 0,
              sharpen: { sigma: 0.5, flat: 2.0, jagged: 3.0 },
              gamma: 1.0,
              denoise: false,
              threshold: 0
            })}
            disabled={disabled}
            className="preset-button"
          >
            🖼️ 图像优化
          </button>
        </div>
      </div>
    </div>
  );
}

export default ParameterPanel;
