require('dotenv').config();
const axios = require('axios');

// 豆包API密钥
const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY;

async function testProofreadAPI() {
  console.log('=== 测试豆包校准API (新端点) ===');
  
  const originalText = "Hello world, how are you today?";
  const translatedText = "你好世界，你今天好吗？";
  const targetLanguage = 'zh';
  
  console.log('原文:', originalText);
  console.log('译文:', translatedText);
  console.log('目标语言:', targetLanguage);
  
  try {
    const languageNames = {
      'zh': '中文',
      'en': '英文',
      'ja': '日文',
      'ko': '韩文',
      'fr': '法文',
      'de': '德文'
    };

    const targetLang = languageNames[targetLanguage] || targetLanguage;

    // 使用Authorization: Bearer认证
    const headers = {
      'Authorization': `Bearer ${DOUBAO_API_KEY}`,
      'Content-Type': 'application/json'
    };

    // 构建请求体，使用豆包对话API格式
    const requestBody = {
      "model": "doubao-seed-2-0-pro-260215",
      "messages": [
        {
          "role": "system",
          "content": "你是一个专业的翻译校准助手，负责检查翻译质量，评估语义准确性和表达通顺性。"
        },
        {
          "role": "user",
          "content": `请校准验证以下翻译质量，检查语义是否准确、表达是否通顺：

原文：${originalText}

翻译：${translatedText}

请指出翻译是否准确，如有错误请给出修正建议。如果翻译准确，回复"校准通过"。如果需要修正，请先说明问题，然后给出修正后的翻译。`
        }
      ]
    };

    console.log('请求端点:', 'https://ark.cn-beijing.volces.com/api/v3/chat/completions');
    console.log('请求头:', JSON.stringify(headers, null, 2));
    console.log('请求体:', JSON.stringify(requestBody, null, 2));
    
    const response = await axios.post('https://ark.cn-beijing.volces.com/api/v3/chat/completions', requestBody, {
      headers: headers,
      timeout: 30000
    });

    console.log('✅ 请求成功！');
    console.log('响应状态:', response.status);
    console.log('完整响应:', JSON.stringify(response.data, null, 2));
    
    // 解析响应
    let feedback = '';
    if (response.data && response.data.choices && response.data.choices[0]) {
      feedback = response.data.choices[0].message.content.trim();
      console.log('校准反馈:', feedback);
    } else {
      console.error('❌ 无法解析响应格式');
      console.error('完整响应:', JSON.stringify(response.data, null, 2));
      return false;
    }

    // 检查是否需要修正翻译
    if (feedback.includes('校准通过') || feedback.includes('翻译准确')) {
      console.log('✅ 翻译准确，校准通过');
    } else {
      console.log('⚠️  翻译可能需要修正');
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ API调用失败:');
    console.error('错误信息:', error.message);
    
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 401) {
        console.error('⚠️  认证失败，可能原因：');
        console.error('  1. API密钥无效');
        console.error('  2. API密钥没有豆包服务权限');
        console.error('  3. Bearer认证格式不正确');
        console.error('  4. 未开通豆包大模型服务');
      } else if (error.response.status === 404) {
        console.error('⚠️  端点不存在，可能URL错误');
      } else if (error.response.status === 400) {
        console.error('⚠️  请求格式错误');
      }
    }
    
    return false;
  }
}

// 运行测试
testProofreadAPI()
  .then(success => {
    if (success) {
      console.log('\n🎉 豆包校准API测试成功！');
    } else {
      console.log('\n❌ 豆包校准API测试失败');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('测试运行失败:', error);
    process.exit(1);
  });