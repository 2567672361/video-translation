// 测试火山引擎机器翻译API分段功能
require('dotenv').config();
const { translateTextWithVolc } = require('./server.js');

async function testShortText() {
  console.log('=== 测试短文本翻译 ===');
  const shortText = "你好，世界！这是一个测试。";
  const targetLanguage = 'en';
  
  try {
    console.log(`原文: "${shortText}" (${shortText.length}字符)`);
    const result = await translateTextWithVolc(shortText, targetLanguage);
    console.log(`翻译: "${result}"`);
    console.log('✅ 短文本翻译成功\n');
    return true;
  } catch (error) {
    console.error('❌ 短文本翻译失败:', error.message, '\n');
    return false;
  }
}

async function testLongText() {
  console.log('=== 测试长文本翻译（应触发分段） ===');
  
  // 创建一个超过800字符的长文本
  let longText = '';
  const repeatedText = "这是一个测试句子，用于验证火山引擎翻译API的分段功能。";
  
  // 重复句子直到超过800字符
  while (longText.length < 850) {
    longText += repeatedText + " ";
  }
  
  longText = longText.trim();
  const targetLanguage = 'en';
  
  console.log(`原文长度: ${longText.length}字符`);
  console.log(`前100字符: "${longText.substring(0, 100)}..."`);
  
  try {
    console.log('开始翻译（应触发分段逻辑）...');
    const result = await translateTextWithVolc(longText, targetLanguage);
    console.log(`翻译结果长度: ${result.length}字符`);
    console.log(`前100字符: "${result.substring(0, 100)}..."`);
    console.log('✅ 长文本翻译成功\n');
    return true;
  } catch (error) {
    console.error('❌ 长文本翻译失败:', error.message, '\n');
    return false;
  }
}

async function testVeryLongText() {
  console.log('=== 测试超长文本翻译（超过1600字符） ===');
  
  // 创建一个超过1600字符的超长文本
  let veryLongText = '';
  const repeatedText = "这是一个更长的测试段落，用于验证火山引擎翻译API在处理超长文本时的分段和错误处理能力。";
  
  // 重复句子直到超过1600字符
  while (veryLongText.length < 2000) {
    veryLongText += repeatedText + " ";
  }
  
  veryLongText = veryLongText.trim();
  const targetLanguage = 'en';
  
  console.log(`原文长度: ${veryLongText.length}字符`);
  console.log(`前100字符: "${veryLongText.substring(0, 100)}..."`);
  
  try {
    console.log('开始翻译（应触发多次分段）...');
    const result = await translateTextWithVolc(veryLongText, targetLanguage);
    console.log(`翻译结果长度: ${result.length}字符`);
    console.log(`前100字符: "${result.substring(0, 100)}..."`);
    console.log('✅ 超长文本翻译成功\n');
    return true;
  } catch (error) {
    console.error('❌ 超长文本翻译失败:', error.message, '\n');
    return false;
  }
}

async function testEdgeCases() {
  console.log('=== 测试边界情况 ===');
  
  const testCases = [
    { text: '', description: '空字符串' },
    { text: ' ', description: '空格' },
    { text: '\n\n\n', description: '换行符' },
    { text: '!@#$%^&*()', description: '特殊字符' },
    { text: '1234567890', description: '纯数字' },
    { text: 'a'.repeat(799), description: '799字符（刚好小于限制）' },
    { text: 'a'.repeat(801), description: '801字符（刚好超过限制）' },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`\n测试: ${testCase.description}`);
    console.log(`文本: "${testCase.text.substring(0, 50)}${testCase.text.length > 50 ? '...' : ''}" (${testCase.text.length}字符)`);
    
    try {
      const result = await translateTextWithVolc(testCase.text, 'en');
      console.log(`结果: "${result.substring(0, 50)}${result.length > 50 ? '...' : ''}"`);
      console.log('✅ 通过');
      passed++;
    } catch (error) {
      console.log(`❌ 失败: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n边界情况测试结果: ${passed}通过, ${failed}失败\n`);
  return failed === 0;
}

async function runAllTests() {
  console.log('🚀 开始翻译分段功能测试\n');
  
  const results = [];
  
  results.push(await testShortText());
  results.push(await testLongText());
  results.push(await testVeryLongText());
  results.push(await testEdgeCases());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log('📊 测试结果汇总:');
  console.log(`✅ 通过: ${passed}/${total}`);
  console.log(`❌ 失败: ${total - passed}/${total}`);
  
  if (passed === total) {
    console.log('\n🎉 所有测试通过！分段翻译功能正常。');
    process.exit(0);
  } else {
    console.log('\n⚠️  部分测试失败，请检查上述错误。');
    process.exit(1);
  }
}

// 检查必需的环境变量
if (!process.env.VOLC_API_KEY) {
  console.error('❌ 缺少环境变量 VOLC_API_KEY');
  console.error('请确保 .env 文件已正确配置');
  process.exit(1);
}

console.log('🔧 配置检查:');
console.log(`- VOLC_API_KEY: ${process.env.VOLC_API_KEY.substring(0, 8)}...${process.env.VOLC_API_KEY.substring(process.env.VOLC_API_KEY.length - 8)}`);
console.log(`- NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

// 运行测试
runAllTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});