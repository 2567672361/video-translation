import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './VideoStudio.css'
import SubtitleEditor from './SubtitleEditor'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const SOURCE_LANGUAGES = [
  { value: 'auto', label: '自动检测' },
  { value: 'en', label: '英语' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'fr', label: '法语' },
  { value: 'de', label: '德语' },
]

const TARGET_LANGUAGES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'fr', label: '法语' },
  { value: 'de', label: '德语' },
]

const PIPELINE = [
  { id: 'upload', index: '01', label: '上传素材' },
  { id: 'extract', index: '02', label: '提取音轨' },
  { id: 'asr', index: '03', label: '语音识别' },
  { id: 'translate', index: '04', label: '逐句翻译' },
  { id: 'render', index: '05', label: '字幕合成' },
]

const JOB_STATUS_TEXT = {
  pending: '等待',
  running: '处理中',
  succeeded: '完成',
  failed: '失败',
  canceled: '已取消',
  canceling: '取消中',
}

const statusText = (status) => JOB_STATUS_TEXT[status] || status || '未知'

const STATUS_LABEL = {
  success: '成功',
  failed: '失败',
  partial_success: '部分成功',
  running: '进行中',
  pending: '等待中',
}

function resolveStageIndex(progress, processing, done) {
  if (done) return PIPELINE.length
  if (!processing) return 0
  if (progress < 10) return 0
  if (progress < 30) return 1
  if (progress < 65) return 2
  if (progress < 92) return 3
  return 4
}

