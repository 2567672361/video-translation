/**
 * 用户级运行配置（API Key / 模型），保存在 backend/data/settings.json。
 * 优先级：设置页保存的值 > .env 环境变量。
 */
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, 'data', 'settings.json');
const ALLOWED = ['volcApiKey', 'volcAppId', 'volcAccessToken', 'doubaoApiKey', 'doubaoModel', 'translationProvider', 'openaiBaseUrl', 'openaiApiKey', 'openaiModel'];
const ENV_KEYS = {
  volcApiKey: 'VOLC_API_KEY',
  volcAppId: 'VOLC_APP_ID',
  volcAccessToken: 'VOLC_ACCESS_TOKEN',
  doubaoApiKey: 'DOUBAO_API_KEY',
  doubaoModel: 'DOUBAO_MODEL',
  translationProvider: 'TRANSLATION_PROVIDER',
  openaiBaseUrl: 'OPENAI_BASE_URL',
  openaiApiKey: 'OPENAI_API_KEY',
  openaiModel: 'OPENAI_MODEL',
};

let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  cache = {};
}

function get(key) {
  const stored = cache[key];
  if (stored) return String(stored);
  return process.env[ENV_KEYS[key]] || '';
}

function all() {
  const result = {};
  for (const key of ALLOWED) result[key] = get(key);
  return result;
}

function mask(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 8) return '*'.repeat(text.length);
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

const PLAIN_KEYS = new Set(['volcAppId', 'doubaoModel', 'translationProvider', 'openaiBaseUrl', 'openaiModel']);

function masked() {
  const result = {};
  for (const key of ALLOWED) {
    const value = get(key);
    result[key] = PLAIN_KEYS.has(key) ? value : mask(value);
  }
  result.configured = {
    volc: Boolean(get('volcApiKey') && get('volcAppId') && get('volcAccessToken')),
    doubao: Boolean(get('doubaoApiKey')),
    source: Object.keys(cache).length > 0 ? 'settings' : 'env',
  };
  return result;
}

function update(patch = {}) {
  for (const key of ALLOWED) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === null || value === undefined || String(value).trim() === '') {
      delete cache[key];
    } else {
      cache[key] = String(value).trim();
    }
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8');
  return masked();
}

const PROVIDERS = ['doubao', 'qwen', 'deepseek', 'openai', 'iflytek'];

module.exports = { ALLOWED, PROVIDERS, get, all, masked, update };
