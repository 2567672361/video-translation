import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './SubtitleEditor.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const formatMs = (ms) => {
  const total = Math.max(0, Number(ms) || 0)
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const millis = Math.round(total % 1000)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

const parseMs = (text) => {
  const match = /^(\d{1,3}):([0-5]\d)\.(\d{1,3})$/.exec(String(text || '').trim())
  if (!match) return NaN
  const millis = Number(match[3].padEnd(3, '0'))
  return (Number(match[1]) * 60 + Number(match[2])) * 1000 + millis
}

const toRows = (subtitles) =>
  (subtitles || []).map((item) => ({
    start_text: formatMs(item.start_ms),
    end_text: formatMs(item.end_ms),
    translated_text: item.translated_text || '',
    ai_text: item.ai_translated_text || item.translated_text || '',
    source_text: item.source_text || '',
  }))

/**
 * 字幕编辑器：行内改译文与时间码，整批保存。
 */
function SubtitleEditor({ jobId, subtitles, activeIndex = -1, onSeek, onSaved, onRendered, overlayHost, isPlaying = false }) {
  const baseline = useMemo(() => toRows(subtitles), [subtitles])
  const [rows, setRows] = useState(baseline)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [shiftSeconds, setShiftSeconds] = useState('0.5')
  const [renderStatus, setRenderStatus] = useState('idle')
  const [renderError, setRenderError] = useState(null)
  const renderTimer = useRef(null)
  const [selected, setSelected] = useState(-1)
  const [editing, setEditing] = useState(false)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    setRows(baseline)
    setError(null)
  }, [baseline])

  useEffect(() => {
    setMessage(null)
    setError(null)
  }, [jobId])

  useEffect(() => () => {
    if (renderTimer.current) clearTimeout(renderTimer.current)
  }, [])

  const dirtyIndexes = rows.reduce((list, row, index) => {
    const base = baseline[index]
    if (!base) return list
    if (row.translated_text !== base.translated_text || row.start_text !== base.start_text || row.end_text !== base.end_text) {
      list.push(index)
    }
    return list
  }, [])

  const selectRow = (index) => {
    if (index < 0 || index >= rows.length) return
    setSelected(index)
    setEditing(false)
    onSeek?.({ start_ms: parseMs(rows[index].start_text) || 0 })
  }

  const timelineTotal = useMemo(() => {
    const ends = rows.map((row) => parseMs(row.end_text)).filter((value) => Number.isFinite(value) && value > 0)
    return ends.length > 0 ? Math.max(...ends) : 1
  }, [rows])

  const selectedRow = selected >= 0 ? rows[selected] : null

  const updateRow = (index, field, value) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  const handleSave = async () => {
    setError(null)
    setMessage(null)

    const payload = []
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const start = parseMs(row.start_text)
      const end = parseMs(row.end_text)
      if (Number.isNaN(start) || Number.isNaN(end)) {
        setError(`第 ${index + 1} 条时间码格式不对，应为 mm:ss.mmm`)
        return
      }
      if (end <= start) {
        setError(`第 ${index + 1} 条结束时间必须晚于开始时间`)
        return
      }
      if (!row.translated_text.trim()) {
        setError(`第 ${index + 1} 条译文不能为空`)
        return
      }
      payload.push({
        start_ms: start,
        end_ms: end,
        translated_text: row.translated_text.trim(),
        source_text: row.source_text || null,
      })
    }

    setSaving(true)
    try {
      const response = await fetch(`${API_URL}/api/jobs/${jobId}/subtitles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtitles: payload }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '保存失败')
      onSaved?.(data.subtitles)
      setMessage(data.adjusted ? `已保存，自动修正 ${data.adjusted} 处时间重叠` : '已保存')
    } catch (err) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRender = async () => {
    setRenderError(null)
    setMessage(null)
    try {
      const response = await fetch(`${API_URL}/api/jobs/${jobId}/render`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '合成失败')
      setRenderStatus('running')

      const poll = async () => {
        try {
          const res = await fetch(`${API_URL}/api/jobs/${jobId}/render`)
          const info = await res.json()
          if (info.render_status === 'done') {
            setRenderStatus('done')
            setMessage('合成完成，视频已更新')
            onRendered?.(info.video_url)
            return
          }
          if (info.render_status === 'failed') {
            setRenderStatus('failed')
            setRenderError(info.render_error || '合成失败')
            return
          }
          renderTimer.current = setTimeout(poll, 1500)
        } catch {
          renderTimer.current = setTimeout(poll, 2000)
        }
      }
      renderTimer.current = setTimeout(poll, 800)
    } catch (err) {
      setRenderError(err.message || '合成失败')
    }
  }

  const splitRow = (index) => {
    const row = rows[index]
    const start = parseMs(row.start_text)
    const end = parseMs(row.end_text)
    const text = row.translated_text.trim()
    if (Number.isNaN(start) || Number.isNaN(end) || end - start < 200) {
      setError('这条时间太短，无法拆分')
      return
    }
    if (text.length < 4) {
      setError('这条文本太短，无法拆分')
      return
    }

    let cut = Math.floor(text.length / 2)
    const marks = []
    for (let i = 1; i < text.length - 1; i += 1) {
      if (/[，。！？,.!?;；、\s]/.test(text[i])) marks.push(i)
    }
    if (marks.length > 0) {
      cut = marks.reduce((best, pos) => (Math.abs(pos - text.length / 2) < Math.abs(best - text.length / 2) ? pos : best))
    }

    const left = text.slice(0, cut).trim()
    const right = text.slice(cut).trim()
    if (!left || !right) {
      setError('这条文本无法在中间拆分')
      return
    }

    const ratio = left.length / (left.length + right.length)
    const mid = Math.round(start + (end - start) * ratio)
    const first = { ...row, end_text: formatMs(mid), translated_text: left, ai_text: left }
    const second = { ...row, start_text: formatMs(Math.min(mid + 50, end - 50)), translated_text: right, ai_text: right }
    setRows((prev) => [...prev.slice(0, index), first, second, ...prev.slice(index + 1)])
    setError(null)
  }

  const mergeRow = (index) => {
    if (index >= rows.length - 1) return
    const current = rows[index]
    const next = rows[index + 1]
    const merged = {
      ...current,
      end_text: next.end_text,
      translated_text: `${current.translated_text} ${next.translated_text}`.trim(),
      ai_text: `${current.ai_text} ${next.ai_text}`.trim(),
    }
    setRows((prev) => [...prev.slice(0, index), merged, ...prev.slice(index + 2)])
    setError(null)
  }

  const handleKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (dirtyIndexes.length > 0 && !saving) handleSave()
    }
  }

  const shiftAll = (deltaMs) => {
    if (!deltaMs) return
    setRows((prev) =>
      prev.map((row) => {
        const start = parseMs(row.start_text)
        const end = parseMs(row.end_text)
        if (Number.isNaN(start) || Number.isNaN(end)) return row
        const nextStart = Math.max(0, start + deltaMs)
        const nextEnd = Math.max(nextStart + 100, end + deltaMs)
        return { ...row, start_text: formatMs(nextStart), end_text: formatMs(nextEnd) }
      }),
    )
    setError(null)
    setMessage(`已整体平移 ${deltaMs > 0 ? '+' : ''}${deltaMs / 1000}s，记得保存`)
  }

  const applyShiftInput = () => {
    const seconds = Number(shiftSeconds)
    if (!Number.isFinite(seconds) || seconds === 0) {
      setError('请输入非零的平移秒数，例如 0.5 或 -0.3')
      return
    }
    shiftAll(Math.round(seconds * 1000))
  }

  const restoreAi = () => {
    setRows((prev) => prev.map((row) => ({ ...row, translated_text: row.ai_text })))
  }

  return (
    <div className="sub-editor" onKeyDown={handleKeyDown}>
      <div className="sub-editor-head">
        <span className="panel-title">字幕</span>
        <div className="sub-editor-actions">
          {jobId && (
            <a className="btn btn-quiet" href={`${API_URL}/api/jobs/${jobId}/subtitles.srt`} download>
              下载 SRT
            </a>
          )}
        </div>
      </div>

      <div className="sub-shift">
        <span className="sub-shift-label">整体平移</span>
        <button type="button" className="btn btn-quiet" onClick={() => shiftAll(-500)}>-0.5s</button>
        <button type="button" className="btn btn-quiet" onClick={() => shiftAll(-100)}>-0.1s</button>
        <button type="button" className="btn btn-quiet" onClick={() => shiftAll(100)}>+0.1s</button>
        <button type="button" className="btn btn-quiet" onClick={() => shiftAll(500)}>+0.5s</button>
        <input
          className="sub-shift-input mono"
          value={shiftSeconds}
          onChange={(event) => setShiftSeconds(event.target.value)}
          aria-label="平移秒数"
        />
        <button type="button" className="btn btn-quiet" onClick={applyShiftInput}>
          应用
        </button>
      </div>

      <div className="sub-timeline">
        <div className="sub-timeline-toolbar">
          <span className="sub-shift-label">轨道</span>
          {[1, 2, 4].map((level) => (
            <button
              key={level}
              type="button"
              className={`btn btn-quiet ${zoom === level ? 'is-on' : ''}`}
              onClick={() => setZoom(level)}
            >
              {level}x
            </button>
          ))}
          <span className="sub-timeline-hint mono">共 {Math.max(rows.length, 1)} 条 · 总长 {formatMs(timelineTotal)}</span>
        </div>
        <div className="sub-timeline-scroll">
          <div className="sub-timeline-track" style={{ width: `${zoom * 100}%` }}>
            {rows.map((row, index) => {
              const start = parseMs(row.start_text)
              const end = parseMs(row.end_text)
              if (!Number.isFinite(start) || !Number.isFinite(end)) return null
              const left = Math.max(0, (start / timelineTotal) * 100)
              const width = Math.max(((end - start) / timelineTotal) * 100, 0.4)
              return (
                <button
                  key={index}
                  type="button"
                  className={`sub-block ${index === selected ? 'is-selected' : ''} ${index === activeIndex ? 'is-active' : ''}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${formatMs(start)} - ${formatMs(end)} ${row.translated_text.slice(0, 20)}`}
                  onClick={() => selectRow(index)}
                >
                  {index + 1}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <ol className="sub-edit-list">
        {rows.map((row, index) => {
          const isDirty = dirtyIndexes.includes(index)
          return (
            <li
              key={index}
              className={`sub-edit-row ${index === activeIndex ? 'is-active' : ''} ${index === selected ? 'is-selected' : ''} ${isDirty ? 'is-dirty' : ''}`}
              onClick={() => setSelected(index)}
            >
              <div className="sub-edit-line">
                <span className="sub-index mono">{String(index + 1).padStart(2, '0')}</span>
                <input
                  className="sub-time-input mono"
                  value={row.start_text}
                  onChange={(event) => updateRow(index, 'start_text', event.target.value)}
                  aria-label={`第 ${index + 1} 条开始时间`}
                />
                <span className="sub-dash">→</span>
                <input
                  className="sub-time-input mono"
                  value={row.end_text}
                  onChange={(event) => updateRow(index, 'end_text', event.target.value)}
                  aria-label={`第 ${index + 1} 条结束时间`}
                />
                <div className="sub-row-actions">
                  <button type="button" className="btn btn-quiet" onClick={() => onSeek?.({ start_ms: parseMs(row.start_text) || 0 })}>
                    定位
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={() => splitRow(index)}>
                    拆分
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => mergeRow(index)}
                    disabled={index >= rows.length - 1}
                  >
                    合并
                  </button>
                </div>
              </div>
              <input
                className="sub-text-input"
                value={row.translated_text}
                onChange={(event) => updateRow(index, 'translated_text', event.target.value)}
                onFocus={() => onSeek?.({ start_ms: parseMs(row.start_text) || 0 })}
                aria-label={`第 ${index + 1} 条译文`}
              />
            </li>
          )
        })}
        {rows.length === 0 && <li className="sub-empty">暂无字幕数据</li>}
      </ol>

      {(error || renderError || message) && (
        <p className={error || renderError ? 'sub-editor-message is-error' : 'sub-editor-message'} role="status">
          {error || renderError || message}
        </p>
      )}

      {overlayHost && selectedRow &&
        createPortal(
          <div
            className={`caption-overlay ${editing ? 'is-editing' : ''} ${isPlaying ? 'is-playing' : ''}`}
            onClick={() => {
              if (!isPlaying) setEditing(true)
            }}
            title={isPlaying ? '暂停后可编辑' : '点击编辑当前字幕'}
          >
            {editing ? (
              <input
                autoFocus
                className="caption-overlay-input"
                value={selectedRow.translated_text}
                onChange={(event) => updateRow(selected, 'translated_text', event.target.value)}
                onBlur={() => setEditing(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setEditing(false)
                  if (event.key === 'Escape') setEditing(false)
                }}
              />
            ) : (
              <span>{selectedRow.translated_text}</span>
            )}
          </div>,
          overlayHost,
        )}

      <div className="sub-editor-footer">
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || dirtyIndexes.length === 0}>
          {saving ? '保存中…' : dirtyIndexes.length > 0 ? `保存修改（${dirtyIndexes.length}）` : '保存修改'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setRows(baseline)} disabled={saving || dirtyIndexes.length === 0}>
          撤销
        </button>
        <button type="button" className="btn btn-quiet" onClick={restoreAi} disabled={saving}>
          恢复 AI 译文
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleRender}
          disabled={saving || renderStatus === 'running' || dirtyIndexes.length > 0}
        >
          {renderStatus === 'running' ? '合成中…' : '重新合成视频'}
        </button>
      </div>
    </div>
  )
}

export default SubtitleEditor
