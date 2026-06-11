const path = require('path');
const sherpa = require('sherpa-onnx');

class LocalASR {
  constructor() {
    this.recognizer = null;
    this.stream = null;
    this.isInitialized = false;
    this.lastText = '';
  }

  async init() {
    try {
      console.log('[LocalASR] 正在初始化本地ASR模型...');
      
      const modelDir = path.join(__dirname, '../k2transducer-zipformer-large-zh-onnx-online-yuekai-20250630');
      
      const config = {
        featConfig: {
          sampleRate: 16000,
          featureDim: 80
        },
        modelConfig: {
          transducer: {
            encoder: path.join(modelDir, 'encoder.int8.onnx'),
            decoder: path.join(modelDir, 'decoder.onnx'),
            joiner: path.join(modelDir, 'joiner.int8.onnx')
          },
          tokens: path.join(modelDir, 'tokens.txt'),
          numThreads: 1,
          provider: 'cpu',
          debug: 0
        },
        decodingMethod: 'greedy_search',
        maxActivePaths: 4,
        enableEndpoint: 1,
        rule1MinTrailingSilence: 3.0,
        rule2MinTrailingSilence: 3.0,
        rule3MinUtteranceLength: 2.0
      };

      this.recognizer = sherpa.createOnlineRecognizer(config);
      this.isInitialized = true;
      console.log('[LocalASR] 本地ASR模型初始化成功');
      return true;
    } catch (error) {
      console.error('[LocalASR] 初始化失败:', error.message);
      console.error('[LocalASR] 错误堆栈:', error.stack);
      return false;
    }
  }

  createStream() {
    if (!this.recognizer) {
      console.error('[LocalASR] 识别器未初始化');
      return null;
    }
    this.stream = this.recognizer.createStream();
    this.lastText = '';
    return this.stream;
  }

  feedAudio(audioBuffer) {
    if (!this.stream) {
      console.error('[LocalASR] 流未创建');
      return null;
    }

    const samples = new Float32Array(audioBuffer.length / 2);
    for (let i = 0; i < samples.length; i++) {
      const val = audioBuffer.readInt16LE(i * 2);
      samples[i] = val / 32768.0;
    }

    this.stream.acceptWaveform(16000, samples);
    return this.decode();
  }

  decode() {
    if (!this.stream || !this.recognizer) {
      return null;
    }

    while (this.recognizer.isReady(this.stream)) {
      this.recognizer.decode(this.stream);
    }

    const result = this.recognizer.getResult(this.stream);
    const isEndpoint = this.recognizer.isEndpoint(this.stream);

    if (isEndpoint) {
      this.recognizer.reset(this.stream);
    }

    if (result.text !== this.lastText) {
      this.lastText = result.text;

      return {
        text: result.text,
        isEndpoint: isEndpoint
      };
    }

    return {
      text: this.lastText,
      isEndpoint: isEndpoint,
      isSame: true
    };
  }

  resetStream() {
    if (this.stream && this.recognizer) {
      this.recognizer.reset(this.stream);
    }
    this.lastText = '';
  }

  destroyStream() {
    this.stream = null;
    this.lastText = '';
  }

  getLastText() {
    return this.lastText;
  }
}

let asrInstance = null;

const getASRInstance = async () => {
  if (!asrInstance) {
    asrInstance = new LocalASR();
    await asrInstance.init();
  }
  return asrInstance;
};

module.exports = { LocalASR, getASRInstance };
