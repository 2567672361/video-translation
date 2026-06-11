const express = require('express');
const axios = require('axios');
const WebSocket = require('ws');
const router = express.Router();
const { getASRInstance } = require('./local-asr');

const VOLC_API_KEY = process.env.VOLC_API_KEY || '';
const LOCAL_TRANSLATE_URL = process.env.LOCAL_TRANSLATE_URL || 'http://127.0.0.1:5001/translate';
const USE_LOCAL_TRANSLATE = process.env.USE_LOCAL_TRANSLATE === 'true';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

let translateQueue = Promise.resolve();

const translateTextWithLocal = async (text, targetLanguage) => {
  const doRequest = async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await axios.post(LOCAL_TRANSLATE_URL, {
          text: text,
          target_language: targetLanguage
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 120000
        });

        if (response.data && response.data.translated_text) {
          return response.data.translated_text;
        }
        throw new Error(`翻译响应异常: ${JSON.stringify(response.data)}`);
      } catch (error) {
        if (attempt < 3 && (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET')) {
          console.log(`[VT] 本地翻译重试 ${attempt}/3 (${error.code})`);
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        console.error('[VT] 本地翻译最终失败:', error.code || error.message);
        throw error;
      }
    }
  };

  const chained = translateQueue.then(() => doRequest()).catch(err => {
    throw new Error(`本地翻译失败: ${err.message}`);
  });
  translateQueue = chained.catch(() => {});
  return chained;
};

const translateTextWithVolc = async (text, targetLanguage) => {
  try {
    const langMap = {
      'zh': 'zh', 'en': 'en', 'ja': 'ja', 'ko': 'ko',
      'fr': 'fr', 'de': 'de', 'es': 'es', 'ru': 'ru', 'ar': 'ar'
    };

    const targetLang = langMap[targetLanguage] || 'zh';
    const requestId = generateUUID();

    const response = await axios.post('https://openspeech.bytedance.com/api/v3/machine_translation/matx_translate', {
      text_list: [text],
      source_language: '',
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
      return response.data.data.translation_list[0].translation || text;
    }

    throw new Error(`翻译API返回错误: ${JSON.stringify(response.data)}`);

  } catch (error) {
    console.error('火山引擎翻译API调用失败:', error.response?.data || error.message);
    throw new Error(`翻译失败: ${error.message}`);
  }
};

router.post('/api/voice-translation/translate', async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const translatedText = await translateTextWithVolc(text, targetLanguage);

    res.json({
      success: true,
      originalText: text,
      translatedText: translatedText
    });

  } catch (error) {
    console.error('翻译API错误:', error);
    res.status(500).json({ error: '服务器内部错误', details: error.message });
  }
});

