require('dotenv').config();
// 测试语音识别API（auc/submit和auc/query）
const fs = require('fs');
const path = require('path');

// 由于server.js中已经定义了speechToTextWithTimestamps函数
// 我们需要加载它，但为了避免循环依赖，我们可以直接复制关键代码
// 或者我们可以直接调用server.js中的函数
// 但更简单的方法是：直接测试API端点

const axios = require('axios');
const VOLC_API_KEY = process.env.VOLC_API_KEY;

async function testSpeechRecognitionWithAudioFile(audioFilePath) {
  console.log('=== 语音识别API测试 ===');
  console.log('音频文件:', audioFilePath);
  
  try {
    // 1. 读取音频文件
    const audioData = fs.readFileSync(audioFilePath);
    console.log('音频文件大小:', audioData.length, 'bytes');
    
    // 2. 将音频转换为base64
    const base64Audio = audioData.toString('base64');
    console.log('base64编码完成，大小:', base64Audio.length, '字符');
    
    // 3. 提交任务到auc/submit
    console.log('提交任务到auc/submit...');
    // 使用base64编码的音频数据
    
    const submitResponse = await axios.post('https://openspeech.bytedance.com/api/v1/auc/submit', {
      app: {
        appid: process.env.VOLC_APP_ID, // 用户提供的APP ID
        token: process.env.VOLC_ACCESS_TOKEN, // 用户提供的Access Token
        cluster: "volc_auc_common"
      },
      user: {
        uid: "388808087185088_demo" // Python示例中的UID
      },
      audio: {
        format: "wav",
        data: base64Audio,
        rate: 16000
      },
      additions: {
        language: "zh-CN",
        use_itn: "True",
        with_speaker_info: "False"
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer; ${process.env.VOLC_ACCESS_TOKEN}`
      }
    });
    
    console.log('提交响应:', JSON.stringify(submitResponse.data, null, 2));
    
    if (submitResponse.data && submitResponse.data.resp && submitResponse.data.resp.id) {
      const taskId = submitResponse.data.resp.id;
      console.log('✅ 任务提交成功，任务ID:', taskId);
      
      // 4. 轮询查询结果
      const maxRetries = 10; // 减少重试次数，加快测试
      let retryCount = 0;
      
      while (retryCount < maxRetries) {
        console.log(`轮询查询 (${retryCount + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // 等待3秒
        
        try {
          const queryResponse = await axios.post('https://openspeech.bytedance.com/api/v1/auc/query', {
            appid: process.env.VOLC_APP_ID, // 用户提供的APP ID
            token: process.env.VOLC_ACCESS_TOKEN, // 用户提供的Access Token
            id: taskId,
            cluster: "volc_auc_common"
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer; ${process.env.VOLC_ACCESS_TOKEN}`
            }
          });
          
          console.log('查询响应数据:', JSON.stringify(queryResponse.data, null, 2));
          
          // 根据Python示例，检查resp.code
          if (queryResponse.data && queryResponse.data.resp) {
            const resp = queryResponse.data.resp;
            console.log(`任务状态码: ${resp.code}, 消息: ${resp.message}`);
            
            if (resp.code === 1000) { // 任务完成
              console.log('✅ 语音识别成功！');
              
              // 解析识别结果
              if (resp.text) {
                console.log('识别文本:', resp.text);
              }
              
              // 显示utterances（如果有）
              if (resp.utterances && Array.isArray(resp.utterances) && resp.utterances.length > 0) {
                console.log(`识别到 ${resp.utterances.length} 个utterances:`);
                resp.utterances.forEach((utterance, index) => {
                  console.log(`  ${index + 1}. [${utterance.start_time || 0}ms - ${utterance.end_time || 0}ms]: ${utterance.text || '无文本'}`);
                });
              }
              
              return resp;
            } else if (resp.code < 2000) { // 任务失败
              console.error('❌ 任务失败:', resp.message || '未知错误');
              return null;
            }
            // 如果1000 < code < 2000，表示任务还在处理中，继续轮询
          } else {
            console.log('查询响应状态: unknown');
          }
          
          retryCount++;
        } catch (queryError) {
          console.error(`查询失败 (尝试 ${retryCount + 1}):`, queryError.message);
          if (queryError.response) {
            console.error('查询响应状态:', queryError.response.status);
            console.error('查询响应数据:', JSON.stringify(queryError.response.data, null, 2));
          }
          retryCount++;
        }
      }
      
      console.error('❌ 轮询超时，未获取到结果');
      return null;
    } else {
      console.error('❌ 提交失败，响应中没有任务ID');
      console.error('完整响应:', JSON.stringify(submitResponse.data, null, 2));
      return null;
    }
  } catch (error) {
    console.error('❌ API调用失败:');
    console.error('错误信息:', error.message);
    
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
      console.error('响应头:', JSON.stringify(error.response.headers, null, 2));
      
      // 检查是否是404错误（端点不存在）
      if (error.response.status === 404) {
        console.error('⚠️  API端点返回404，可能原因：');
        console.error('  1. 端点URL错误');
        console.error('  2. API服务未开通');
        console.error('  3. 认证格式不正确');
      } else if (error.response.status === 401 || error.response.status === 403) {
        console.error('⚠️  认证失败，可能原因：');
        console.error('  1. API密钥无效');
        console.error('  2. API密钥权限不足');
        console.error('  3. 未开通语音识别服务');
      }
    }
    
    return null;
  }
}

// 主函数
async function main() {
  console.log('开始测试语音识别API...\n');
  
  // 检查是否有可用的音频文件
  const uploadsDir = './uploads';
  const wavFiles = fs.readdirSync(uploadsDir).filter(file => file.endsWith('.wav'));
  
  if (wavFiles.length === 0) {
    console.error('❌ 没有找到WAV音频文件，无法测试');
    console.log('请先上传视频或创建测试音频文件');
    return;
  }
  
  // 使用第一个WAV文件
  const testAudioFile = path.join(uploadsDir, wavFiles[0]);
  console.log(`使用音频文件: ${testAudioFile}`);
  
  const result = await testSpeechRecognitionWithAudioFile(testAudioFile);
  
  if (result) {
    console.log('\n✅ 语音识别API测试成功！');
  } else {
    console.log('\n❌ 语音识别API测试失败');
    console.log('\n建议：');
    console.log('1. 检查火山引擎控制台是否开通了语音识别服务（OpenSpeech ASR）');
    console.log('2. 确认API密钥具有语音识别权限');
    console.log('3. 检查网络连接和防火墙设置');
    console.log('4. 查看火山引擎API文档确认正确的请求格式');
  }
}

// 运行测试
main().catch(error => {
  console.error('测试运行失败:', error);
});