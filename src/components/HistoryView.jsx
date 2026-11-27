import { useCallback, useEffect, useRef, useState } from 'react'
import './HistoryView.css'
import SubtitleEditor from './SubtitleEditor'
import { downloadFile } from '../lib/download'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const FILTERS = [
  { id: '', label: '全部' },
  { id: 'succeeded', label: '成功' },
  { id: 'failed', label: '失败' },
  { id: 'running', label: '处理中' },
]

const STATUS_TEXT = {
  pending: '等待',
  running: '处理中',
  succeeded: '完成',
  failed: '失败',
  canceled: '已取消',
  canceling: '取消中',
}

const PAGE_SIZE = 10

function formatTime(value) {
  if (!value) return ''
  const date = new Date(String(value).replace(' ', 'T') + 'Z')
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function HistoryView({ onBack }) {
  const [jobs, setJobs] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [detail, setDetail] = useState(null)
  const [subtitles, setSubtitles] = useState([])
  const [downloads, setDownloads] = useState([])
  const [activeSub, setActiveSub] = useState(-1)
  const videoRef = useRef(null)
  const [overlayEl, setOverlayEl] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
      if (status) params.set('status', status)
      const response = await fetch(`${API_URL}/api/jobs?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '加载失败')
      setJobs(Array.isArray(data.jobs) ? data.jobs : [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(err.message || '加载历史失败')
    } finally {
      setLoading(false)
    }
  }, [offset, status])

  useEffect(() => {
    load()
  }, [load])

  const refreshDownloads = useCallback(async (id) => {
    try {
      const response = await fetch(`${API_URL}/api/jobs/${id}/downloads`)
      if (!response.ok) return
      const data = await response.json()
      setDownloads(Array.isArray(data.downloads) ? data.downloads : [])
    } catch {
      /* 忽略记录刷新失败 */
    }
  }, [])

  const openDetail = async (id) => {
    try {
      const response = await fetch(`${API_URL}/api/jobs/${id}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '读取失败')
      setDetail(data.job)
      setSubtitles([])
      setActiveSub(-1)
      await refreshDownloads(id)
      if (data.job.status === 'succeeded') {
        const subRes = await fetch(`${API_URL}/api/jobs/${id}/subtitles`)
        if (subRes.ok) {
          const subData = await subRes.json()
          setSubtitles(Array.isArray(subData.subtitles) ? subData.subtitles : [])
        }
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const retryJob = async (id) => {
    setBusyId(id)
    try {
      const response = await fetch(`${API_URL}/api/jobs/${id}/retry`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '重试失败')
      await load()
      setError(`已创建重试任务 ${data.jobId.slice(0, 8)}…`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const removeJob = async (id) => {
    setBusyId(id)
    try {
      const response = await fetch(`${API_URL}/api/jobs/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '删除失败')
      if (detail && detail.id === id) setDetail(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="history-page rise">
      <div className="history-head">
        <div>
          <p className="stage-eyebrow mono">历史 / History</p>
          <h1 className="stage-title">任务记录</h1>
        </div>
        <div className="history-head-actions">
          <button type="button" className="btn" onClick={load} disabled={loading}>
            {loading ? '加载中…' : '刷新'}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onBack}>
            返回工作台
          </button>
        </div>
      </div>

      <div className="history-filters">
        {FILTERS.map((filter) => (
          <button
            key={filter.id || 'all'}
            type="button"
            className={`history-filter ${status === filter.id ? 'is-active' : ''}`}
            onClick={() => {
              setStatus(filter.id)
              setOffset(0)
            }}
          >
            {filter.label}
          </button>
        ))}
        <span className="history-total mono">共 {total} 条</span>
      </div>

      {error && (
        <div className="notice notice-error" role="alert">
          <span className="notice-mark">!</span>
          <p>{error}</p>
        </div>
      )}

      <div className="history-table">
        {!loading && jobs.length === 0 && <p className="history-empty">暂无记录</p>}
        {jobs.map((job) => (
          <div className="history-row" key={job.id}>
            <div className="history-main">
              <p className="history-file">{job.filename}</p>
              <p className="history-meta mono">
                {job.source_language} → {job.target_language} · {formatTime(job.created_at)}
              </p>
            </div>
            <span className={`history-badge status-${job.status}`}>{STATUS_TEXT[job.status] || job.status}</span>
            <div className="history-actions">
              <button type="button" className="btn btn-quiet" onClick={() => openDetail(job.id)}>
                详情
              </button>
              {(job.status === 'failed' || job.status === 'canceled') && (
                <button type="button" className="btn btn-quiet" disabled={busyId === job.id} onClick={() => retryJob(job.id)}>
                  重试
                </button>
              )}
              <button type="button" className="btn btn-quiet" disabled={busyId === job.id} onClick={() => removeJob(job.id)}>
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      {total > PAGE_SIZE && (
        <div className="history-pager">
          <button type="button" className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
            上一页
          </button>
          <span className="mono">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total}
          </span>
          <button
            type="button"
            className="btn"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            下一页
          </button>
        </div>
      )}

      {detail && (
        <div className="history-detail">
          <div className="history-detail-head">
            <div>
              <p className="history-file">{detail.filename}</p>
              <p className="history-meta mono">
                {detail.id} · {STATUS_TEXT[detail.status] || detail.status} · {formatTime(detail.created_at)}
              </p>
            </div>
            <button type="button" className="btn btn-quiet" onClick={() => setDetail(null)}>
              关闭
            </button>
          </div>

          {detail.error_message && (
            <div className="notice notice-error">
              <span className="notice-mark">!</span>
              <p>{detail.error_message}</p>
            </div>
          )}

          <ol className="step-list">
            {(detail.steps || []).map((step, index) => (
              <li key={`${step.name}-${index}`} className="step-row" data-status={step.status}>
                <span className="step-dot" aria-hidden="true" />
                <div className="step-body">
                  <p className="step-name">{step.name}</p>
                  {step.message && <p className="step-message">{step.message}</p>}
                </div>
                <span className="step-status mono">{STATUS_TEXT[step.status] || step.status}</span>
              </li>
            ))}
          </ol>

          {detail.video_url && (
            <div className="editor-grid">
              <div className="editor-player video-stage">
                <video
                  ref={videoRef}
                  className="history-video"
                  src={`${API_URL}${detail.video_url.replace('/uploads/', '/preview/')}`}
                  controls
                  playsInline
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={() => {
                    const video = videoRef.current
                    if (!video) return
                    const ms = video.currentTime * 1000
                    setCurrentMs(ms)
                    const index = subtitles.findIndex((item) => ms >= (item.start_ms || 0) && ms < (item.end_ms || 0))
                    setActiveSub((prev) => (prev === index ? prev : index))
                  }}
                />
                <div className="caption-overlay-host" ref={setOverlayEl} />
              </div>
              <SubtitleEditor
                jobId={detail.id}
                subtitles={subtitles}
                activeIndex={activeSub}
                onSeek={(item) => {
                  const video = videoRef.current
                  if (!video) return
                  video.currentTime = Math.max(0, (Number(item.start_ms) || 0) / 1000)
                  if (video.paused) video.play().catch(() => {})
                }}
                onSaved={setSubtitles}
                onRendered={(url) => setDetail((prev) => (prev ? { ...prev, video_url: url } : prev))}
                overlayHost={overlayEl}
                isPlaying={playing}
                currentTimeMs={currentMs}
              />
            </div>
          )}

          {downloads.length > 0 && (
            <p className="history-meta mono">
              下载记录：视频 {downloads.filter((item) => item.kind === 'video').length} 次 ·
              SRT {downloads.filter((item) => item.kind === 'srt').length} 次 ·
              最近 {formatTime(downloads[0].created_at)}
            </p>
          )}

          <div className="history-detail-actions">
            {detail.video_url && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await downloadFile(`${API_URL}${detail.video_url}`, detail.video_url.split('/').pop())
                  refreshDownloads(detail.id)
                }}
              >
                下载视频
              </button>
            )}
            {(detail.status === 'failed' || detail.status === 'canceled') && (
              <button type="button" className="btn" onClick={() => retryJob(detail.id)}>
                重试此任务
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default HistoryView
