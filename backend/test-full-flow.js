require('dotenv').config();
// 测试完整的视频翻译流程（使用现有WAV文件）
const fs = require('fs');
const path = require('path');

// 导入server.js中的函数（简化版本）
const axios = require('axios');

// 复制server.js中的API密钥配置
const VOLC_API_KEY = process.env.VOLC_API_KEY;
const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY;

// 生成UUID的函数
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// 语音识别函数（简化版）
async function speechToTextWithTimestamps(audioPath) {
  console.log('1. 开始语音识别处理...');
  console.log('音频文件路径:', audioPath);
  
  try {
    const audioData = fs.readFileSync(audioPath);
    const base64Audio = audioData.toString('base64');
    
    console.log('提交任务到auc/submit...');
    const submitResponse = await axios.post('https://openspeech.bytedance.com/api/v1/auc/submit', {
      app: {
        appid: process.env.VOLC_APP_ID,
        token: process.env.VOLC_ACCESS_TOKEN,
        cluster: "volc_auc_common"
      },
      user: {
        uid: "388808087185088_demo"
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
      
      // 轮询查询结果
      const maxRetries = 30;
      let retryCount = 0;
      
      while (retryCount < maxRetries) {
        console.log(`轮询查询 (${retryCount + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
          const queryResponse = await axios.post('https://openspeech.bytedance.com/api/v1/auc/query', {
            appid: process.env.VOLC_APP_ID,
            token: process.env.VOLC_ACCESS_TOKEN,
            id: taskId,
            cluster: "volc_auc_common"
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer; ${process.env.VOLC_ACCESS_TOKEN}`
            }
          });
          
          console.log(`查询响应状态码: ${queryResponse.data?.resp?.code || 'unknown'}`);
          
          if (queryResponse.data && queryResponse.data.resp) {
            const resp = queryResponse.data.resp;
            
            if (resp.code === 1000) { // 任务完成
              console.log('✅ 语音识别成功！');
              
              // 解析结果
              if (resp.utterances && Array.isArray(resp.utterances) && resp.utterances.length > 0) {
                const subtitles = resp.utterances.map(utterance => ({
                  start_time: utterance.start_time || 0,
                  end_time: utterance.end_time || 5000,
                  text: utterance.text || '未识别到文本'
                }));
                
                console.log(`识别到 ${subtitles.length} 个utterances`);
                console.log('识别文本:', subtitles.map(s => s.text).join(' '));
                return subtitles;
              } else if (resp.text) {
                console.log('识别文本:', resp.text);
                return [{
                  start_time: 0,
                  end_time: 10000,
                  text: resp.text
                }];
              }
              
              console.log('警告: 识别成功但没有文本结果');
              return [];
            } else if (resp.code < 2000) { // 任务失败
              throw new Error(`语音识别任务失败: ${resp.message || '未知错误'}`);
            }
            // 如果1000 < code < 2000，表示任务还在处理中，继续轮询
          }
          
          retryCount++;
        } catch (queryError) {
          console.error(`查询失败 (尝试 ${retryCount + 1}):`, queryError.message);
          retryCount++;
        }
      }
      
      throw new Error('语音识别任务超时，未获取到结果');
    } else {
      throw new Error(`语音识别提交失败: ${JSON.stringify(submitResponse.data)}`);
    }
  } catch (error) {
    console.error('语音识别API调用失败:', error.response?.data || error.message);
    throw new Error(`语音识别失败: ${error.message}`);
  }
}

