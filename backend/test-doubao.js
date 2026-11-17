require('dotenv').config();
// 测试豆包大模型API
const axios = require('axios');
const VOLC_API_KEY = process.env.DOUBAO_API_KEY; // 豆包API密钥

async function testDoubaoAPI() {
  console.log('=== 豆包大模型API测试 ===');
  
  try {
    const headers = {
      'Authorization': `Bearer ${VOLC_API_KEY}`,
      'Content-Type': 'application/json'
    };

    const requestBody = {
      "model": "doubao-seed-2-0-pro-260215",
      "input": [
        {
          "role": "user",
          "content": [
            {
              "type": "input_text",
              "text": "请将以下文本翻译成英文，只返回翻译结果：你好，世界！"
            }
          ]
        }
      ]
    };

    console.log('发送请求到豆包API...');
    console.log('端点:', 'https://ark.cn-beijing.volces.com/api/v3/responses');
    console.log('请求体:', JSON.stringify(requestBody, null, 2));
    
    const response = await axios.post('https://ark.cn-beijing.volces.com/api/v3/responses', requestBody, {
      headers: headers,
      timeout: 10000
    });

    console.log('✅ 请求成功！');
    console.log('响应状态:', response.status);
    console.log('完整响应:', JSON.stringify(response.data, null, 2));
    
    // 解析响应
    // 根据测试结果，响应格式为output数组，包含reasoning和message
    if (response.data && response.data.output && Array.isArray(response.data.output)) {
      // 查找type为"message"的输出项
      const messageOutput = response.data.output.find(item => item.type === 'message');
      if (messageOutput && messageOutput.content && Array.isArray(messageOutput.content)) {
        // 查找type为"output_text"的内容项
        const textContent = messageOutput.content.find(item => item.type === 'output_text');
        if (textContent && textContent.text) {
          console.log('✅ 翻译结果:', textContent.text.trim());
          return true;
        }
      }
    } else if (response.data && response.data.choices && response.data.choices[0]) {
      console.log('翻译结果:', response.data.choices[0].message.content.trim());
      return true;
    } else {
      console.error('❌ 无法解析响应格式');
      console.error('完整响应:', JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ API调用失败:');
    console.error('错误信息:', error.message);
    
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
      console.error('响应头:', JSON.stringify(error.response.headers, null, 2));
      
      if (error.response.status === 401) {
        console.error('⚠️  认证失败，可能原因：');
        console.error('  1. API密钥无效');
        console.error('  2. API密钥没有豆包服务权限');
        console.error('  3. Bearer认证格式不正确');
        console.error('  4. 未开通豆包大模型服务');
      } else if (error.response.status === 404) {
        console.error('⚠️  端点不存在，可能URL错误');
      }
    }
    
    return false;
  }
}

// 运行测试
testDoubaoAPI()
  .then(success => {
    if (success) {
      console.log('\n✅ 豆包API测试成功！');
    } else {
      console.log('\n❌ 豆包API测试失败');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('测试运行失败:', error);
    process.exit(1);
  });