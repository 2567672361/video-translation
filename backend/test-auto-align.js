require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// 用户提供的凭据
const APP_ID = process.env.VOLC_APP_ID;
const ACCESS_TOKEN = process.env.VOLC_ACCESS_TOKEN;
const SECRET_KEY = process.env.VOLC_SECRET_KEY;

// 查找最新的WAV音频文件
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
  console.error('❌ uploads目录不存在:', uploadsDir);
  process.exit(1);
}

const wavFiles = fs.readdirSync(uploadsDir)
  .filter(file => file.endsWith('.wav'))
  .map(file => ({
    name: file,
    path: path.resolve(uploadsDir, file),
    mtime: fs.statSync(path.resolve(uploadsDir, file)).mtime
  }))
  .sort((a, b) => b.mtime - a.mtime); // 按修改时间倒序排序

if (wavFiles.length === 0) {
  console.error('❌ uploads目录中没有WAV音频文件');
  process.exit(1);
}

const audioPath = wavFiles[0].path;
console.log(`找到 ${wavFiles.length} 个WAV文件，使用最新的: ${path.basename(audioPath)}`);

console.log('测试自动字幕打轴API');
console.log('APP ID:', APP_ID);
console.log('音频文件:', audioPath);
console.log('文件大小:', fs.statSync(audioPath).size, 'bytes');

// 测试文本
const testText = "This is a test subtitle for auto alignment with audio timing.";

async function testEndpoint(endpointUrl, authMethod = 'Bearer', contentType = 'multipart/form-data') {
  console.log(`\n=== 测试端点: ${endpointUrl} ===`);
  console.log('认证方法:', authMethod);
  console.log('Content-Type:', contentType);
  
  try {
    const audioData = fs.readFileSync(audioPath);
    const form = new FormData();
    form.append('data', audioData, {
      filename: 'test.wav',
      contentType: 'audio/wav'
    });
    form.append('audio-text', testText);
    
    // 构建URL参数
    const appid = APP_ID;
    const caption_type = "speech";
    const sta_punc_mode = "1";
    const caption_category = "2";
    const cluster = "ata_cluster";
    
    const url = `${endpointUrl}?appid=${appid}&caption_type=${caption_type}&sta_punc_mode=${sta_punc_mode}&caption_category=${caption_category}&cluster=${cluster}`;
    
    console.log('请求URL:', url);
    
    // 构建请求头
    const headers = {
      ...form.getHeaders()
    };
    
    // 添加认证
    if (authMethod === 'Bearer') {
      headers['Authorization'] = `Bearer ${ACCESS_TOKEN}`;
    } else if (authMethod === 'Bearer;') {
      headers['Authorization'] = `Bearer; ${ACCESS_TOKEN}`;
    } else if (authMethod === 'Secret') {
      headers['X-Secret-Key'] = SECRET_KEY;
    }
    
    console.log('请求头:', JSON.stringify(headers, null, 2));
    
    const response = await axios.post(url, form, {
      headers: headers,
      timeout: 30000
    });
    
    console.log('✅ 响应状态:', response.status);
    console.log('响应数据:', JSON.stringify(response.data, null, 2));
    
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    console.error('❌ 请求失败:');
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
      console.error('错误信息:', error.response.statusText);
    } else if (error.request) {
      console.error('无响应:', error.message);
    } else {
      console.error('请求错误:', error.message);
    }
    console.error('错误堆栈:', error.stack);
    
    return {
      success: false,
      error: error.message
    };
  }
}

async function testAllEndpoints() {
  console.log('开始测试所有可能的API端点...\n');
  
  // 测试不同的端点
  const endpoints = [
    {
      url: 'https://openspeech.bytedance.com/api/v1/vc/ata/submit',
      authMethod: 'Bearer;',
      description: '文档中显示的端点 (vc/ata/submit)'
    },
    {
      url: 'https://openspeech.bytedance.com/api/v1/ata/submit',
      authMethod: 'Bearer;',
      description: '简化的端点 (ata/submit)'
    },
    {
      url: 'http://openspeech.bytedance.com/api/v1/vc/ata/submit',
      authMethod: 'Bearer;',
      description: 'HTTP版本的端点'
    },
    {
      url: 'https://openspeech.bytedance.com/api/v1/vc/ata/submit',
      authMethod: 'Bearer',
      description: '使用标准Bearer认证'
    },
    {
      url: 'https://openspeech.bytedance.com/api/v1/vc/ata/submit',
      authMethod: 'Secret',
      description: '使用Secret Key认证'
    }
  ];
  
  const results = [];
  
  for (const endpoint of endpoints) {
    console.log(`\n--- ${endpoint.description} ---`);
    const result = await testEndpoint(endpoint.url, endpoint.authMethod);
    results.push({
      endpoint: endpoint.url,
      authMethod: endpoint.authMethod,
      description: endpoint.description,
      success: result.success,
      data: result.data,
      error: result.error
    });
  }
  
  // 输出总结
  console.log('\n\n=== 测试总结 ===');
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.description}`);
    console.log(`   端点: ${result.endpoint}`);
    console.log(`   认证: ${result.authMethod}`);
    console.log(`   结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    if (result.success && result.data) {
      console.log(`   任务ID: ${result.data.id || 'N/A'}`);
      console.log(`   状态码: ${result.data.code || 'N/A'}`);
    } else if (result.error) {
      console.log(`   错误: ${result.error}`);
    }
  });
  
  // 找出成功的端点
  const successfulEndpoints = results.filter(r => r.success);
  if (successfulEndpoints.length > 0) {
    console.log('\n🎉 找到可用的端点:');
    successfulEndpoints.forEach(endpoint => {
      console.log(`   - ${endpoint.description} (${endpoint.endpoint})`);
    });
  } else {
    console.log('\n❌ 所有端点测试失败，可能需要检查网络、认证或API权限');
  }
}

testAllEndpoints().catch(console.error);