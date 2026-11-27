import { useCallback, useEffect, useState } from 'react'
import './SettingsView.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const FIELDS = [
  { key: 'volcApiKey', label: '火山 API Key', type: 'password' },
  { key: 'volcAppId', label: '火山 APP ID', type: 'text' },
  { key: 'volcAccessToken', label: '火山 Access Token', type: 'password' },
  { key: 'doubaoApiKey', label: '豆包 API Key', type: 'password' },
  { key: 'doubaoModel', label: '豆包模型名', type: 'text' },
]

function SettingsView({ onBack }) {
  const [masked, setMasked] = useState(null)
  const [form, setForm] = useState({})
  const [usage, setUsage] = useState({ summary: [], recent: [] })
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [settingsRes, usageRes] = await Promise.all([
        fetch(`${API_URL}/api/settings`),
        fetch(`${API_URL}/api/usage`),
      ])
      if (settingsRes.ok) {
        const data = await settingsRes.json()
        setMasked(data.settings)
      }
      if (usageRes.ok) {
        const data = await usageRes.json()
        setUsage({ summary: data.summary || [], recent: data.recent || [] })
      }
    } catch (err) {
      setError('加载设置失败')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {}
      for (const field of FIELDS) {
        const value = (form[field.key] || '').trim()
        if (value) payload[field.key] = value
      }
      if (Object.keys(payload).length === 0) {
        setMessage('没有需要保存的改动（留空表示保持不变）')
        return
      }
      const response = await fetch(`${API_URL}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '保存失败')
      setMasked(data.settings)
      setForm({})
      setMessage('已保存，新的 Key 立即生效')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="settings-page rise">
      <div className="history-head">
        <div>
          <p className="stage-eyebrow mono">设置 / Settings</p>
          <h1 className="stage-title">接口与用量</h1>
        </div>
        <div className="history-head-actions">
          <button type="button" className="btn" onClick={load}>
            刷新
          </button>
          <button type="button" className="btn btn-quiet" onClick={onBack}>
            返回工作台
          </button>
        </div>
      </div>

      <div className="settings-grid">
        <div className="settings-card">
          <p className="panel-title">API 凭据</p>
          <p className="settings-hint">
            留空表示保持不变；已配置的凭据显示为掩码。保存后立即用于后续任务，无需重启。
          </p>

          <div className="settings-fields">
            {FIELDS.map((field) => (
              <label key={field.key} className="settings-field">
                <span>{field.label}</span>
                <input
                  type={field.type}
                  placeholder={masked ? masked[field.key] || '未配置' : ''}
                  value={form[field.key] || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  autoComplete="off"
                />
              </label>
            ))}
          </div>

          <div className="settings-status mono">
            火山：{masked?.configured?.volc ? '已配置' : '未配置'} · 豆包：
            {masked?.configured?.doubao ? '已配置' : '未配置'} · 来源：
            {masked?.configured?.source === 'settings' ? '设置页' : '.env'}
          </div>

          {(error || message) && (
            <p className={error ? 'sub-editor-message is-error' : 'sub-editor-message'}>{error || message}</p>
          )}

          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存设置'}
          </button>
        </div>

        <div className="settings-card">
          <p className="panel-title">用量汇总</p>
          {usage.summary.length === 0 ? (
            <p className="readout readout-muted">暂无用量记录，跑一次翻译后这里会累计。</p>
          ) : (
            <table className="usage-table">
              <thead>
                <tr>
                  <th>提供方</th>
                  <th>操作</th>
                  <th>调用次数</th>
                  <th>字符数</th>
                </tr>
              </thead>
              <tbody>
                {usage.summary.map((row) => (
                  <tr key={`${row.provider}-${row.operation}`}>
                    <td>{row.provider}</td>
                    <td>{row.operation}</td>
                    <td className="mono">{row.calls}</td>
                    <td className="mono">{row.chars || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="panel-title" style={{ marginTop: 16 }}>
            最近记录
          </p>
          {usage.recent.length === 0 ? (
            <p className="readout readout-muted">暂无记录</p>
          ) : (
            <table className="usage-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>任务</th>
                  <th>提供方</th>
                  <th>字符</th>
                </tr>
              </thead>
              <tbody>
                {usage.recent.slice(0, 12).map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{row.created_at}</td>
                    <td className="usage-file">{row.filename || row.job_id || '-'}</td>
                    <td>{row.provider}/{row.operation}</td>
                    <td className="mono">{row.chars || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  )
}

export default SettingsView