function setupWebSocket(app) {
  app.ws('/ws/voice-translation', (clientWs, req) => {
    console.log('[VT] 新的语音翻译WebSocket连接');

    let localASR = null;
    let recognizedText = '';
    let recognizedSentences = [];
    let targetLanguage = 'zh';
    let translateTimer = null;
    let lastTranslatedText = '';
    let isRecognizing = false;

    const sendToClient = (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(data));
      }
    };

    const doRealtimeTranslate = (text) => {
      if (!text || text === lastTranslatedText) return;
      lastTranslatedText = text;
      const translateFn = USE_LOCAL_TRANSLATE ? translateTextWithLocal : translateTextWithVolc;
      translateFn(text, targetLanguage)
        .then(translatedText => {
          sendToClient({
            type: 'translate',
            text: translatedText,
            isFinal: false,
            isPreview: true
          });
        })
        .catch(err => {
          console.error('[VT] 实时预览翻译失败:', err.message);
        });
    };

    const scheduleTranslate = (text) => {
      if (translateTimer) clearTimeout(translateTimer);
      translateTimer = setTimeout(() => {
        doRealtimeTranslate(text);
      }, 300);
    };

    const commitSentence = (text) => {
      if (!text || !text.trim()) return;
      const trimmed = text.trim();
      if (recognizedSentences.length > 0 && recognizedSentences[recognizedSentences.length - 1] === trimmed) return;
      recognizedSentences.push(trimmed);
      console.log('[VT] 句子完成: "%s"', trimmed);
      sendToClient({ type: 'sentence', text: trimmed });

      const translateFn = USE_LOCAL_TRANSLATE ? translateTextWithLocal : translateTextWithVolc;
      translateFn(trimmed, targetLanguage)
        .then(translatedText => {
          console.log('[VT] 句子翻译: "%s" -> "%s"', trimmed.substring(0, 30), translatedText.substring(0, 30));
          sendToClient({
            type: 'translate',
            text: translatedText,
            isFinal: false,
            isPreview: false
          });
        })
        .catch(err => {
          console.error('[VT] 句子翻译失败:', err.message);
        });
    };

    const processAudio = (audioBuffer) => {
      if (!localASR) {
        console.log('[VT] 本地ASR未初始化');
        return;
      }

      const result = localASR.feedAudio(audioBuffer);
      
      if (result) {
        if (result.isEndpoint && recognizedText.trim()) {
          commitSentence(recognizedText);
          recognizedText = '';
          return;
        }

        if (result.text && result.text !== recognizedText) {
          recognizedText = result.text;
          console.log('[VT] 本地识别文本: "%s"', recognizedText.substring(0, 50));

          sendToClient({
            type: 'recognize',
            text: recognizedText,
            isEndpoint: false
          });

          if (recognizedText.trim()) {
            scheduleTranslate(recognizedText);
          }
        }
      }
    };

    const finishRecognition = () => {
      console.log('[VT] 识别完成');

      if (translateTimer) {
        clearTimeout(translateTimer);
        translateTimer = null;
      }

      if (recognizedText.trim()) {
        commitSentence(recognizedText);
        recognizedText = '';
      }

      const allText = recognizedSentences.join('，');
      if (allText) {
        const translateFn = USE_LOCAL_TRANSLATE ? translateTextWithLocal : translateTextWithVolc;
        translateFn(allText, targetLanguage)
          .then(translatedText => {
            console.log('[VT] 最终翻译: "%s"', translatedText);
            sendToClient({
              type: 'translate',
              text: translatedText,
              isFinal: true
            });
          })
          .catch(err => {
            console.error('[VT] 最终翻译失败:', err.message);
            sendToClient({
              type: 'error',
              message: '翻译失败: ' + err.message
            });
          });
      } else {
        sendToClient({
          type: 'translate',
          text: '',
          isFinal: true
        });
      }

      if (localASR) {
        localASR.destroyStream();
      }
      isRecognizing = false;
    };

    const initLocalASR = async () => {
      try {
        console.log('[VT] 初始化本地ASR...');
        localASR = await getASRInstance();
        
        if (!localASR.isInitialized) {
          const success = await localASR.init();
          if (!success) {
            throw new Error('本地ASR初始化失败');
          }
        }
        
        localASR.createStream();
        isRecognizing = true;
        
        console.log('[VT] 本地ASR已就绪');
        sendToClient({ type: 'connected' });
        
      } catch (error) {
        console.error('[VT] 本地ASR初始化错误:', error.message);
        sendToClient({
          type: 'error',
          message: '本地ASR初始化错误: ' + error.message
        });
      }
    };

    clientWs.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);

        switch (data.type) {
          case 'start':
            console.log('[VT] 开始实时语音识别, 目标语言:', data.targetLanguage);
            targetLanguage = data.targetLanguage || 'zh';
            recognizedText = '';
            recognizedSentences = [];
            lastTranslatedText = '';
            if (translateTimer) {
              clearTimeout(translateTimer);
              translateTimer = null;
            }
            initLocalASR();
            break;

          case 'audio':
            if (data.data && isRecognizing) {
              const audioBuffer = Buffer.from(data.data, 'base64');
              processAudio(audioBuffer);
            }
            break;

          case 'stop':
            console.log('[VT] 停止录音');
            finishRecognition();
            break;

          default:
            console.log('[VT] 未知消息类型:', data.type);
        }
      } catch (e) {
        console.error('[VT] 处理客户端消息失败:', e.message);
      }
    });

    clientWs.on('close', () => {
      console.log('[VT] 客户端WebSocket连接关闭');
      if (localASR) {
        localASR.destroyStream();
      }
      isRecognizing = false;
    });

    clientWs.on('error', (error) => {
      console.error('[VT] 客户端WebSocket错误:', error.message);
      if (localASR) {
        localASR.destroyStream();
      }
      isRecognizing = false;
    });
  });
}

console.log('语音翻译路由加载成功');
module.exports = { router, setupWebSocket };
