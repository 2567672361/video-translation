const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 导入API函数
const { 
  speechToTextWithTimestamps, 
  translateTextWithVolc, 
  translateTextWithDoubao, 
  proofreadTranslation 
} = require('./server.js');

// 火山引擎API配置
const VOLC_API_KEY = '***REMOVED_VOLC_KEY***';
const VOLC_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3';

// 生成UUID的函数（从server.js复制）
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// 测试1：直接测试火山引擎翻译API
async function testTranslationAPI() {
  console.log('=== 测试1：火山引擎翻译API ===');
  
  try {
    const testText = 'Hello, how are you today?';
    const targetLanguage = 'zh';
    const requestId = generateUUID();
    
    console.log(`测试文本: ${testText}`);
    console.log(`目标语言: ${targetLanguage}`);
    console.log(`请求ID: ${requestId}`);
    
    const response = await axios.post('https://openspeech.bytedance.com/api/v3/machine_translation/matx_translate', {
      text_list: [testText],
      source_language: '',
      target_language: targetLanguage
    }, {
      headers: {
        'X-Api-Key': VOLC_API_KEY,
        'X-Api-Resource-Id': 'volc.speech.mt',
        'X-Api-Request-Id': requestId,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('API响应状态:', response.status);
    console.log('API响应数据:', JSON.stringify(response.data, null, 2));
    
    if (response.data.code === 20000000 && response.data.data && response.data.data.translation_list) {
      console.log('✅ 翻译API测试成功！');
      console.log('翻译结果:', response.data.data.translation_list[0].translation);
      return true;
    } else {
      console.log('❌ 翻译API返回错误:', response.data.message || '未知错误');
      return false;
    }
  } catch (error) {
    console.error('❌ 翻译API调用失败:');
    console.error('错误信息:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
      console.error('响应头:', JSON.stringify(error.response.headers, null, 2));
    }
    return false;
  }
}

// 测试2：测试豆包API
async function testDoubaoAPI() {
  console.log('\n=== 测试2：豆包API ===');
  
  try {
    const testText = 'Hello, this is a test message.';
    const targetLanguage = 'zh';
    const requestId = generateUUID();
    
    console.log(`测试文本: ${testText}`);
    console.log(`目标语言: ${targetLanguage}`);
    
    // 尝试多种认证格式
    const headers = {
      'X-Api-Key': VOLC_API_KEY,
      'X-Api-Request-Id': requestId,
      'Content-Type': 'application/json'
    };
    
    const response = await axios.post(`${VOLC_API_BASE}/chat/completions`, {
      model: 'doubao-pro-32k',
      messages: [{
        role: 'user',
        content: `请将以下文本翻译成中文，只返回翻译结果: ${testText}`
      }],
      max_tokens: 2000,
      temperature: 0.7
    }, {
      headers: headers
    });
    
    console.log('API响应状态:', response.status);
    console.log('API响应数据:', JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.choices && response.data.choices[0]) {
      console.log('✅ 豆包API测试成功！');
      console.log('翻译结果:', response.data.choices[0].message.content);
      return true;
    } else {
      console.log('❌ 豆包API返回无效响应');
      return false;
    }
  } catch (error) {
    console.error('❌ 豆包API调用失败:');
    console.error('错误信息:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
      
      // 如果是认证错误，尝试Bearer token格式
      if (error.response.status === 401) {
        console.log('\n尝试使用Bearer token格式...');
        try {
          const requestId = generateUUID();
          const response = await axios.post(`${VOLC_API_BASE}/chat/completions`, {
            model: 'doubao-pro-32k',
            messages: [{
              role: 'user',
              content: `请将以下文本翻译成中文: Hello`
            }],
            max_tokens: 100,
            temperature: 0.7
          }, {
            headers: {
              'Authorization': `Bearer ${VOLC_API_KEY}`,
              'Content-Type': 'application/json',
              'X-Api-Request-Id': requestId
            }
          });
          
          console.log('Bearer token响应:', JSON.stringify(response.data, null, 2));
        } catch (bearerError) {
          console.error('Bearer token也失败:', bearerError.message);
        }
      }
    }
    return false;
  }
}

// 测试3：测试语音识别API
async function testSpeechRecognitionAPI() {
  console.log('\n=== 测试3：语音识别API ===');
  
  try {
    // 创建一个简单的测试音频文件（1秒静音）
    // 或者使用现有的测试音频文件
    console.log('注意: 需要音频文件进行测试，跳过此测试或提供测试音频文件');
    console.log('要测试语音识别，请提供一个WAV格式的音频文件路径');
    
    // 这里可以添加代码来测试语音识别API
    // 但需要实际的音频文件
    
    return 'skipped';
  } catch (error) {
    console.error('❌ 语音识别API测试失败:', error.message);
    return false;
  }
}

// 测试4：测试API密钥格式
async function testAPIKeyFormat() {
  console.log('\n=== 测试4：API密钥格式验证 ===');
  
  console.log('API密钥:', VOLC_API_KEY);
  console.log('密钥长度:', VOLC_API_KEY.length);
  console.log('密钥格式: UUID格式');
  
  // 检查API密钥是否符合UUID格式
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(VOLC_API_KEY)) {
    console.log('✅ API密钥格式正确（UUID格式）');
  } else {
    console.log('⚠️  API密钥不是标准UUID格式');
  }
  
  return true;
}

// 主测试函数
async function runAllTests() {
  console.log('开始测试火山引擎API功能...\n');
  
  // 测试API密钥格式
  await testAPIKeyFormat();
  
  // 测试翻译API
  const translationResult = await testTranslationAPI();
  
  // 测试豆包API
  const doubaoResult = await testDoubaoAPI();
  
  // 测试语音识别API
  const speechResult = await testSpeechRecognitionAPI();
  
  console.log('\n=== 测试总结 ===');
  console.log(`翻译API: ${translationResult ? '✅ 通过' : '❌ 失败'}`);
  console.log(`豆包API: ${doubaoResult ? '✅ 通过' : '❌ 失败'}`);
  console.log(`语音识别API: ${speechResult === 'skipped' ? '⚠️  跳过' : speechResult ? '✅ 通过' : '❌ 失败'}`);
  
  if (!translationResult && !doubaoResult) {
    console.log('\n⚠️  所有API测试失败，可能的原因：');
    console.log('1. API密钥无效或已过期');
    console.log('2. 未开通相应服务权限');
    console.log('3. 网络连接问题');
    console.log('4. API端点或认证格式不正确');
    console.log('\n建议：');
    console.log('1. 登录火山引擎控制台检查API密钥状态');
    console.log('2. 确认已开通机器翻译和豆包大模型服务');
    console.log('3. 检查账户余额和配额');
    console.log('4. 查看API文档确认正确的请求格式');
  }
}

// 运行测试
runAllTests().catch(error => {
  console.error('测试运行失败:', error);
});