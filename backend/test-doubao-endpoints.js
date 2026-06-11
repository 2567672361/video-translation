const axios = require('axios');

// 豆包API密钥
const DOUBAO_API_KEY = '***REMOVED_DOUBAO_KEY***';

// 测试两种不同的端点格式
async function testEndpoint(endpointUrl, requestBody, description) {
  console.log(`\n=== 测试: ${description} ===`);
  console.log(`端点: ${endpointUrl}`);
  
  try {
    const headers = {
      'Authorization': `Bearer ${DOUBAO_API_KEY}`,
      'Content-Type': 'application/json'
    };
    
    console.log('请求头:', JSON.stringify(headers, null, 2));
    console.log('请求体:', JSON.stringify(requestBody, null, 2));
    
    const response = await axios.post(endpointUrl, requestBody, {
      headers: headers,
      timeout: 60000 // 60秒超时
    });
    
    console.log('✅ 请求成功！');
    console.log('响应状态:', response.status);
    console.log('响应数据:', JSON.stringify(response.data, null, 2));
    
    // 解析响应
    if (response.data && response.data.output && Array.isArray(response.data.output)) {
      const messageOutput = response.data.output.find(item => item.type === 'message');
      if (messageOutput && messageOutput.content) {
        const textContent = messageOutput.content.find(item => item.type === 'output_text');
        if (textContent && textContent.text) {
          console.log('响应文本:', textContent.text.trim());
        }
      }
    } else if (response.data && response.data.choices && response.data.choices[0]) {
      console.log('响应文本:', response.data.choices[0].message.content.trim());
    }
    
    return { success: true, data: response.data };
  } catch (error) {
    console.error('❌ 请求失败:');
    console.error('错误信息:', error.message);
    
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('无响应（网络或超时错误）');
    }
    
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('开始测试豆包API不同端点...');
  
  // 测试数据
  const originalText = "Hello world, how are you today?";
  const translatedText = "你好世界，你今天好吗？";
  
  // 测试1: /api/v3/responses 端点 (测试成功的格式)
  const test1RequestBody = {
    "model": "doubao-seed-2-0-pro-260215",
    "input": [
      {
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": `请校准验证以下翻译质量，检查语义是否准确、表达是否通顺：

原文：${originalText}

翻译：${translatedText}

请指出翻译是否准确，如有错误请给出修正建议。如果翻译准确，回复"校准通过"。如果需要修正，请先说明问题，然后给出修正后的翻译。`
          }
        ]
      }
    ]
  };
  
  // 测试2: /api/v3/chat/completions 端点 (文档格式)
  const test2RequestBody = {
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
  
  // 测试3: /api/v3/chat/completions 端点，但使用简单的请求
  const test3RequestBody = {
    "model": "doubao-seed-2-0-pro-260215",
    "messages": [
      {
        "role": "user",
        "content": "你好，请回复'测试成功'"
      }
    ]
  };
  
  const tests = [
    {
      url: 'https://ark.cn-beijing.volces.com/api/v3/responses',
      body: test1RequestBody,
      desc: '/api/v3/responses 端点 (input格式)'
    },
    {
      url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
      body: test2RequestBody,
      desc: '/api/v3/chat/completions 端点 (messages格式，完整校准)'
    },
    {
      url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
      body: test3RequestBody,
      desc: '/api/v3/chat/completions 端点 (messages格式，简单测试)'
    }
  ];
  
  const results = [];
  
  for (const test of tests) {
    const result = await testEndpoint(test.url, test.body, test.desc);
    results.push({
      description: test.desc,
      url: test.url,
      success: result.success,
      error: result.error
    });
  }
  
  // 输出总结
  console.log('\n\n=== 测试总结 ===');
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.description}`);
    console.log(`   端点: ${result.url}`);
    console.log(`   结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    if (!result.success && result.error) {
      console.log(`   错误: ${result.error}`);
    }
  });
  
  // 找出可用的端点
  const successfulTests = results.filter(r => r.success);
  if (successfulTests.length > 0) {
    console.log('\n🎉 找到可用的端点:');
    successfulTests.forEach(test => {
      console.log(`   - ${test.description}`);
    });
  } else {
    console.log('\n❌ 所有端点测试失败');
  }
}

runAllTests().catch(console.error);