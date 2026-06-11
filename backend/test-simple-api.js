const axios = require('axios');

async function testSimpleApi() {
  console.log('=== 测试简单 API ===');
  try {
    // 尝试访问后端根路径
    console.log('1. 测试根路径 GET http://localhost:3001/');
    const rootResponse = await axios.get('http://localhost:3001/');
    console.log('   状态码:', rootResponse.status);
    console.log('   响应:', rootResponse.data);
  } catch (error) {
    console.error('❌ 根路径请求失败:');
    if (error.response) {
      console.error('   状态码:', error.response