// 翻译函数
async function translateTextWithVolc(text, targetLanguage) {
  console.log('2. 开始翻译处理...');
  console.log('原文:', text);
  console.log('目标语言:', targetLanguage);
  
  try {
    const langMap = {
      'zh': 'zh',
      'en': 'en',
      'ja': 'ja',
      'ko': 'ko',
      'fr': 'fr',
      'de': 'de',
      'es': 'es',
      'ru': 'ru',
      'ar': 'ar'
    };

    const targetLang = langMap[targetLanguage] || 'zh';
    const sourceLang = '';
    const requestId = generateUUID();

    const response = await axios.post('https://openspeech.bytedance.com/api/v3/machine_translation/matx_translate', {
      text_list: [text],
      source_language: sourceLang,
      target_language: targetLang
    }, {
      headers: {
        'X-Api-Key': VOLC_API_KEY,
        'X-Api-Resource-Id': 'volc.speech.mt',
        'X-Api-Request-Id': requestId,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.code === 20000000 && response.data.data && response.data.data.translation_list) {
      const translation = response.data.data.translation_list[0].translation;
      console.log('✅ 翻译结果:', translation);
      return translation;
    }

    throw new Error(`火山引擎翻译API返回错误: ${JSON.stringify(response.data)}`);
  } catch (error) {
    console.error('火山引擎翻译API调用失败:', error.response?.data || error.message);
    throw new Error(`翻译失败: ${error.message}`);
  }
}

// 校准函数
async function proofreadTranslation(originalText, translatedText, targetLanguage) {
  console.log('3. 开始校准验证...');
  
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

    const headers = {
      'Authorization': `Bearer ${DOUBAO_API_KEY}`,
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
              "text": `请校准验证以下翻译质量，检查语义是否准确、表达是否通顺：

原文：${originalText}

翻译：${translatedText}

请指出翻译是否准确，如有错误请给出修正建议。如果翻译准确，回复"校准通过"。如果需要修正，请先说明问题，然后给出修正后的翻译。`
            }
          ]
        }
      ]
    };

    const response = await axios.post('https://ark.cn-beijing.volces.com/api/v3/responses', requestBody, {
      headers: headers
    });

    // 解析响应
    let feedback = '';
    if (response.data && response.data.output && Array.isArray(response.data.output)) {
      const messageOutput = response.data.output.find(item => item.type === 'message');
      if (messageOutput && messageOutput.content && Array.isArray(messageOutput.content)) {
        const textContent = messageOutput.content.find(item => item.type === 'output_text');
        if (textContent && textContent.text) {
          feedback = textContent.text.trim();
        }
      }
    } else if (response.data && response.data.choices && response.data.choices[0]) {
      feedback = response.data.choices[0].message.content.trim();
    } else {
      throw new Error(`校准API返回无效响应: ${JSON.stringify(response.data)}`);
    }

    console.log('✅ 校准反馈:', feedback.substring(0, 100) + '...');

    // 检查是否需要修正翻译
    if (feedback.includes('校准通过') || feedback.includes('翻译准确')) {
      return { corrected: false, translatedText, feedback };
    }

    // 提取修正后的翻译
    const correctedMatch = feedback.match(/修正后的翻译[：:]\s*["'"]?([^"'。]+)["']?/);
    if (correctedMatch) {
      return { corrected: true, translatedText: correctedMatch[1], feedback };
    }

    return { corrected: false, translatedText, feedback };
  } catch (error) {
    console.error('校准API调用失败:', error.response?.data || error.message);
    throw new Error(`校准失败: ${error.message}`);
  }
}

// 主测试函数
async function testFullFlow() {
  console.log('=== 完整视频翻译流程测试 ===');
  
  // 使用现有的WAV文件
  const uploadsDir = './uploads';
  const wavFiles = fs.readdirSync(uploadsDir).filter(file => file.endsWith('.wav'));
  
  if (wavFiles.length === 0) {
    console.error('❌ 没有找到WAV音频文件');
    return;
  }
  
  const testAudioFile = path.join(uploadsDir, wavFiles[wavFiles.length - 1]); // 使用最新的
  console.log('测试音频文件:', testAudioFile);
  
  try {
    // 步骤1：语音识别
    const subtitles = await speechToTextWithTimestamps(testAudioFile);
    if (!subtitles || subtitles.length === 0) {
      console.error('❌ 语音识别失败或没有识别结果');
      return;
    }
    
    const fullText = subtitles.map(s => s.text).join(' ');
    console.log('✅ 语音识别成功，完整文本:', fullText);
    
    // 步骤2：翻译
    const targetLanguage = 'en'; // 测试翻译成英文
    const translatedText = await translateTextWithVolc(fullText, targetLanguage);
    console.log('✅ 翻译成功，翻译文本:', translatedText);
    
    // 步骤3：校准验证
    const proofreadResult = await proofreadTranslation(fullText, translatedText, targetLanguage);
    console.log('✅ 校准验证完成');
    console.log('校准反馈:', proofreadResult.feedback.substring(0, 150) + '...');
    
    if (proofreadResult.corrected) {
      console.log('校准建议修正:', proofreadResult.translatedText);
    }
    
    console.log('\n🎉 完整流程测试成功！所有步骤均完成。');
    return true;
  } catch (error) {
    console.error('\n❌ 流程测试失败:', error.message);
    console.error('错误堆栈:', error.stack);
    return false;
  }
}

// 运行测试
testFullFlow()
  .then(success => {
    if (success) {
      console.log('\n✅ 端到端测试成功！');
      process.exit(0);
    } else {
      console.log('\n❌ 端到端测试失败');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('测试运行失败:', error);
    process.exit(1);
  });