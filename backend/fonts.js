/**
 * 字体库：内置字体（系统安装）+ 用户上传字体（backend/data/fonts）。
 * 上传字体只解析 name 表拿家族名，不做渲染以外的处理。
 */
const fs = require('node:fs');
const path = require('node:path');

const FONT_DIR = path.join(__dirname, 'data', 'fonts');
fs.mkdirSync(FONT_DIR, { recursive: true });

const BUILTIN_FONTS = [
  { id: 'builtin:SimHei', family: 'SimHei', name: '黑体（内置）', builtin: true },
  { id: 'builtin:SimSun', family: 'SimSun', name: '宋体（内置）', builtin: true },
  { id: 'builtin:Microsoft YaHei', family: 'Microsoft YaHei', name: '微软雅黑（内置）', builtin: true },
];

const readUInt16 = (buffer, offset) => buffer.readUInt16BE(offset);
const readUInt32 = (buffer, offset) => buffer.readUInt32BE(offset);

function decodeName(buffer, platformId, offset, length) {
  const raw = buffer.subarray(offset, offset + length);
  if (platformId === 3) {
    let text = '';
    for (let index = 0; index + 1 < raw.length; index += 2) {
      text += String.fromCharCode(raw.readUInt16BE(index));
    }
    return text;
  }
  return raw.toString('latin1');
}

function parseFamilyName(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const version = readUInt32(buffer, 0);
  if (version !== 0x00010000 && version !== 0x4f54544f) return null; // TTF / OTTO

  const numTables = readUInt16(buffer, 4);
  let nameOffset = null;
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    if (record + 16 > buffer.length) break;
    const tag = buffer.toString('ascii', record, record + 4);
    if (tag === 'name') {
      nameOffset = readUInt32(buffer, record + 8);
      break;
    }
  }
  if (nameOffset === null || nameOffset + 6 > buffer.length) return null;

  const count = readUInt16(buffer, nameOffset + 2);
  const stringOffset = readUInt16(buffer, nameOffset + 4);
  const storage = nameOffset + stringOffset;

  const candidates = [];
  for (let index = 0; index < count; index += 1) {
    const record = nameOffset + 6 + index * 12;
    if (record + 12 > buffer.length) break;
    const platformId = readUInt16(buffer, record);
    const nameId = readUInt16(buffer, record + 6);
    const length = readUInt16(buffer, record + 8);
    const offset = readUInt16(buffer, record + 10);
    if (nameId !== 1 && nameId !== 16) continue;
    const value = decodeName(buffer, platformId, storage + offset, length).trim();
    if (!value) continue;
    candidates.push({ value, nameId, platformId });
  }

  if (candidates.length === 0) return null;
  const preferred = candidates.find((item) => item.nameId === 16) || candidates.find((item) => item.platformId === 3) || candidates[0];
  return preferred.value;
}

function fontIdFor(filename) {
  return `file:${path.basename(filename)}`;
}

function listFonts() {
  const files = fs.readdirSync(FONT_DIR).filter((name) => /\.(ttf|otf)$/i.test(name));
  const uploaded = files.map((filename) => {
    const fullPath = path.join(FONT_DIR, filename);
    let family = null;
    try {
      family = parseFamilyName(fs.readFileSync(fullPath));
    } catch {
      family = null;
    }
    return {
      id: fontIdFor(filename),
      family: family || path.parse(filename).name,
      name: family || path.parse(filename).name,
      file: filename,
      builtin: false,
    };
  });
  return [...BUILTIN_FONTS, ...uploaded];
}

function saveFont(buffer, originalName) {
  const extension = path.extname(originalName || '').toLowerCase();
  if (!['.ttf', '.otf'].includes(extension)) {
    throw new Error('仅支持 .ttf / .otf 字体');
  }
  const family = parseFamilyName(buffer);
  if (!family) {
    throw new Error('无法解析字体文件，请确认是有效的 TTF/OTF');
  }
  const safeBase = path
    .basename(originalName, extension)
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '_')
    .slice(0, 40) || 'font';
  const filename = `${Date.now()}_${safeBase}${extension}`;
  fs.writeFileSync(path.join(FONT_DIR, filename), buffer);
  return { id: fontIdFor(filename), family, name: family, file: filename, builtin: false };
}

function removeFont(id) {
  if (!id || !id.startsWith('file:')) return false;
  const filename = path.basename(id.slice(5));
  const fullPath = path.join(FONT_DIR, filename);
  if (!fs.existsSync(fullPath)) return false;
  fs.unlinkSync(fullPath);
  return true;
}

function fontFilePath(id) {
  if (!id || !id.startsWith('file:')) return null;
  const fullPath = path.join(FONT_DIR, path.basename(id.slice(5)));
  return fs.existsSync(fullPath) ? fullPath : null;
}

module.exports = {
  FONT_DIR,
  BUILTIN_FONTS,
  listFonts,
  saveFont,
  removeFont,
  fontFilePath,
  parseFamilyName,
};
