const path = require('path');
const fs = require('fs');
const { getASRInstance } = require('./local-asr');

const testWavPath = path.join(__dirname, '../k2transducer-zipformer-large-zh-onnx-online-yuekai-20250630/test_wavs/0.wav');

async function testLocalASR() {
  console.log('=== 本地ASR测试开始 ===');
  
  try {
    console.log('获取ASR实例...');
    const asr = await getASRInstance();
    
    if (!asr.isInitialized) {
      console.log('ASR未初始化，正在初始化...');
      const initSuccess = await asr.init();
      if (!initSuccess) {
        throw new Error('ASR初始化失败');
      }
    }
    
    console.log('✓ ASR初始化成功，创建流...');
    asr.createStream();
    
    if (!fs.existsSync(testWavPath)) {
      console.log('⚠ 测试音频文件不存在:', testWavPath);
      console.log('✓ 但ASR模块已加载成功！');
      asr.destroyStream();
      return;
    }
    
    console.log('读取测试音频:', testWavPath);
    
    const wavFile = fs.readFileSync(testWavPath);
    const headerSize = 44;
    const audioData = wavFile.slice(headerSize);
    
    console.log('音频数据大小:', audioData.length, 'bytes');
    console.log('开始处理音频...');
    
    const chunkSize = 3200;
    for (let i = 0; i < audioData.length; i += chunkSize) {
      const chunk = audioData.slice(i, i + chunkSize);
      const result = asr.feedAudio(chunk);
      
      if (result && result.text && !result.isSame) {
        console.log('识别结果:', result.text);
      }
      
      if (result && result.isEndpoint) {
        console.log('检测到端点');
      }
    }
    
    const finalText = asr.getLastText();
    console.log('\n=== 最终识别结果 ===');
    console.log(finalText || '(无识别结果)');
    
    asr.destroyStream();
    
  } catch (error) {
    console.error('✗ 测试失败:', error.message);
    console.error(error.stack);
  }
  
  console.log('\n=== 测试结束 ===');
}

testLocalASR();
