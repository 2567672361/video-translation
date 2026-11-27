import { useEffect, useMemo, useState } from 'react'
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
function SubtitleEditor({ jobId, subtitles, activeIndex = -1, onSeek, onSaved }) {
  const baseline = useMemo(() => toRows(subtitles), [subtitles])
  const [rows, setRows] = useState(baseline)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setRows(baseline)
    setError(null)
  }, [baseline])

  useEffect(() => {
    setMessage(null)
    setError(null)
  }, [jobId])

  const dirtyIndexes = rows.reduce((list, row, index) => {
    const base = baseline[index]
    if (!base) return list
    if (row.translated_text !== base.translated_text || row.start_text !== base.start_text || row.end_text !== base.end_text) {
      list.push(index)
    }
    return list
  }, [])

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

  const restoreAi = () => {
    setRows((prev) => prev.map((row) => ({ ...row, translated_text: row.ai_text })))
  }

  return (
    <div className="sub-editor">
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

      <ol className="sub-edit-list">
        {rows.map((row, index) => {
          const isDirty = dirtyIndexes.includes(index)
          return (
            <li key={index} className={`sub-edit-row ${index === activeIndex ? 'is-active' : ''} ${isDirty ? 'is-dirty' : ''}`}>
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
                <button type="button" className="btn btn-quiet" onClick={() => onSeek?.({ start_ms: parseMs(row.start_text) || 0 })}>
                  定位
                </button>
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

      {(error || message) && (
        <p className={error ? 'sub-editor-message is-error' : 'sub-editor-message'} role="status">
          {error || message}
        </p>
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
      </div>
    </div>
  )
}

export default SubtitleEditor
