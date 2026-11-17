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
`);

// 兼容早期版本数据库：缺列时补齐
const columns = db.prepare('PRAGMA table_info(jobs)').all().map((row) => row.name);
if (!columns.includes('source_path')) {
  db.exec('ALTER TABLE jobs ADD COLUMN source_path TEXT');
}
if (!columns.includes('subtitle_url')) {
  db.exec('ALTER TABLE jobs ADD COLUMN subtitle_url TEXT');
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
  INSERT INTO translations (job_id, sequence, start_ms, end_ms, source_text, translated_text)
  VALUES (?, ?, ?, ?, ?, ?)
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

function listJobs(limit = 20) {
  const size = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const rows = db
    .prepare('SELECT id, filename, source_language, target_language, status, progress, video_url, error_message, created_at, updated_at FROM jobs ORDER BY created_at DESC LIMIT ?')
    .all(size);
  return rows;
}

function addSteps(jobId, steps = []) {
  for (const step of steps) {
    stmtInsertStep.run(jobId, step.name || 'step', step.status || 'pending', step.message || null);
  }
}

function addTranslations(jobId, subtitles = []) {
  subtitles.forEach((item, index) => {
    stmtInsertTranslation.run(
      jobId,
      index + 1,
      Number.isFinite(item.start_time) ? Math.round(item.start_time) : null,
      Number.isFinite(item.end_time) ? Math.round(item.end_time) : null,
      item.original_text || item.source_text || item.original || null,
      item.text || item.translated_text || null,
    );
  });
}

module.exports = {
  DB_PATH,
  createJob,
  updateJob,
  getJob,
  listJobs,
  addSteps,
  addTranslations,
};
