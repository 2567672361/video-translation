/**
 * 任务持久化层（SQLite，Node 内置 node:sqlite）
 *
 * 设计原则：所有写操作同步执行、单条语句，避免并发写竞争；
 * 读取返回普通对象，供 HTTP 接口直接序列化。
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'app.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id               TEXT PRIMARY KEY,
  filename         TEXT NOT NULL,
  file_size        INTEGER,
  source_path      TEXT,
  source_language  TEXT NOT NULL DEFAULT 'auto',
  target_language  TEXT NOT NULL DEFAULT 'zh',
  status           TEXT NOT NULL DEFAULT 'pending',
  progress         INTEGER NOT NULL DEFAULT 0,
  current_step     TEXT,
  video_url        TEXT,
  subtitle_url     TEXT,
  error_message    TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS job_steps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  message     TEXT,
  started_at  TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_steps_job ON job_steps(job_id);

CREATE TABLE IF NOT EXISTS translations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sequence        INTEGER NOT NULL,
  start_ms        INTEGER,
  end_ms          INTEGER,
  source_text     TEXT,
  translated_text TEXT
);
CREATE INDEX IF NOT EXISTS idx_translations_job ON translations(job_id, sequence);
CREATE TABLE IF NOT EXISTS downloads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id     TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  filename   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_downloads_job ON downloads(job_id, created_at DESC);
CREATE TABLE IF NOT EXISTS usage_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id     TEXT,
  provider   TEXT NOT NULL,
  operation  TEXT NOT NULL,
  chars      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events(created_at DESC);


`);

// 兼容早期版本数据库：缺列时补齐
const columns = db.prepare('PRAGMA table_info(jobs)').all().map((row) => row.name);
if (!columns.includes('source_path')) {
  db.exec('ALTER TABLE jobs ADD COLUMN source_path TEXT');
}
if (!columns.includes('subtitle_style')) {
  db.exec('ALTER TABLE jobs ADD COLUMN subtitle_style TEXT');
}
if (!columns.includes('render_status')) {
  db.exec("ALTER TABLE jobs ADD COLUMN render_status TEXT DEFAULT 'idle'");
}
if (!columns.includes('render_error')) {
  db.exec('ALTER TABLE jobs ADD COLUMN render_error TEXT');
}
if (!columns.includes('subtitles_updated_at')) {
  db.exec('ALTER TABLE jobs ADD COLUMN subtitles_updated_at TEXT');
}
if (!columns.includes('subtitle_url')) {
  db.exec('ALTER TABLE jobs ADD COLUMN subtitle_url TEXT');
}

// 修复历史数据：早期版本把 UTF-8 文件名按 latin1 存储，出现乱码
const repair = db.prepare('SELECT id, filename FROM jobs').all();
const updateName = db.prepare('UPDATE jobs SET filename = ? WHERE id = ?');
for (const row of repair) {
  if (!/[À-ÿ]/.test(row.filename || '')) continue;
  const fixed = Buffer.from(row.filename, 'latin1').toString('utf8');
  if (!fixed.includes('�') && fixed !== row.filename) {
    updateName.run(fixed, row.id);
  }
}

try {
  // 字幕人工编辑所需列（老库自动补齐）
  const usageColumns = db.prepare('PRAGMA table_info(usage_events)').all().map((row) => row.name);
if (usageColumns.length > 0 && !usageColumns.includes('model')) {
  db.exec('ALTER TABLE usage_events ADD COLUMN model TEXT');
}

const translationColumns = db.prepare('PRAGMA table_info(translations)').all().map((row) => row.name);
  if (!translationColumns.includes('ai_translated_text')) {
    db.exec('ALTER TABLE translations ADD COLUMN ai_translated_text TEXT');
  }
  if (!translationColumns.includes('is_edited')) {
    db.exec('ALTER TABLE translations ADD COLUMN is_edited INTEGER DEFAULT 0');
  }
  if (!translationColumns.includes('updated_at')) {
    db.exec('ALTER TABLE translations ADD COLUMN updated_at TEXT');
  }

  db.exec('UPDATE translations SET ai_translated_text = translated_text WHERE ai_translated_text IS NULL');
} catch (error) {
  console.warn('数据库结构升级跳过:', error.message);
}

const stmtInsertJob = db.prepare(`
  INSERT INTO jobs (id, filename, file_size, source_path, source_language, target_language, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
`);

const stmtUpdateJob = db.prepare(`
  UPDATE jobs
     SET status = COALESCE(?, status),
         progress = COALESCE(?, progress),
         current_step = COALESCE(?, current_step),
         video_url = COALESCE(?, video_url),
         subtitle_url = COALESCE(?, subtitle_url),
         subtitle_style = COALESCE(?, subtitle_style),
         error_message = COALESCE(?, error_message),
         updated_at = datetime('now')
   WHERE id = ?
`);

const stmtGetJob = db.prepare('SELECT * FROM jobs WHERE id = ?');
const stmtInsertStep = db.prepare(`
  INSERT INTO job_steps (job_id, name, status, message, started_at, finished_at)
  VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
`);
const stmtStepsOfJob = db.prepare('SELECT name, status, message FROM job_steps WHERE job_id = ? ORDER BY id');
const stmtInsertTranslation = db.prepare(`
  INSERT INTO translations (job_id, sequence, start_ms, end_ms, source_text, translated_text, ai_translated_text)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function createJob({ id, filename, fileSize, sourcePath, sourceLanguage, targetLanguage }) {
  stmtInsertJob.run(
    id,
    filename || 'unknown',
    fileSize || null,
    sourcePath || null,
    sourceLanguage || 'auto',
    targetLanguage || 'zh',
  );
  return getJob(id);
}

function updateJob(id, fields = {}) {
  stmtUpdateJob.run(
    fields.status || null,
    Number.isFinite(fields.progress) ? fields.progress : null,
    fields.currentStep || null,
    fields.videoUrl || null,
    fields.subtitleUrl || null,
    fields.subtitleStyle || null,
    fields.errorMessage || null,
    id,
  );
}

function getJob(id) {
  const job = stmtGetJob.get(id);
  if (!job) return null;
  const steps = stmtStepsOfJob.all(id);
  return {
    ...job,
    steps: steps.map((step) => ({
      name: step.name,
      status: step.status,
      message: step.message,
    })),
  };
}

function listJobs({ limit = 20, offset = 0, status = null } = {}) {
  const size = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const start = Math.max(Number(offset) || 0, 0);
  const filter = status || null;
  const rows = db
    .prepare(
      `SELECT id, filename, source_language, target_language, status, progress, video_url, error_message, created_at, updated_at
         FROM jobs
        WHERE (?1 IS NULL OR status = ?1)
        ORDER BY created_at DESC
        LIMIT ?2 OFFSET ?3`,
    )
    .all(filter, size, start);
  return rows;
}

function countJobs(status = null) {
  const row = db
    .prepare('SELECT COUNT(*) AS total FROM jobs WHERE (?1 IS NULL OR status = ?1)')
    .get(status || null);
  return row ? row.total : 0;
}

function deleteJob(id) {
  const result = db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  return Number(result.changes) > 0;
}

function addSteps(jobId, steps = []) {
  for (const step of steps) {
    stmtInsertStep.run(jobId, step.name || 'step', step.status || 'pending', step.message || null);
  }
}

function addTranslations(jobId, subtitles = []) {
  subtitles.forEach((item, index) => {
    const translated = item.text || item.translated_text || null;
    stmtInsertTranslation.run(
      jobId,
      index + 1,
      Number.isFinite(item.start_time) ? Math.round(item.start_time) : null,
      Number.isFinite(item.end_time) ? Math.round(item.end_time) : null,
      item.original_text || item.source_text || item.original || null,
      translated,
      translated,
    );
  });
}

function listSubtitles(jobId) {
  return db
    .prepare(
      `SELECT id, sequence, start_ms, end_ms, source_text, translated_text, ai_translated_text, is_edited
         FROM translations
        WHERE job_id = ?
        ORDER BY sequence`,
    )
    .all(jobId);
}

function replaceSubtitles(jobId, subtitles = []) {
  const previous = db
    .prepare('SELECT sequence, ai_translated_text FROM translations WHERE job_id = ?')
    .all(jobId);
  const aiBySequence = new Map(previous.map((row) => [row.sequence, row.ai_translated_text]));

  const insert = db.prepare(`
    INSERT INTO translations
      (job_id, sequence, start_ms, end_ms, source_text, translated_text, ai_translated_text, is_edited, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM translations WHERE job_id = ?').run(jobId);
    subtitles.forEach((item, index) => {
      const aiText = aiBySequence.get(index + 1) || item.translated_text || '';
      insert.run(
        jobId,
        index + 1,
        Math.round(item.start_ms),
        Math.round(item.end_ms),
        item.source_text || null,
        item.translated_text || '',
        aiText,
        aiText === item.translated_text ? 0 : 1,
      );
    });
    db.prepare("UPDATE jobs SET subtitles_updated_at = strftime('%Y-%m-%d %H:%M:%f','now'), updated_at = datetime('now') WHERE id = ?").run(jobId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return listSubtitles(jobId);
}

function setRenderStatus(jobId, status, error = null) {
  db.prepare("UPDATE jobs SET render_status = ?, render_error = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, error, jobId);
}

function recordDownload(jobId, kind, filename) {
  db.prepare('INSERT INTO downloads (job_id, kind, filename) VALUES (?, ?, ?)').run(jobId, kind, filename || null);
}

function listDownloads(jobId) {
  return db
    .prepare('SELECT id, kind, filename, created_at FROM downloads WHERE job_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(jobId);
}

function jobIdForVideo(filename) {
  const row = db.prepare('SELECT id FROM jobs WHERE video_url = ? ORDER BY created_at DESC LIMIT 1').get(`/uploads/${filename}`);
  return row ? row.id : null;
}

function recordUsage(jobId, provider, operation, chars = 0, model = null) {
  db.prepare('INSERT INTO usage_events (job_id, provider, operation, chars, model) VALUES (?, ?, ?, ?, ?)').run(
    jobId || null,
    provider,
    operation,
    Math.max(0, Math.round(Number(chars) || 0)),
    model || null,
  );
}

function usageSummary() {
  const totals = db
    .prepare('SELECT provider, model, operation, COUNT(*) AS calls, SUM(chars) AS chars FROM usage_events GROUP BY provider, model, operation ORDER BY provider, model, operation')
    .all();
  const recent = db
    .prepare(
      `SELECT u.id, u.job_id, u.provider, u.model, u.operation, u.chars, u.created_at, j.filename
         FROM usage_events u LEFT JOIN jobs j ON j.id = u.job_id
        ORDER BY u.id DESC LIMIT 50`,
    )
    .all();
  return { totals, recent };
}

module.exports = {
  DB_PATH,
  createJob,
  updateJob,
  getJob,
  listJobs,
  countJobs,
  deleteJob,
  addSteps,
  addTranslations,
  listSubtitles,
  recordDownload,
  jobIdForVideo,
  listDownloads,
  recordUsage,
  usageSummary,
  replaceSubtitles,
  setRenderStatus,
};
