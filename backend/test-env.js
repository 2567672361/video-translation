// 环境变量配置验证脚本
require('dotenv').config();

console.log('=== 环境变量配置验证 ===\n');

// 检查必需的环境变量
const requiredEnvVars = [
  'VOLC_API_KEY',
  'DOUBAO_API_KEY', 
  'VOLC_APP_ID',
  'VOLC_ACCESS_TOKEN'
];

const optionalEnvVars = [
  'DOUBAO_MODEL',
  'PORT',
  'NODE_ENV'
];

console.log('🔍 检查必需的环境变量:');
let allRequiredPresent = true;
for (const varName of requiredEnvVars) {
  const value = process.env[varName];
  const isPresent = value && value.trim() !== '';
  const displayValue = isPresent ? 
    (varName.includes('KEY') || varName.includes('TOKEN') ? 
      `${value.substring(0, 8)}...${value.substring(value.length - 8)}` : 
      value) : 
    '未设置';
  
  console.log(`  ${varName}: ${isPresent ? '✅' : '❌'} ${displayValue}`);
  
  if (!isPresent) {
    allRequiredPresent = false;
  }
}

console.log('\n🔍 检查可选的环境变量:');
for (const varName of optionalEnvVars) {
  const value = process.env[varName];
  const isPresent = value && value.trim() !== '';
  const displayValue = isPresent ? value : '未设置（使用默认值）';
  
  console.log(`  ${varName}: ${isPresent ? '✅' : '⚠️'} ${displayValue}`);
}

console.log('\n🔍 验证环境变量在server.js中的使用:');
try {
  // 动态加载server.js的变量定义部分
  const fs = require('fs');
  const serverContent = fs.readFileSync('server.js', 'utf-8');
  
  // 检查关键变量是否使用process.env
  const checks = [
    { pattern: /const VOLC_API_KEY = process\.env\.VOLC_API_KEY/, name: 'VOLC_API_KEY引用' },
    { pattern: /const DOUBAO_API_KEY = process\.env\.DOUBAO_API_KEY/, name: 'DOUBAO_API_KEY引用' },
    { pattern: /const VOLC_APP_ID = process\.env\.VOLC_APP_ID/, name: 'VOLC_APP_ID引用' },
    { pattern: /const VOLC_ACCESS_TOKEN = process\.env\.VOLC_ACCESS_TOKEN/, name: 'VOLC_ACCESS_TOKEN引用' },
    { pattern: /const DOUBAO_MODEL = process\.env\.DOUBAO_MODEL/, name: 'DOUBAO_MODEL引用' },
    { pattern: /const port = process\.env\.PORT/, name: 'PORT引用' }
  ];
  
  let allChecksPassed = true;
  for (const check of checks) {
    const isFound = check.pattern.test(serverContent);
    console.log(`  ${check.name}: ${isFound ? '✅' : '❌'} ${isFound ? '正确使用环境变量' : '未正确使用环境变量'}`);
    if (!isFound) {
      allChecksPassed = false;
    }
  }
  
  console.log('\n🔍 检查硬编码残留:');
  const hardcodedChecks = [
    { pattern: /(API_KEY|ACCESS_TOKEN|SECRET_KEY|APP_ID)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/, name: '密钥或凭据硬编码' },
    { pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, name: 'UUID 形式密钥硬编码' },
    { pattern: /Bearer;\s+[A-Za-z0-9_\-]{20,}/, name: 'Bearer 令牌硬编码' }
  ];
  
  let hardcodedFound = false;
  for (const check of hardcodedChecks) {
    const isFound = check.pattern.test(serverContent);
    if (isFound) {
      console.log(`  ${check.name}: ❌ 发现硬编码残留`);
      hardcodedFound = true;
    }
  }
  
  if (!hardcodedFound) {
    console.log('  ✅ 未发现硬编码残留');
  }
  
  console.log('\n=== 验证结果 ===');
  if (allRequiredPresent && allChecksPassed && !hardcodedFound) {
    console.log('✅ 所有配置验证通过！环境变量配置正确。');
    console.log('\n下一步：');
    console.log('1. 运行 node server.js 启动服务器');
    console.log('2. 使用测试API端点验证功能');
    console.log('3. 确保 .env 文件已添加到 .gitignore');
  } else {
    console.log('❌ 配置验证未通过，请检查以上问题。');
    if (!allRequiredPresent) {
      console.log('    - 缺少必需的环境变量');
    }
    if (!allChecksPassed) {
      console.log('    - server.js中环境变量引用不正确');
    }
    if (hardcodedFound) {
      console.log('    - 发现硬编码残留');
    }
    process.exit(1);
  }
  
} catch (error) {
  console.error('验证过程中出错:', error.message);
  process.exit(1);
}