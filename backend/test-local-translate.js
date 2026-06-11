const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:5001';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkHealth(retries = 30, interval = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
      console.log(`[${i + 1}] 健康检查响应:`, JSON.stringify(res.data));
      if (res.data.status === 'ok' && res.data.model_loaded) {
        return true;
      }
    } catch (e) {
      console.log(`[${i + 1}] 等待服务启动... (${e.message})`);
    }
    await sleep(interval);
  }
  return false;
}

async function testTranslate(text, targetLang, label) {
  console.log(`\n=== ${label} ===`);
  console.log(`原文: ${text}`);
  console.log(`目标语言: ${targetLang}`);

  try {
    const res = await axios.post(`${BASE_URL}/translate`, {
      text,
      target_language: targetLang
    }, {
      timeout: 120000,
      headers: { 'Content-Type': 'application/json' }
    });

    console.log(`翻译结果: ${res.data.translated_text}`);
    console.log(`状态: ✅ 成功`);
    return true;
  } catch (e) {
    console.error(`状态: ❌ 失败`);
    if (e.response) {
      console.error(`响应: ${JSON.stringify(e.response.data)}`);
    } else {
      console.error(`错误: ${e.message}`);
    }
    return false;
  }
}

async function main() {
  console.log('=== 腾讯混元 HY-MT1.5-1.8B 本地翻译测试 ===\n');

  console.log('正在检查翻译服务状态...');
  const healthy = await checkHealth();
  if (!healthy) {
    console.error('\n❌ 翻译服务未就绪，请确保 local_translate.py 已启动');
    process.exit(1);
  }
  console.log('✅ 翻译服务已就绪\n');

  const tests = [
    { text: '你好，世界！', lang: 'en', label: '中译英 - 简单问候' },
    { text: '人工智能正在改变我们的生活方式。', lang: 'en', label: '中译英 - 复杂句' },
    { text: 'Hello, how are you today?', lang: 'zh', label: '英译中 - 简单问候' },
    { text: 'The weather is beautiful and I would like to go for a walk.', lang: 'zh', label: '英译中 - 复合句' },
    { text: '今天天气真好', lang: 'ja', label: '中译日' },
    { text: '机器学习是人工智能的一个分支', lang: 'ko', label: '中译韩' },
  ];

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    const ok = await testTranslate(t.text, t.lang, t.label);
    if (ok) passed++;
    else failed++;
  }

  console.log(`\n=== 测试总结 ===`);
  console.log(`通过: ${passed}, 失败: ${failed}, 总计: ${tests.length}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
