import { useState, useRef, useCallback } from 'react';

interface FileUploadProps {
  onFileUpload: (file?: File | 'pending', password?: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  hasPendingDocument?: boolean; // 是否有待验证密码的文档
  onClearPendingDocument?: () => void; // 清除待验证文档的回调
}

export function FileUpload({ onFileUpload, isLoading, error, hasPendingDocument, onClearPendingDocument }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 检测是否在Electron环境中
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleFileSelection(file);
    }
  }, []);

  const handleFileSelection = useCallback((file: File) => {
    if (file.type !== 'application/pdf') {
      alert('请选择 PDF 文件');
      return;
    }
    
    if (file.size > 100 * 1024 * 1024) {
      alert('文件大小不能超过 100MB');
      return;
    }

    setSelectedFile(file);
    setShowPasswordInput(false);
    setPassword('');
    
    // 直接尝试上传，如果需要密码会收到提示
    handleUpload(file);
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  }, [handleFileSelection]);

  // Electron环境的文件选择处理
  const handleElectronFileSelect = useCallback(async (pwd?: string) => {
    try {
      setPasswordError(null);
      
      // 如果有待验证文档，不应该重新选择文件
      if (hasPendingDocument) {
        if (!pwd) {
          setShowPasswordInput(true);
        }
        return;
      }
      await onFileUpload(undefined, pwd);
      // 上传成功，关闭密码输入框
      setShowPasswordInput(false);
      setPassword('');
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'No file selected') {
          // 用户取消选择文件，不显示错误
          return;
        } else if (error.message.includes('Password required') || 
                   error.message.includes('Invalid password')) {
          setShowPasswordInput(true);
          if (error.message.includes('Invalid password')) {
            // 密码错误，清空输入框让用户重新输入
            setPassword('');
            setPasswordError('密码错误，请重新输入');
          } else {
            setPasswordError(null);
          }
        } else {
          setPasswordError(error.message);
        }
      }
    }
  }, [onFileUpload, hasPendingDocument]);

  const handleUpload = useCallback(async (file: File, pwd?: string) => {
    try {
      setPasswordError(null);
      await onFileUpload(file, pwd);
      // 上传成功，关闭密码输入框
      setShowPasswordInput(false);
      setPassword('');
    } catch (error) {
      if (error instanceof Error && (
        error.message.includes('Password required') || 
        error.message.includes('Invalid password')
      )) {
        setShowPasswordInput(true);
        if (error.message.includes('Invalid password')) {
          // 密码错误，清空输入框让用户重新输入
          setPassword('');
          setPasswordError('密码错误，请重新输入');
        } else {
          setPasswordError(null);
        }
      }
    }
  }, [onFileUpload]);

  const handlePasswordSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    
    
    
          if (isElectron) {
        // 对于Electron环境，如果有待验证文档，直接验证密码而不重新选择文件
        if (hasPendingDocument) {
          // 直接传递 'pending' 标识，让 App.tsx 知道这是密码验证而不是新文件选择
          await onFileUpload('pending', password);
        } else {
          await handleElectronFileSelect(password);
        }
      } else {
      if (!selectedFile) return;
      await handleUpload(selectedFile, password);
    }
  }, [selectedFile, password, handleUpload, handleElectronFileSelect, isElectron, hasPendingDocument, onFileUpload]);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="file-upload-container">
      {isElectron ? (
        // Electron环境：显示选择文件按钮
        <div className={`electron-file-selector ${isLoading ? 'loading' : ''}`}>
          {isLoading ? (
            <div className="upload-loading">
              <div className="spinner"></div>
              <p>正在处理 PDF 文件...</p>
            </div>
          ) : (
            <div className="upload-content">

              <div className="upload-icon">📄</div>
              <h3>{hasPendingDocument ? '需要密码验证' : '选择 PDF 文件'}</h3>
              {!hasPendingDocument && (
                <button 
                  onClick={() => handleElectronFileSelect()}
                  className="select-file-button"
                  disabled={isLoading}
                >
                  📂 浏览文件
                </button>
              )}
              {hasPendingDocument && (
                <div style={{ margin: '1rem 0' }}>
                  <p style={{ color: '#666', marginBottom: '1rem' }}>
                    已选择加密的PDF文件，请输入密码
                  </p>
                  <button 
                    onClick={() => {
                      // 重新选择文件
                      setShowPasswordInput(false);
                      setPassword('');
                      setPasswordError(null);
                      onClearPendingDocument?.(); // 清除待验证的文档
                      handleElectronFileSelect();
                    }}
                    className="select-file-button"
                    style={{ 
                      background: 'linear-gradient(135deg, #757575 0%, #424242 100%)',
                      fontSize: '0.9rem'
                    }}
                  >
                    🔄 重新选择文件
                  </button>
                </div>
              )}
              <div className="upload-info">
                <span>支持格式：PDF</span>
                <span>最大大小：1GB</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Web环境：保持原有的拖拽上传功能
        <div 
          className={`file-upload-zone ${dragActive ? 'drag-active' : ''} ${isLoading ? 'loading' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={openFileDialog}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
          />
          
          {isLoading ? (
            <div className="upload-loading">
              <div className="spinner"></div>
              <p>正在处理 PDF 文件...</p>
            </div>
          ) : (
            <div className="upload-content">
              <div className="upload-icon">📄</div>
              <h3>上传 PDF 文件</h3>
              <p>拖拽文件到此处，或点击选择文件</p>
              <div className="upload-info">
                <span>支持格式：PDF</span>
                <span>最大大小：100MB</span>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}

      {showPasswordInput && (
        <div className="password-modal">
          <div className="password-modal-content">
            <h3>🔒 PDF 文件已加密</h3>
            <p>请输入密码以继续：</p>
            <form onSubmit={handlePasswordSubmit}>
              <div className="password-input-group">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  placeholder="请输入密码"
                  autoFocus
                  className="password-input"
                />
                <button 
                  type="submit" 
                  disabled={!password.trim() || isLoading}
                  className="password-submit"
                >
                  {isLoading ? '验证中...' : '确认'}
                </button>
              </div>
              {passwordError && (
                <div className="password-error">
                  <span className="error-icon">⚠️</span>
                  {passwordError}
                </div>
              )}
            </form>
            <button 
              onClick={() => {
                setShowPasswordInput(false);
                setPassword('');
                setPasswordError(null);
              }}
              className="password-cancel"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {!isElectron && selectedFile && !showPasswordInput && !error && (
        <div className="file-info">
          <div className="file-details">
            <span className="file-name">{selectedFile.name}</span>
            <span className="file-size">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default FileUpload;
