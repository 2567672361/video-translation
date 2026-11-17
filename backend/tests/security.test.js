const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveTempFile } = require('../server.js');

const insideTempDir = (candidate, reference) => {
  assert.ok(candidate, '应解析出路径');
  assert.ok(path.isAbsolute(candidate), '应为绝对路径');
  assert.ok(!candidate.includes('..'), '结果不应包含上级目录');
  assert.equal(path.dirname(candidate), path.dirname(reference), '应落在临时目录内');
};

test('普通文件名解析到临时目录', () => {
  const reference = resolveTempFile('reference.mp4');
  const parsed = resolveTempFile('video.mp4');
  insideTempDir(parsed, reference);
  assert.equal(path.basename(parsed), 'video.mp4');
});

test('拒绝 ../ 形式的目录穿越', () => {
  const reference = resolveTempFile('reference.mp4');
  insideTempDir(resolveTempFile('../../.env'), reference);
  insideTempDir(resolveTempFile('../../../windows/win.ini'), reference);
});

test('拒绝反斜杠形式的目录穿越（Windows）', () => {
  const reference = resolveTempFile('reference.mp4');
  const parsed = resolveTempFile('..\\..\\secret.txt');
  insideTempDir(parsed, reference);
  assert.equal(path.basename(parsed), 'secret.txt');
});

test('绝对路径被降级为临时目录内的文件名', () => {
  const reference = resolveTempFile('reference.mp4');
  const parsed = resolveTempFile('C:\\Windows\\win.ini');
  insideTempDir(parsed, reference);
});

test('空值与纯目录名返回 null', () => {
  assert.equal(resolveTempFile(''), null);
  assert.equal(resolveTempFile(null), null);
  assert.equal(resolveTempFile(undefined), null);
  assert.equal(resolveTempFile('..'), null);
  assert.equal(resolveTempFile('../'), null);
});
