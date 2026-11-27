const { test } = require('node:test')
const assert = require('node:assert/strict')
const axios = require('axios')
const { translateSubtitlesWithLLM } = require('../server.js')

test('逐句翻译保留时间轴并传递语言参数', async () => {
  const original = axios.post
  let captured = null
  axios.post = async (url, body) => {
    captured = body
    return { data: { output: [{ type: 'message', content: [{ type: 'output_text', text: '甲\n乙' }] }] } }
  }

  try {
    const result = await translateSubtitlesWithLLM(
      [
        { start_time: 0, end_time: 1000, text: 'one' },
        { start_time: 1000, end_time: 2000, text: 'two' },
      ],
      'zh',
      'en',
    )
    assert.equal(result.length, 2)
    assert.equal(result[1].start_time, 1000)
    assert.equal(result[1].text, '乙')
    assert.equal(captured.input[0].content[0].translation_options.source_language, 'en')
    assert.equal(captured.input[0].content[0].translation_options.target_language, 'zh')
  } finally {
    axios.post = original
  }
})
