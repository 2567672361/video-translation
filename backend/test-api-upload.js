const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testVideoTranslation() {
  console.log('=== 测试视频翻译API ===');
  
  // 使用现有的视频文件
  const videoPath = path.resolve('./uploads/1776259470325.mp4');
  if (!fs.existsSync(videoPath)) {
    console.error('❌ 测试视频文件不存在:', videoPath);
    return;
  }
  
  console.log('使用视频文件:', videoPath);
  
  const form = new FormData();
  form.append('video', fs.createReadStream(videoPath));
  form.append('sourceLanguage', 'zh');
  form.append('targetLanguage', 'en');
  
  console.log('发送请求到 http://localhost:3001/api/translate-video ...');
  
  try {
    const response = await axios.post('http://localhost:3001/api/translate-video', form, {
      headers: {
        ...form.getHeaders()
      },
      timeout: 300000 // 5分钟超时，因为视频处理可能需要时间
    });
    
    console.log('✅ API响应成功');
    console.log('响应状态:', response.status);
    console.log('响应数据:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success) {
      console.log('🎉 视频翻译成功！');
      console.log('原始文本:', response.data.originalText);
      console.log('翻译文本:', response.data.translatedText);
      console.log('视频URL:', response.data.videoUrl);
      console.log('校准状态:', response.data.proofreadCorrected ? '已修正' : '未修正');
      
      // 检查输出文件是否存在
      const outputPath = path.resolve('./uploads', path.basename(response.data.videoUrl));
      if (fs.existsSync(outputPath)) {
        console.log('✅ 输出视频文件已创建:', outputPath);
      } else {
        console.warn('⚠️ 输出视频文件不存在，可能路径错误');
      }
    } else {
      console.error('❌ API返回success: false');
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ API调用失败:');
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
      console.error('错误信息:', error.response.data?.message);
      console.error('错误堆栈:', error.response.data?.stack);
    } else if (error.request) {
      console.error('无响应:', error.message);
    } else {
      console.error('请求错误:', error.message);
    }
    throw error;
  }
}

testVideoTranslation()
  .then(() => {
    console.log('\n测试完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n测试失败');
    process.exit(1);
  });