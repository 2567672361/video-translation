import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { downloadFile } from '../lib/download'
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
function SubtitleEditor({ jobId, subtitles, activeIndex = -1, onSeek, onSaved, onRendered, overlayHost, isPlaying = false, currentTimeMs = 0 }) {
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
  const [drag, setDrag] = useState(null)
  const [version, setVersion] = useState(null)
  const [conflict, setConflict] = useState(null)
  const [fonts, setFonts] = useState([])
  const [style, setStyle] = useState({ fontFamily: 'SimHei', fontSize: 24, position: 'bottom', margin: 36, color: '#FFFFFF' })
  const [styleSaving, setStyleSaving] = useState(false)
  const fontInputRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [query, setQuery] = useState('')
  const [jumpText, setJumpText] = useState('')
  const [matchCursor, setMatchCursor] = useState(0)
  const listRef = useRef(null)
  const ROW_H = 86
  const [insertStart, setInsertStart] = useState('')
  const [insertDuration, setInsertDuration] = useState('2')

  useEffect(() => {
    if (!jobId) return undefined
    let cancelled = false
    const load = async () => {
      try {
        const fontRes = await fetch(`${API_URL}/api/fonts`)
        if (fontRes.ok) {
          const fontData = await fontRes.json()
          if (!cancelled) setFonts(Array.isArray(fontData.fonts) ? fontData.fonts : [])
        }
        const jobRes = await fetch(`${API_URL}/api/jobs/${jobId}`)
        if (jobRes.ok) {
          const jobData = await jobRes.json()
          const raw = jobData.job && jobData.job.subtitle_style
          if (raw && !cancelled) {
            try {
              setStyle((prev) => ({ ...prev, ...JSON.parse(raw) }))
            } catch {
              /* 忽略非法样式 */
            }
          }
        }
      } catch {
        /* 忽略加载失败 */
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [jobId])

  useEffect(() => {
    if (!jobId) return undefined
    let cancelled = false
    const loadVersion = async () => {
      try {
        const response = await fetch(`${API_URL}/api/jobs/${jobId}/subtitles`)
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled) setVersion(data.version || null)
      } catch {
        /* 版本读取失败时按无锁处理 */
      }
    }
    loadVersion()
    return () => {
      cancelled = true
    }
  }, [jobId])

  useEffect(() => {
    if (selected < 0 || !listRef.current) return
    const element = listRef.current
    const top = selected * ROW_H
    if (top < element.scrollTop || top + ROW_H > element.scrollTop + element.clientHeight) {
      element.scrollTop = Math.max(0, top - element.clientHeight / 2 + ROW_H / 2)
    }
  }, [selected])

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

  const structureChanged = rows.length !== baseline.length
  const dirtyIndexes = structureChanged
    ? rows.map((_, index) => index)
    : rows.reduce((list, row, index) => {
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

  const matches = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return []
    return rows.reduce((list, row, index) => {
      if ((row.translated_text || '').toLowerCase().includes(keyword)) list.push(index)
      return list
    }, [])
  }, [rows, query])

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_H) - 3)
  const endIndex = Math.min(rows.length, Math.ceil((scrollTop + 360) / ROW_H) + 3)
  const visibleRows = rows.slice(startIndex, endIndex).map((row, offset) => ({ row, index: startIndex + offset }))

  const jumpMatch = (direction) => {
    if (matches.length === 0) return
    const next = (matchCursor + direction + matches.length) % matches.length
    setMatchCursor(next)
    setError(null)
    selectRow(matches[next])
  }

  const jumpToTime = () => {
    const ms = parseMs(jumpText)
    if (Number.isNaN(ms)) {
      setError('时间码格式应为 mm:ss.mmm')
      return
    }
    let index = rows.findIndex((row) => (parseMs(row.end_text) || 0) > ms)
    if (index < 0) index = rows.length - 1
    if (index >= 0) {
      setError(null)
      selectRow(index)
    }
  }

  const saveStyle = async () => {
    setStyleSaving(true)
    try {
      const response = await fetch(`${API_URL}/api/jobs/${jobId}/style`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '保存样式失败')
      setStyle(data.style)
      setMessage('样式已保存，点「重新合成视频」生效')
      setError(null)
    } catch (error) {
      setError(error.message)
    } finally {
      setStyleSaving(false)
    }
  }

  const uploadFont = async (file) => {
    if (!file) return
    try {
      const body = new FormData()
      body.append('font', file)
      const response = await fetch(`${API_URL}/api/fonts`, { method: 'POST', body })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '上传失败')
      const fontRes = await fetch(`${API_URL}/api/fonts`)
      if (fontRes.ok) {
        const fontData = await fontRes.json()
        setFonts(Array.isArray(fontData.fonts) ? fontData.fonts : [])
      }
      setStyle((prev) => ({ ...prev, fontFamily: data.font.family }))
      setMessage(`字体「${data.font.name}」已上传并选用`)
      setError(null)
    } catch (error) {
      setError(error.message)
    }
  }

  const previewScale = (() => {
    if (!overlayHost) return 1
    const video = overlayHost.closest('.video-stage')?.querySelector('video')
    if (!video || !video.videoHeight) return 1
    return video.clientHeight ? video.clientHeight / video.videoHeight : 1
  })()

  const insertCue = (startMs, durationMs = 2000) => {
    const start = Math.max(0, Math.round(Number(startMs) || 0))
    const end = start + Math.max(200, Math.round(Number(durationMs) || 2000))
    const row = {
      start_text: formatMs(start),
      end_text: formatMs(end),
      translated_text: '',
      ai_text: '',
      source_text: '',
    }
    let position = rows.findIndex((item) => (parseMs(item.start_text) || 0) > start)
    if (position < 0) position = rows.length
    setRows((prev) => [...prev.slice(0, position), row, ...prev.slice(position)])
    setSelected(position)
    setEditing(true)
    setError(null)
    setMessage(`已在 ${formatMs(start)} 插入字幕，填写后保存`)
    onSeek?.({ start_ms: start })
  }

  const applyInsert = () => {
    const start = insertStart.trim() ? parseMs(insertStart) : Math.round(currentTimeMs)
    if (Number.isNaN(start)) {
      setError('起点格式应为 mm:ss.mmm')
      return
    }
    const seconds = insertDuration.trim() ? Number(insertDuration) : 2
    if (!Number.isFinite(seconds) || seconds < 0.2) {
      setError('字幕时长至少 0.2 秒')
      return
    }
    insertCue(start, Math.round(seconds * 1000))
    setInsertStart(formatMs(start))
  }

  const timeFromPointer = (event, element) => {
    const rect = element.getBoundingClientRect()
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    return Math.round(ratio * timelineTotal)
  }

  const handleTrackPointerDown = (event) => {
    const element = event.currentTarget
    const at = timeFromPointer(event, element)
    setDrag({ startMs: at, currentMs: at })
    setError(null)
  }

  const handleTrackPointerMove = (event) => {
    if (!drag) return
    const at = timeFromPointer(event, event.currentTarget)
    setDrag((prev) => (prev ? { ...prev, currentMs: at } : prev))
  }

  const handleTrackPointerUp = (event) => {
    if (!drag) return
    const element = event.currentTarget
    const at = timeFromPointer(event, element)
    const start = Math.min(drag.startMs, at)
    const finish = Math.max(drag.startMs, at)
    setDrag(null)

    if (finish - start < 250) {
      onSeek?.({ start_ms: start })
      return
    }
    insertCue(start, finish - start)
    setInsertStart(formatMs(start))
  }

  const insertAtPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    const at = Math.round(ratio * timelineTotal)
    setInsertStart(formatMs(at))
    insertCue(at, Math.round((Number(insertDuration) || 2) * 1000))
  }

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
        body: JSON.stringify({ subtitles: payload, expected_version: version }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.status === 409) {
        setConflict(data)
        setError(data.error || '字幕已被其他窗口修改，请刷新后重试')
        return
      }
      if (!response.ok) throw new Error(data.error || '保存失败')
      setConflict(null)
      setVersion(data.version || version)
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

  const deleteRow = (index) => {
    if (rows.length <= 1) {
      setError('至少保留一条字幕')
      return
    }
    setRows((prev) => prev.filter((_, i) => i !== index))
    setSelected((prev) => (prev === index ? -1 : prev > index ? prev - 1 : prev))
    setError(null)
    setMessage(`已删除第 ${index + 1} 条，记得保存`)
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
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => downloadFile(`${API_URL}/api/jobs/${jobId}/subtitles.srt`, `subtitle-${jobId.slice(0, 8)}.srt`)}
            >
              下载 SRT
            </button>
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

      <div className="sub-style">
        <span className="sub-shift-label">样式</span>
        <select
          className="sub-style-select"
          value={style.fontFamily}
          onChange={(event) => setStyle((prev) => ({ ...prev, fontFamily: event.target.value }))}
        >
          {fonts.map((font) => (
            <option key={font.id} value={font.family}>
              {font.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min="8"
          max="120"
          className="sub-style-number"
          value={style.fontSize}
          onChange={(event) => setStyle((prev) => ({ ...prev, fontSize: Number(event.target.value) }))}
          aria-label="字幕字号"
        />
        <select
          className="sub-style-select"
          value={style.position}
          onChange={(event) => setStyle((prev) => ({ ...prev, position: event.target.value }))}
        >
          <option value="top">顶部</option>
          <option value="center">居中</option>
          <option value="bottom">底部</option>
        </select>
        <input
          type="number"
          min="0"
          max="400"
          className="sub-style-number"
          value={style.margin}
          onChange={(event) => setStyle((prev) => ({ ...prev, margin: Number(event.target.value) }))}
          aria-label="字幕边距"
        />
        <input
          type="color"
          className="sub-style-color"
          value={style.color}
          onChange={(event) => setStyle((prev) => ({ ...prev, color: event.target.value }))}
          aria-label="字幕颜色"
        />
        <button type="button" className="btn btn-quiet" onClick={saveStyle} disabled={styleSaving}>
          {styleSaving ? '保存中…' : '保存样式'}
        </button>
        <input
          ref={fontInputRef}
          type="file"
          accept=".ttf,.otf"
          style={{ display: 'none' }}
          onChange={(event) => {
            uploadFont(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <button type="button" className="btn btn-quiet" onClick={() => fontInputRef.current?.click()}>
          上传字体
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
          <span className="sub-shift-label">插入</span>
          <input
            className="sub-search-input mono"
            placeholder="起点 mm:ss.mmm"
            value={insertStart}
            onChange={(event) => setInsertStart(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applyInsert()
            }}
            aria-label="插入字幕起点"
          />
          <button type="button" className="btn btn-quiet" onClick={() => setInsertStart(formatMs(currentTimeMs))}>
            取当前
          </button>
          <input
            className="sub-search-input mono"
            placeholder="时长(秒)"
            value={insertDuration}
            onChange={(event) => setInsertDuration(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applyInsert()
            }}
            aria-label="插入字幕时长"
          />
          <button type="button" className="btn btn-quiet" onClick={applyInsert}>
            ＋ 插入
          </button>
          <span className="sub-timeline-hint mono">共 {Math.max(rows.length, 1)} 条 · 总长 {formatMs(timelineTotal)}</span>
        </div>
        <div className="sub-timeline-scroll">
          <div
          className="sub-timeline-track"
          style={{ width: `${zoom * 100}%` }}
          onMouseDown={handleTrackPointerDown}
          onMouseMove={handleTrackPointerMove}
          onMouseUp={handleTrackPointerUp}
          onMouseLeave={() => setDrag(null)}
        >
            {drag &&
              (() => {
                const from = Math.min(drag.startMs, drag.currentMs)
                const to = Math.max(drag.startMs, drag.currentMs)
                const left = Math.max(0, (from / timelineTotal) * 100)
                const width = Math.max(((to - from) / timelineTotal) * 100, 0.3)
                return (
                  <div className="sub-drag-ghost" style={{ left: `${left}%`, width: `${width}%` }}>
                    {formatMs(from)} – {formatMs(to)}
                  </div>
                )
              })()}
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

      <div className="sub-search">
        <input
          className="sub-search-input"
          placeholder="搜索译文…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setMatchCursor(0)
          }}
        />
        <span className="sub-search-count mono">{query ? `${matches.length ? matchCursor + 1 : 0}/${matches.length}` : ''}</span>
        <button type="button" className="btn btn-quiet" onClick={() => jumpMatch(-1)} disabled={matches.length === 0}>
          ↑
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => jumpMatch(1)} disabled={matches.length === 0}>
          ↓
        </button>
        <input
          className="sub-search-input mono"
          placeholder="跳转 mm:ss.mmm"
          value={jumpText}
          onChange={(event) => setJumpText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') jumpToTime()
          }}
        />
        <button type="button" className="btn btn-quiet" onClick={jumpToTime}>
          跳转
        </button>
      </div>

      <div
        className="sub-edit-list"
        ref={listRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="sub-list-spacer" style={{ height: `${rows.length * ROW_H}px` }}>
          <div className="sub-list-window" style={{ top: `${startIndex * ROW_H}px` }}>
            {visibleRows.map(({ row, index }) => {
              const isDirty = dirtyIndexes.includes(index)
              const keyword = query.trim().toLowerCase()
              const isMatch = Boolean(keyword) && (row.translated_text || '').toLowerCase().includes(keyword)
              return (
                <div
                  key={index}
                  className={`sub-edit-row ${index === activeIndex ? 'is-active' : ''} ${index === selected ? 'is-selected' : ''} ${isDirty ? 'is-dirty' : ''} ${isMatch ? 'is-match' : ''}`}
                  style={{ height: `${ROW_H}px` }}
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
                      <button
                        type="button"
                        className="btn btn-quiet btn-danger"
                        onClick={() => deleteRow(index)}
                        disabled={rows.length <= 1}
                      >
                        删除
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
                </div>
              )
            })}
          </div>
        </div>
        {rows.length === 0 && <div className="sub-empty">暂无字幕数据</div>}
      </div>

      {conflict && (
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            onSaved?.(conflict.subtitles || [])
            setVersion(conflict.version || null)
            setConflict(null)
            setError(null)
            setMessage('已载入最新字幕，请重新编辑')
          }}
        >
          载入最新字幕
        </button>
      )}

      {(error || renderError || message) && (
        <p className={error || renderError ? 'sub-editor-message is-error' : 'sub-editor-message'} role="status">
          {error || renderError || message}
        </p>
      )}

      {overlayHost && selectedRow &&
        createPortal(
          <div
            className={`caption-overlay ${editing ? 'is-editing' : ''} ${isPlaying ? 'is-playing' : ''}`}
            style={{
              fontSize: `${Math.max(10, style.fontSize * previewScale)}px`,
              color: style.color,
              top: style.position === 'top' ? `${style.margin * previewScale}px` : undefined,
              bottom: style.position === 'bottom' ? `${Math.max(46, style.margin * previewScale)}px` : undefined,
              ...(style.position === 'center' ? { top: '50%', transform: 'translate(-50%, -50%)' } : {}),
            }}
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
