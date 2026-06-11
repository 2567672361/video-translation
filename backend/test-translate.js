// 测试火山引擎机器翻译API
const axios = require('axios');
const VOLC_API_KEY = '***REMOVED_VOLC_KEY***';

// 生成UUID的函数（复制自server.js）
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

async function testTranslateAPI() {
  console.log('=== 火山引擎机器翻译API测试 ===');
  
  try {
    const text = "你好，世界！";
    const targetLanguage = 'en';
    
    const langMap = {
      'zh': 'zh',
      'en': 'en',
      'ja': 'ja',
      'ko': 'ko',
      'fr': 'fr',
      'de': 'de',
      'es': 'es',
      'ru': 'ru',
      'ar': 'ar'
    };

    const targetLang = langMap[targetLanguage] || 'zh';
    const sourceLang = ''; // 空字符串表示自动检测源语言
    const requestId = generateUUID();

    console.log('测试文本:', text);
    console.log('目标语言:', targetLanguage, '->', targetLang);
    console.log('请求ID:', requestId);
    console.log('API端点:', 'https://openspeech.bytedance.com/api/v3/machine_translation/matx_translate');
    
    const response = await axios.post('https://openspeech.bytedance.com/api/v3/machine_translation/matx_translate', {
      text_list: [text], // 文档要求是数组，即使只有一条文本
      source_language: sourceLang,
      target_language: targetLang
    }, {
      headers: {
        'X-Api-Key': VOLC_API_KEY,
        'X-Api-Resource-Id': 'volc.speech.mt', // 固定值
        'X-Api-Request-Id': requestId,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log('✅ 请求成功！');
    console.log('响应状态:', response.status);
    console.log('完整响应:', JSON.stringify(response.data, null, 2));
    
    // 检查响应格式
    if (response.data.code === 20000000 && response.data.data && response.data.data.translation_list) {
      const translation = response.data.data.translation_list[0].translation;
      console.log('✅ 翻译结果:', translation);
      return true;
    } else {
      console.error('❌ API返回错误码:', response.data.code);
      console.error('错误信息:', response.data.message || '未知错误');
      return false;
    }
  } catch (error) {
    console.error('❌ API调用失败:');
    console.error('错误信息:', error.message);
    
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
      console.error('响应头:', JSON.stringify(error.response.headers, null, 2));
      
      if (error.response.status === 401 || error.response.status === 403) {
        console.error('⚠️  认证失败，可能原因：');
        console.error('  1. API密钥无效');
        console.error('  2. API密钥没有翻译服务权限');
        console.error('  3. X-Api-Resource-Id值不正确');
        console.error('  4. 未开通机器翻译服务');
      } else if (error.response.status === 404) {
        console.error('⚠️  端点不存在，可能URL错误');
      }
    }
    
    return false;
  }
}

// 运行测试
testTranslateAPI()
  .then(success => {
    if (success) {
      console.log('\n✅ 翻译API测试成功！');
    } else {
      console.log('\n❌ 翻译API测试失败');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('测试运行失败:', error);
    process.exit(1);
  });