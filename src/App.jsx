import { useState, useEffect } from 'react'
import './App.css'
import VoiceTranslation from './components/VoiceTranslation'

function App() {
  // 后端 API 地址 - 使用环境变量或配置为公网 IP
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
  
  // 导航状态
  const [activePage, setActivePage] = useState('video') // 'video' 或 'voice'
  
  const [videoFile, setVideoFile] = useState(null)
  const [sourceLanguage, setSourceLanguage] = useState('auto')
  const [targetLanguage, setTargetLanguage] = useState('zh')
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState('')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [ws, setWs] = useState(null)
  const [useProofreading, setUseProofreading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  
  // 字幕样式设置
  const [subtitleStyle, setSubtitleStyle] = useState({
    fontName: 'WenQuanYi Micro Hei',
    fontSize: 24,
    fontColor: '#FFFFFF',
    position: 'bottom'
  })

  // 字幕样式展开状态
  const [subtitleStyleExpanded, setSubtitleStyleExpanded] = useState(false)

  // 拖拽上传相关状态
  const [isDragging, setIsDragging] = useState(false)

  // 深色模式状态
  const [darkMode, setDarkMode] = useState(false)

  // 拖拽事件处理函数
  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange({ target: { files: e.dataTransfer.files } })
    }
  }

  // 建立WebSocket连接
  useEffect(() => {
    // 连接进度推送 WebSocket 路由
    const wsUrl = API_URL.replace('http', 'ws') + '/ws/progress'
    const socket = new WebSocket(wsUrl)
    
    socket.onopen = () => {
      console.log('WebSocket连接已建立')
    }
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'progress') {
          setCurrentStep(data.step)
          setProgress(data.progress)
        }
      } catch (error) {
        console.error('解析WebSocket消息失败:', error)
      }
    }
    
    socket.onclose = () => {
      console.log('WebSocket连接已关闭')
    }
    
    socket.onerror = (error) => {
      console.error('WebSocket错误:', error)
    }
    
    setWs(socket)
    
    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close()
      }
    }
  }, [API_URL])

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    setVideoFile(file)
    
    // 生成预览URL
    if (file) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
    } else {
      setPreviewUrl(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!videoFile) return
    
    setIsProcessing(true)
    setProgress(0)
    setCurrentStep('准备上传')
    setError(null)
    setResult(null)
    
    try {
      const formData = new FormData()
      formData.append('video', videoFile)
      formData.append('sourceLanguage', sourceLanguage)
      formData.append('targetLanguage', targetLanguage)
      formData.append('useProofreading', useProofreading.toString())
      formData.append('subtitleStyle', JSON.stringify(subtitleStyle))
      
      const response = await fetch(`${API_URL}/api/translate-video`, {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        let errorMsg = 'API request failed'
        try {
          const errorData = await response.json()
          errorMsg = errorData.error || errorMsg
        } catch (e) {
          errorMsg = `HTTP ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMsg)
      }
      
      const data = await response.json()
      setResult(data)
      setCurrentStep('处理完成')
      setProgress(100)
    } catch (error) {
      console.error('Error:', error)
      setError(`翻译失败: ${error.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <header className="header">
        <div className="header-content">
          <h1>视频翻译</h1>
          <div className="nav-tabs">
            <button 
              className={`nav-tab ${activePage === 'video' ? 'active' : ''}`}
              onClick={() => setActivePage('video')}
            >
              视频翻译
            </button>
            <button 
              className={`nav-tab ${activePage === 'voice' ? 'active' : ''}`}
              onClick={() => setActivePage('voice')}
            >
              语音翻译
            </button>
          </div>
          <button 
            className="dark-mode-toggle"
            onClick={() => setDarkMode(!darkMode)}
            aria-label={darkMode ? '切换到亮色模式' : '切换到深色模式'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <main className="main">
        {activePage === 'video' ? (
          <>
            <form onSubmit={handleSubmit} className="upload-form">
              <div 
                className={`form-group ${isDragging ? 'drag-active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <label htmlFor="video-upload">上传视频</label>
                <div className="file-upload-area">
                  <input
                    type="file"
                    id="video-upload"
                    accept="video/*"
                    onChange={handleFileChange}
                    required
                  />
                  <div className="drag-hint">
                    {isDragging ? '松开文件上传' : '或将文件拖拽到此处'}
                  </div>
                  {videoFile && (
                    <p className="file-name">{videoFile.name}</p>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="source-language">源语言</label>
                <select
                  id="source-language"
                  value={sourceLanguage}
                  onChange={(e) => setSourceLanguage(e.target.value)}
                >
                  <option value="auto">自动检测</option>
                  <option value="en">英语</option>
                  <option value="zh">中文</option>
                  <option value="ja">日语</option>
                  <option value="ko">韩语</option>
                  <option value="fr">法语</option>
                  <option value="de">德语</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="target-language">目标语言</label>
                <select
                  id="target-language"
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                >
                  <option value="zh">中文</option>
                  <option value="en">英语</option>
                  <option value="ja">日语</option>
                  <option value="ko">韩语</option>
                  <option value="fr">法语</option>
                  <option value="de">德语</option>
                </select>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={false}
                    disabled={true}
                    onChange={() => {}}
                  />
                  使用翻译校准（提高翻译质量）
                  <span className="feature-disabled">（功能暂时禁用，等待后续完善）</span>
                </label>
                <p className="style-disabled">翻译校准功能暂时禁用，使用标准翻译流程</p>
              </div>

              {/* 字幕样式设置 */}
              <div className="form-group">
                <div className="subtitle-style-header" onClick={() => setSubtitleStyleExpanded(!subtitleStyleExpanded)}>
                  <label>字幕样式</label>
                  <span className={`expand-icon ${subtitleStyleExpanded ? 'expanded' : ''}`}>
                    {subtitleStyleExpanded ? '▼' : '▶'}
                  </span>
                </div>
                {subtitleStyleExpanded && (
                  <div className="subtitle-style-content">
                    <div className="subtitle-style-options">
                      <div className="style-option">
                        <p className="style-disabled">字幕样式设置功能暂时禁用，使用默认样式</p>
                      </div>
                    </div>
                    
                    {/* 字体样式预览 */}
                    <div className="font-preview">
                      <label>预览</label>
                      <div 
                        className="preview-text"
                        style={{
                          fontFamily: 'WenQuanYi Micro Hei',
                          fontSize: '24px',
                          color: '#FFFFFF',
                          backgroundColor: 'rgba(0,0,0,0.8)',
                          padding: '10px',
                          borderRadius: '4px',
                          textAlign: 'center'
                        }}
                      >
                        这是字幕预览效果
                      </div>
                    </div>
                  </div>
                )}
              </div>



              {isProcessing && (
                <div className="progress-container">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <p className="progress-text">{currentStep}... {progress}%</p>
                </div>
              )}
              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}
              <button 
                type="submit" 
                className="submit-button"
                disabled={isProcessing}
              >
                {isProcessing ? '处理中...' : '开始翻译'}
              </button>
            </form>

            {result && (
              <div className="result-section">
                <h2>翻译完成</h2>
                
                {/* 步骤状态显示 */}
                {result.steps && result.steps.length > 0 && (
                  <div className="steps-section">
                    <h3>处理步骤状态</h3>
                    <div className="steps-list">
                      {result.steps.map((step, index) => (
                        <div key={index} className={`step-item step-${step.status}`}>
                          <div className="step-header">
                            <span className="step-name">{step.name}</span>
                            <span className={`step-status ${step.status}`}>
                              {step.status === 'success' ? '✅' : step.status === 'failed' ? '❌' : step.status === 'partial_success' ? '⚠️' : '⏳'}
                              {step.status}
                            </span>
                          </div>
                          <div className="step-message">{step.message}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="video-preview-section">
                  <h3>翻译后视频预览</h3>
                  <div className="video-preview">
                    <video
                      src={`${API_URL}${result.videoUrl.replace('/uploads/', '/preview/')}`}
                      controls
                      width="100%"
                      maxHeight="400px"
                      className="preview-video"
                      onError={(e) => {
                        console.error('视频加载失败:', e);
                        alert('视频预览加载失败，请尝试下载视频');
                      }}
                    />
                  </div>
                  <p className="preview-note">如果预览无法播放，请直接下载视频查看</p>
                </div>
                
                <div className="download-section">
                  <h3>下载视频</h3>
                  <p>视频翻译已完成，请下载：</p>
                  <a 
                    href={`${API_URL}${result.videoUrl}`} 
                    download
                    className="download-button"
                  >
                    下载翻译后视频
                  </a>
                </div>
              </div>
            )}
          </>
        ) : (
          <VoiceTranslation />
        )}
      </main>

      <footer className="footer">
        <p>© 2026 视频翻译网站</p>
      </footer>
    </div>
  )
}

export default App
