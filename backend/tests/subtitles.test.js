const { test } = require('node:test');
const assert = require('node:assert/strict');
const { adjustSubtitlesTimestamps, mergeSubtitleData } = require('../server.js');

test('时间偏移会整体平移，且不修改入参', () => {
  const original = [{ start_time: 100, end_time: 200, text: '你好' }];
  const shifted = adjustSubtitlesTimestamps(original, 500);

  assert.deepEqual(shifted, [{ start_time: 600, end_time: 700, text: '你好' }]);
  assert.deepEqual(original, [{ start_time: 100, end_time: 200, text: '你好' }]);
});

test('合并片段时按前一片段末条字幕累计偏移', () => {
  const merged = mergeSubtitleData([
    {
      subtitles: [
        { start_time: 0, end_time: 1000, text: 'a' },
        { start_time: 1000, end_time: 2000, text: 'b' },
      ],
    },
    {
      subtitles: [{ start_time: 0, end_time: 500, text: 'c' }],
    },
  ]);

  assert.deepEqual(
    merged.map((item) => [item.start_time, item.end_time, item.text]),
    [
      [0, 1000, 'a'],
      [1000, 2000, 'b'],
      [2000, 2500, 'c'],
    ],
  );
});

test('空片段列表返回空数组', () => {
  assert.deepEqual(mergeSubtitleData([]), []);
});
