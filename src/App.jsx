import { useEffect, useState } from 'react'
import './App.css'
import VideoStudio from './components/VideoStudio'
import HistoryView from './components/HistoryView'

/** 顶栏时间码：让界面有一点“正在录制”的现场感，不影响功能 */
function useTimecode() {
  const [timecode, setTimecode] = useState('00:00:00:00')

  useEffect(() => {
    const started = Date.now()
    const tick = () => {
      const elapsed = Date.now() - started
      const totalSeconds = Math.floor(elapsed / 1000)
      const pad = (n) => String(n).padStart(2, '0')
      const frames = Math.floor((elapsed % 1000) / 42) // 约 24fps
      setTimecode(
        `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(
          totalSeconds % 60,
        )}:${pad(frames)}`,
      )
    }
    tick()
    const id = window.setInterval(tick, 125)
    return () => window.clearInterval(id)
  }, [])

  return timecode
}

function readInitialTheme() {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem('studio-theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function App() {
  const [theme, setTheme] = useState(readInitialTheme)
  const [view, setView] = useState('workbench')
  const timecode = useTimecode()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('studio-theme', theme)
  }, [theme])

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p className="brand-title">字幕工作台</p>
            <p className="brand-sub">Subtitle Workbench</p>
          </div>
        </div>


        <div className="topbar-tools">
          <button
            type="button"
            className={`topbar-link ${view === 'history' ? 'is-active' : ''}`}
            onClick={() => setView(view === 'history' ? 'workbench' : 'history')}
          >
            历史记录
          </button>
          <span className="rec-timecode" aria-hidden="true">
            <span className="rec-dot" />
            TC {timecode}
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? '切换到纸面浅色主题' : '切换到放映厅深色主题'}
            title={theme === 'dark' ? '切换到纸面浅色主题' : '切换到放映厅深色主题'}
          >
            {theme === 'dark' ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20.5 14.8A8.6 8.6 0 0 1 9.2 3.5a8.6 8.6 0 1 0 11.3 11.3Z" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <div className="shell-body">
        {view === 'history' ? <HistoryView onBack={() => setView('workbench')} /> : <VideoStudio />}
      </div>

      <footer className="statusbar">
        <span className="statusbar-status">
          <span className="status-dot" />
          AI 视频翻译系统 · 工作台界面
        </span>
        <span>Vite · React 19 — 2026</span>
      </footer>
    </div>
  )
}

export default App
