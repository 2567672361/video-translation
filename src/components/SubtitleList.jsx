import './SubtitleList.css'

function formatMs(ms) {
  const total = Math.max(0, Number(ms) || 0)
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const millis = total % 1000
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

/**
 * 只读字幕列表：点击某行跳转视频，播放时高亮当前字幕。
 * 后续阶段会在此基础上加行内编辑。
 */
function SubtitleList({ subtitles = [], activeIndex = -1, onSeek }) {
  return (
    <ol className="sub-list">
      {subtitles.map((item, index) => (
        <li key={item.id ?? index}>
          <button
            type="button"
            className={`sub-row ${index === activeIndex ? 'is-active' : ''}`}
            onClick={() => onSeek?.(item)}
          >
            <span className="sub-index mono">{String(index + 1).padStart(2, '0')}</span>
            <span className="sub-time mono">
              {formatMs(item.start_ms)} → {formatMs(item.end_ms)}
            </span>
            <span className="sub-text">{item.translated_text || item.source_text || ''}</span>
          </button>
        </li>
      ))}
      {subtitles.length === 0 && <li className="sub-empty">暂无字幕数据</li>}
    </ol>
  )
}

export default SubtitleList