function formatSize(bytes) {
  if (!bytes) return '0 MB'
  const mb = bytes / 1024 / 1024
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`
}

function VideoStudio() {
  const [videoFile, setVideoFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [sourceLanguage, setSourceLanguage] = useState('auto')
  const [targetLanguage, setTargetLanguage] = useState('zh')
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState('')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [channelState, setChannelState] = useState('connecting')
  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState('idle')
  const [history, setHistory] = useState([])
  const [failedJobId, setFailedJobId] = useState(null)
  const [subtitles, setSubtitles] = useState([])
  const [activeSub, setActiveSub] = useState(-1)
  const videoRef = useRef(null)
  const [overlayEl, setOverlayEl] = useState(null)
  const [playing, setPlaying] = useState(false)

  const pollTimer = useRef(null)
  const activeJobId = useRef(null)

  const inputRef = useRef(null)
  const dragDepth = useRef(0)

  /* 进度通道：后端通过 WebSocket 推送处理步骤与百分比，断线后自动重连 */
  useEffect(() => {
    let socket = null
    let retryTimer = null
    let disposed = false

    const scheduleRetry = () => {
      if (disposed || retryTimer) return
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        connect()
      }, 4000)
    }

    const connect = () => {
      try {
        const wsUrl = API_URL.replace(/^http/, 'ws') + '/ws/progress'
        socket = new WebSocket(wsUrl)

        socket.onopen = () => {
          if (!disposed) setChannelState('ready')
        }
        socket.onclose = () => {
          if (disposed) return
          setChannelState('offline')
          scheduleRetry()
        }
        socket.onerror = () => {
          if (!disposed) setChannelState('offline')
        }
        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'progress') {
              if (data.jobId && data.jobId !== activeJobId.current) return
              setCurrentStep(data.step || '')
              setProgress(Number(data.progress) || 0)
            }
          } catch (err) {
            console.warn('进度消息解析失败', err)
          }
        }
      } catch {
        setChannelState('offline')
        scheduleRetry()
      }
    }

    connect()

    return () => {
      disposed = true
      if (retryTimer) window.clearTimeout(retryTimer)
      if (socket && socket.readyState === WebSocket.OPEN) socket.close()
    }
  }, [])

  /* 预览地址随文件生命周期释放 */
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const acceptFile = useCallback(
    (file) => {
      if (!file) return
      if (!file.type.startsWith('video/')) {
        setError('这个文件不是视频格式，请选择 MP4 / MOV / WebM 等素材。')
        return
      }
      setError(null)
      setResult(null)
      setProgress(0)
      setCurrentStep('')
      setVideoFile(file)
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return URL.createObjectURL(file)
      })
    },
    [],
  )

  const openPicker = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const resetFile = useCallback(() => {
    setVideoFile(null)
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return null
    })
    setResult(null)
    setProgress(0)
    setCurrentStep('')
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const onDragEnter = (event) => {
    event.preventDefault()
    dragDepth.current += 1
    setIsDragging(true)
  }

  const onDragOver = (event) => {
    event.preventDefault()
  }

  const onDragLeave = (event) => {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragging(false)
  }

  const onDrop = (event) => {
    event.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) acceptFile(file)
  }

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      window.clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/jobs?limit=8`)
      if (!response.ok) return
      const data = await response.json()
      setHistory(Array.isArray(data.jobs) ? data.jobs : [])
    } catch {
      /* 历史记录加载失败不打断主流程 */
    }
  }, [])

  const loadSubtitles = useCallback(async (id) => {
    try {
      const response = await fetch(`${API_URL}/api/jobs/${id}/subtitles`)
      if (!response.ok) return
      const data = await response.json()
      setSubtitles(Array.isArray(data.subtitles) ? data.subtitles : [])
    } catch {
      setSubtitles([])
    }
  }, [])

  const seekToSubtitle = useCallback((item) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, (Number(item.start_ms) || 0) / 1000)
    if (video.paused) video.play().catch(() => {})
  }, [])

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const ms = video.currentTime * 1000
    const index = subtitles.findIndex((item) => ms >= (item.start_ms || 0) && ms < (item.end_ms || 0))
    setActiveSub((prev) => (prev === index ? prev : index))
  }, [subtitles])

  const applyJob = useCallback((job) => {
    setProgress(job.progress || 0)
    setCurrentStep(job.current_step || '')
    setJobStatus(job.status)
    if (job.status === 'succeeded') {
      setResult({ videoUrl: job.video_url, steps: job.steps || [] })
      setJobId(job.id)
      loadSubtitles(job.id)
      setIsProcessing(false)
      setFailedJobId(null)
      setProgress(100)
      setCurrentStep('处理完成')
    } else if (job.status === 'failed') {
      setError(job.error_message || '处理失败')
      setIsProcessing(false)
      setFailedJobId(job.id)
    } else if (job.status === 'canceled') {
      setIsProcessing(false)
      setFailedJobId(job.id)
      setCurrentStep('已取消')
    }
  }, [loadSubtitles])

  const pollJob = useCallback(async (id) => {
    try {
      const response = await fetch(`${API_URL}/api/jobs/${id}`)
      if (!response.ok) return false
      const data = await response.json()
      applyJob(data.job)
      if (['succeeded', 'failed', 'canceled'].includes(data.job.status)) {
        stopPolling()
        loadHistory()
        if (data.job.status !== 'succeeded') setJobId(null)
        return true
      }
    } catch {
      /* 网络抖动时继续轮询 */
    }
    return false
  }, [applyJob, loadHistory, stopPolling])

  const startPolling = useCallback((id) => {
    stopPolling()
    activeJobId.current = id
    pollTimer.current = window.setInterval(() => pollJob(id), 1500)
  }, [pollJob, stopPolling])

  useEffect(() => {
    loadHistory()
    return () => stopPolling()
  }, [loadHistory, stopPolling])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!videoFile || isProcessing) return

    setIsProcessing(true)
    setProgress(0)
    setCurrentStep('提交任务')
    setError(null)
    setResult(null)
    setJobStatus('pending')

    try {
      const formData = new FormData()
      formData.append('video', videoFile)
      formData.append('sourceLanguage', sourceLanguage)
      formData.append('targetLanguage', targetLanguage)
      formData.append('useProofreading', 'false')
      formData.append(
        'subtitleStyle',
        JSON.stringify({ fontName: 'WenQuanYi Micro Hei', fontSize: 24, fontColor: '#FFFFFF', position: 'bottom' }),
      )

      const response = await fetch(`${API_URL}/api/translate-video`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      setJobId(data.jobId)
      activeJobId.current = data.jobId
      startPolling(data.jobId)
    } catch (err) {
      setError(err.message || '提交失败，请检查后端服务是否已启动。')
      setIsProcessing(false)
    }
  }

  const cancelJob = async () => {
    if (!jobId) return
    try {
      await fetch(`${API_URL}/api/jobs/${jobId}/cancel`, { method: 'POST' })
      setCurrentStep('取消中')
    } catch {
      setError('取消失败，请稍后重试')
    }
  }

  const retryJob = async () => {
    if (!failedJobId || isProcessing) return
    try {
      const response = await fetch(`${API_URL}/api/jobs/${failedJobId}/retry`, { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || '重试失败')
      }
      setError(null)
      setResult(null)
      setIsProcessing(true)
      setProgress(0)
      setCurrentStep('重新提交任务')
      setJobStatus('pending')
      setJobId(data.jobId)
      startPolling(data.jobId)
    } catch (err) {
      setError(err.message || '重试失败')
    }
  }

  const openHistoryJob = async (id) => {
    try {
      const response = await fetch(`${API_URL}/api/jobs/${id}`)
      if (!response.ok) return
      const data = await response.json()
      setError(null)
      setResult(null)
      applyJob(data.job)
    } catch {
      setError('读取历史任务失败')
    }
  }

  const stageIndex = resolveStageIndex(progress, isProcessing, Boolean(result))
  const previewSrc = useMemo(() => {
    if (!result?.videoUrl) return null
    return `${API_URL}${result.videoUrl.replace('/uploads/', '/preview/')}`
  }, [result])

  return (
    <div className="studio">
      <aside className="rail rise" aria-label="处理工序">
        <p className="rail-heading">工序 / Pipeline</p>
        <ol className="rail-steps">
          {PIPELINE.map((stage, index) => {
            const state = index < stageIndex ? 'done' : index === stageIndex ? 'active' : 'idle'
            return (
              <li key={stage.id} className="rail-step" data-state={state}>
                <span className="rail-step-index">{stage.index}</span>
                <span>{stage.label}</span>
              </li>
            )
          })}
        </ol>
        <p className="rail-note">
          <strong>长片策略</strong>
          超过 5 分钟的素材会自动分段，逐段识别与翻译后再合并时间轴。
        </p>
      </aside>

      <section className="stage rise" style={{ animationDelay: '60ms' }}>
        <div className="stage-head">
          <div>
            <p className="stage-eyebrow mono">素材 / Source</p>
            <h1 className="stage-title">
              {videoFile ? '确认素材与语言' : '把片子放进来'}
            </h1>
          </div>
          {videoFile && (
            <button type="button" className="btn btn-quiet" onClick={resetFile} disabled={isProcessing}>
              重新选择
            </button>
          )}
        </div>

        <div
          className={`frame ${isDragging ? 'is-dragging' : ''} ${videoFile ? 'has-file' : ''}`}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {videoFile ? (
            <>
              <video className="frame-video" src={previewUrl} controls playsInline />
              {!isProcessing && !result && (
                <p className="caption-ghost" aria-hidden="true">
                  字幕将在这里出现
                </p>
              )}
              {isProcessing && (
                <div className="frame-overlay" aria-live="polite">
                  <p className="frame-overlay-step">{currentStep || '正在处理'}</p>
                  <p className="frame-overlay-pct mono">{progress}%</p>
                </div>
              )}
            </>
          ) : (
            <div
              className="frame-empty"
              role="button"
              tabIndex={0}
              onClick={openPicker}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openPicker()
                }
              }}
            >
              <span className="drop-icon" aria-hidden="true">
                ↓
              </span>
              <span className="drop-title">拖拽视频到这里</span>
              <span className="drop-hint">或点击选择文件 · MP4 / MOV / WebM</span>
              <span className="drop-action">选择文件</span>
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="visually-hidden"
          onChange={(event) => {
            acceptFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />

        {videoFile && (
          <div className="file-meta">
            <span className="file-name">{videoFile.name}</span>
            <span className="file-size mono">{formatSize(videoFile.size)}</span>
          </div>
        )}

        <dl className="tech-strip">
          <div>
            <dt>识别</dt>
            <dd>火山引擎大模型 ASR</dd>
          </div>
          <div>
            <dt>翻译</dt>
            <dd>豆包 · 混元本地可切换</dd>
          </div>
          <div>
            <dt>合成</dt>
            <dd>FFmpeg 字幕烧录</dd>
          </div>
        </dl>

        {(isProcessing || progress > 0) && !result && (
          <div className="progress-block">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
            <div className="progress-legend">
              <span className="mono">{String(Math.min(progress, 100)).padStart(3, '0')}%</span>
              <span>{currentStep || '等待后端推流'}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="notice notice-error" role="alert">
            <span className="notice-mark">!</span>
            <p>{error}</p>
            {failedJobId && !isProcessing && (
              <button type="button" className="notice-retry" onClick={retryJob}>
                重试
              </button>
            )}
          </div>
        )}

        {result && (
          <section className="result rise" aria-label="翻译结果">
            <div className="result-head">
              <h2>翻译完成</h2>
              <span className="badge badge-success">SRT 已生成</span>
            </div>

            {Array.isArray(result.steps) && result.steps.length > 0 && (
              <ol className="step-list">
                {result.steps.map((step, index) => (
                  <li key={`${step.name}-${index}`} className="step-row" data-status={step.status}>
                    <span className="step-dot" aria-hidden="true" />
                    <div className="step-body">
                      <p className="step-name">{step.name}</p>
                      {step.message && <p className="step-message">{step.message}</p>}
                    </div>
                    <span className="step-status mono">{STATUS_LABEL[step.status] || step.status}</span>
                  </li>
                ))}
              </ol>
            )}

            {previewSrc && (
              <div className="editor-grid">
                <div className="editor-player video-stage">
                  <video
                    ref={videoRef}
                    src={previewSrc}
                    controls
                    playsInline
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onError={() => setError('视频预览加载失败，可直接下载查看。')}
                  />
                  <div className="caption-overlay-host" ref={setOverlayEl} />
                </div>
                <SubtitleEditor
                  jobId={jobId}
                  subtitles={subtitles}
                  activeIndex={activeSub}
                  onSeek={seekToSubtitle}
                  onSaved={setSubtitles}
                  onRendered={(url) => setResult((prev) => (prev ? { ...prev, videoUrl: url } : prev))}
                  overlayHost={overlayEl}
                  isPlaying={playing}
                />
              </div>
            )}

            <div className="result-actions">
              <a className="btn btn-primary" href={`${API_URL}${result.videoUrl}`} download>
                下载翻译视频
              </a>
              <button type="button" className="btn" onClick={resetFile}>
                换一个素材
              </button>
            </div>
          </section>
        )}
      </section>

      <aside className="inspector rise" style={{ animationDelay: '120ms' }} aria-label="参数设置">
        <div>
          <p className="panel-title">语言</p>
          <div className="lang-pair">
            <div className="field">
              <span className="field-label">源语言</span>
              <span className="select-wrap">
                <select
                  className="select"
                  value={sourceLanguage}
                  onChange={(event) => setSourceLanguage(event.target.value)}
                  disabled={isProcessing}
                  aria-label="源语言"
                >
                  {SOURCE_LANGUAGES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </span>
            </div>
            <span className="lang-arrow" aria-hidden="true">
              →
            </span>
            <div className="field">
              <span className="field-label">目标语言</span>
              <span className="select-wrap">
                <select
                  className="select"
                  value={targetLanguage}
                  onChange={(event) => setTargetLanguage(event.target.value)}
                  disabled={isProcessing}
                  aria-label="目标语言"
                >
                  {TARGET_LANGUAGES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          </div>
        </div>

        <div>
          <p className="panel-title">字幕</p>
          <div className="field">
            <span className="field-label">烧录样式</span>
            <p className="readout">WenQuanYi Micro Hei · 24px · 白色 · 底部</p>
          </div>
          <div className="field">
            <span className="field-label">翻译校准</span>
            <p className="readout readout-muted">下一版本开放</p>
          </div>
        </div>

        <div>
          <p className="panel-title">输出</p>
          <div className="chip-row">
            <span className="chip">SRT 字幕</span>
            <span className="chip">烧录 MP4</span>
          </div>
          <p className="inspector-hint">6 种目标语言；超过 5 分钟自动分段处理。</p>
        </div>

        <div>
          <p className="panel-title">执行</p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handleSubmit}
            disabled={!videoFile || isProcessing}
          >
            {isProcessing ? `处理中 ${progress}%` : '开始翻译'}
          </button>
          {isProcessing && (
            <button type="button" className="btn btn-block" style={{ marginTop: 8 }} onClick={cancelJob}>
              取消任务
            </button>
          )}
          <p className="inspector-hint">
            处理期间请保持页面开启，进度由后端 WebSocket 推送。
          </p>
        </div>

        <div>
          <p className="panel-title">最近任务</p>
          {history.length === 0 ? (
            <p className="readout readout-muted">暂无记录</p>
          ) : (
            <ul className="history-list">
              {history.map((item) => (
                <li key={item.id}>
                  <button type="button" className="history-item" onClick={() => openHistoryJob(item.id)}>
                    <span className={`history-dot status-${item.status}`} aria-hidden="true" />
                    <span className="history-name">{item.filename}</span>
                    <span className="history-status mono">{statusText(item.status)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="channel">
          <span className="channel-dot" data-state={channelState} aria-hidden="true" />
          <span className="mono">
            进度通道 {channelState === 'ready' ? '已连接' : channelState === 'offline' ? '未连接' : '连接中'}
          </span>
        </div>
      </aside>
    </div>
  )
}

export default VideoStudio
