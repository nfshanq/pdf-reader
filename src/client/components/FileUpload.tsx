import { useState, useRef, useCallback } from 'react';

interface FileUploadProps {
  onFileUpload: (file: File, password?: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function FileUpload({ onFileUpload, isLoading, error }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleUpload = useCallback(async (file: File, pwd?: string) => {
    try {
      await onFileUpload(file, pwd);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Password required')) {
        setShowPasswordInput(true);
      }
    }
  }, [onFileUpload]);

  const handlePasswordSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !password.trim()) return;
    
    await handleUpload(selectedFile, password);
  }, [selectedFile, password, handleUpload]);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="file-upload-container">
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
                  onChange={(e) => setPassword(e.target.value)}
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
            </form>
            <button 
              onClick={() => setShowPasswordInput(false)}
              className="password-cancel"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {selectedFile && !showPasswordInput && !error && (
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
