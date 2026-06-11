import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './VoiceTranslation.css';

const VoiceTranslation = () => {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws/voice-translation';

  const [isRecording, setIsRecording] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [currentTranscription, setCurrentTranscription] = useState('');
  const [currentTranslation, setCurrentTranslation] = useState('');
  const [completedSentences, setCompletedSentences] = useState([]);
  const [translatedSentences, setTranslatedSentences] = useState([]);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [noVoiceDetected, setNoVoiceDetected] = useState(false);
  const [history, setHistory] = useState([]);
  const [audioLevel, setAudioLevel] = useState(0);

  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const pcmBufferRef = useRef([]);
  const voiceDetectionIntervalRef = useRef(null);
  const silenceStartRef = useRef(null);
  const sendIntervalRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const historyEndRef = useRef(null);
  const completedSentencesRef = useRef([]);
  const translatedSentencesRef = useRef([]);
  const currentTranslationRef = useRef('');
  const resampleRatioRef = useRef(1);

  const languageOptions = [
    { value: 'auto', label: '自动检测' },
    { value: 'zh', label: '中文' },
    { value: 'en', label: '英语' },
    { value: 'ja', label: '日语' },
    { value: 'ko', label: '韩语' },
    { value: 'fr', label: '法语' },
    { value: 'de', label: '德语' }
  ];

  const float32ToInt16 = (float32Array) => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  };

  const resampleTo16k = (float32Array, inputSampleRate) => {
    if (inputSampleRate === 16000) return float32ToInt16(float32Array);

    const ratio = inputSampleRate / 16000;
    const outputLength = Math.round(float32Array.length / ratio);
    const result = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, float32Array.length - 1);
      const fraction = srcIndex - srcIndexFloor;
      result[i] = float32Array[srcIndexFloor] * (1 - fraction) + float32Array[srcIndexCeil] * fraction;
    }

    return float32ToInt16(result);
  };

  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  };

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#00d2ff');
    gradient.addColorStop(0.5, '#7b2ff7');
    gradient.addColorStop(1, '#ff0080');

    ctx.lineWidth = 2;
    ctx.strokeStyle = gradient;
    ctx.beginPath();

    const sliceWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }

    ctx.lineTo(width, height / 2);
    ctx.stroke();

    let sum = 0;
    const freqData = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(freqData);
    for (let i = 0; i < freqData.length; i++) sum += freqData[i];
    setAudioLevel(sum / freqData.length / 255);

    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  const stopVoiceDetection = useCallback(() => {
    if (voiceDetectionIntervalRef.current) {
      clearInterval(voiceDetectionIntervalRef.current);
      voiceDetectionIntervalRef.current = null;
    }
  }, []);

  const flushPcmBuffer = useCallback(() => {
    if (pcmBufferRef.current.length === 0) return;

    const chunks = pcmBufferRef.current;
    pcmBufferRef.current = [];

    const totalLength = chunks.reduce((acc, arr) => acc + arr.length, 0);
    const merged = new Int16Array(totalLength);
    let offset = 0;
    for (const arr of chunks) {
      merged.set(arr, offset);
      offset += arr.length;
    }

    const base64 = arrayBufferToBase64(merged.buffer);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'audio',
        data: base64
      }));
    }
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      setCurrentTranscription('');
      setCurrentTranslation('');
      setCompletedSentences([]);
      setTranslatedSentences([]);
      setNoVoiceDetected(false);
      setAudioLevel(0);
      pcmBufferRef.current = [];
      completedSentencesRef.current = [];
      translatedSentencesRef.current = [];
      currentTranslationRef.current = '';
      silenceStartRef.current = null;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('您的浏览器不支持麦克风访问');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const actualSampleRate = audioContext.sampleRate;
      console.log('AudioContext实际采样率:', actualSampleRate);
      resampleRatioRef.current = actualSampleRate / 16000;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      scriptProcessor.onaudioprocess = (e) => {
        const float32Data = e.inputBuffer.getChannelData(0);
        const int16Data = resampleTo16k(float32Data, actualSampleRate);
        pcmBufferRef.current.push(new Int16Array(int16Data));
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = canvas.offsetWidth * 2;
        canvas.height = canvas.offsetHeight * 2;
      }
      animFrameRef.current = requestAnimationFrame(drawWaveform);

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket连接已建立');
        ws.send(JSON.stringify({
          type: 'start',
          targetLanguage: targetLanguage
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'connected':
              console.log('本地ASR已就绪');
              setIsConnected(true);
              setIsRecording(true);
              break;

            case 'recognize':
              console.log('实时识别:', data.text, 'isEndpoint:', data.isEndpoint);
              if (data.text) {
                setCurrentTranscription(data.text);
              }
              break;

            case 'sentence':
              console.log('句子完成:', data.text);
              if (data.text) {
                completedSentencesRef.current = [...completedSentencesRef.current, data.text];
                setCompletedSentences([...completedSentencesRef.current]);
              }
              break;

            case 'translate':
              console.log('翻译结果:', data.text, 'isFinal:', data.isFinal, 'isPreview:', data.isPreview);
              if (data.isFinal) {
                const finalTranslation = data.text || currentTranslationRef.current;
                setCurrentTranslation(finalTranslation);
                currentTranslationRef.current = finalTranslation;

                const allSentences = completedSentencesRef.current;
                const finalTranscription = allSentences.length > 0
                  ? allSentences.join('，')
                  : currentTranscription;

                if (finalTranscription) {
                  setHistory(prev => [...prev, {
                    id: Date.now(),
                    transcription: finalTranscription,
                    translation: finalTranslation,
                    timestamp: new Date().toLocaleTimeString()
                  }]);
                }

                setIsRecording(false);
              } else if (data.isPreview) {
                setCurrentTranslation(data.text);
                currentTranslationRef.current = data.text;
              } else {
                setCurrentTranslation(data.text);
                currentTranslationRef.current = data.text;
                setTranslatedSentences([]);
                translatedSentencesRef.current = [];
              }
              break;

            case 'error':
              console.error('服务端错误:', data.message);
              setError(data.message);
              setIsRecording(false);
              break;

            default:
              break;
          }
        } catch (e) {
          console.error('解析WebSocket消息失败:', e);
        }
      };

      ws.onerror = (e) => {
        console.error('WebSocket错误:', e);
        setError('WebSocket连接失败');
        setIsRecording(false);
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('WebSocket连接关闭');
        setIsConnected(false);
      };

      sendIntervalRef.current = setInterval(() => {
        flushPcmBuffer();
      }, 200);

      voiceDetectionIntervalRef.current = setInterval(() => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const average = sum / dataArray.length;
          const isSilent = average <= 30;

          if (isSilent) {
            if (!silenceStartRef.current) {
              silenceStartRef.current = Date.now();
            }
            const elapsed = Math.floor((Date.now() - silenceStartRef.current) / 1000);
            if (elapsed >= 5) {
              setNoVoiceDetected(true);
            }
          } else {
            silenceStartRef.current = null;
            setNoVoiceDetected(false);
          }
        }
      }, 200);

    } catch (error) {
      console.error('开始录音失败:', error);
      setError(`开始录音失败: ${error.message}`);
      setIsRecording(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const stopRecording = () => {
    console.log('停止录音');

    stopVoiceDetection();

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }

    flushPcmBuffer();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
    setIsConnected(false);
    setAudioLevel(0);
  };

  useEffect(() => {
    return () => {
      stopVoiceDetection();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
      if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
      if (audioContextRef.current) audioContextRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      if (wsRef.current) wsRef.current.close();
    };
  }, [stopVoiceDetection, drawWaveform]);

  useEffect(() => {
    if (historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history]);

  return (
    <div className="voice-translation">
      <div className="vt-header">
        <h2>实时语音翻译</h2>
        <div className="vt-status-bar">
          <span className={`vt-status-dot ${isConnected ? 'connected' : isRecording ? 'connecting' : 'disconnected'}`} />
          <span className="vt-status-text">
            {isConnected ? '已连接' : isRecording ? '连接中...' : '未连接'}
          </span>
        </div>
      </div>

      <div className="vt-language-row">
        <div className="vt-lang-group">
          <label>源语言</label>
          <select value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value)} disabled={isRecording}>
            {languageOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="vt-lang-arrow">→</div>
        <div className="vt-lang-group">
          <label>目标语言</label>
          <select value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)} disabled={isRecording}>
            {languageOptions.filter(o => o.value !== 'auto').map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={`vt-waveform-container${isRecording ? ' recording' : ''}`}>
        <canvas ref={canvasRef} className="vt-waveform-canvas" />
        {!isRecording && (
          <div className="vt-waveform-placeholder">
            <span className="vt-placeholder-icon">🎤</span>
            点击下方按钮开始录音
          </div>
        )}
      </div>

      <div className="vt-controls">
        {!isRecording ? (
          <button className="vt-btn vt-btn-start" onClick={startRecording}>
            <span className="vt-btn-icon">🎙</span>
            <span>开始录音</span>
          </button>
        ) : (
          <button className="vt-btn vt-btn-stop" onClick={stopRecording}>
            <span className="vt-btn-icon vt-pulse">⏹</span>
            <span>停止录音</span>
          </button>
        )}
      </div>

      {noVoiceDetected && isRecording && createPortal(
        <div className="vt-toast-overlay">
          <div className="vt-toast">
            <span className="vt-toast-icon">🔇</span>
            <span className="vt-toast-text">未检测到语音，请尝试说话</span>
          </div>
        </div>,
        document.body
      )}

      {(currentTranscription || currentTranslation || completedSentences.length > 0 || translatedSentences.length > 0 || isRecording) && (
        <div className="vt-realtime-panel">
          <div className="vt-realtime-section">
            <div className="vt-realtime-label">
              <span className="vt-label-dot recognize" />
              实时识别
            </div>
            <div className="vt-realtime-text">
              {completedSentences.length > 0 && (
                <div className="vt-sentence-list">
                  {completedSentences.map((s, i) => (
                    <div key={i} className="vt-sentence-item">{s}</div>
                  ))}
                </div>
              )}
              <div className="vt-current-sentence">
                {currentTranscription || (completedSentences.length === 0 ? '等待语音...' : '')}
                {isRecording && <span className="vt-cursor" />}
              </div>
            </div>
          </div>
          <div className="vt-realtime-divider" />
          <div className="vt-realtime-section">
            <div className="vt-realtime-label">
              <span className="vt-label-dot translate" />
              实时翻译
              {isRecording && !currentTranslation && (
                <span className="vt-translating-hint">翻译中...</span>
              )}
            </div>
            <div className="vt-realtime-text vt-translation-text">
              {translatedSentences.length > 0 && (
                <div className="vt-sentence-list">
                  {translatedSentences.map((s, i) => (
                    <div key={i} className="vt-sentence-item">{s}</div>
                  ))}
                </div>
              )}
              <div className="vt-current-sentence vt-translation-text">
                {currentTranslation || (translatedSentences.length === 0 ? '等待翻译...' : '')}
                {isRecording && <span className="vt-cursor" />}
              </div>
            </div>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="vt-history">
          <h3>翻译记录</h3>
          <div className="vt-history-list">
            {history.map((item) => (
              <div key={item.id} className="vt-history-item">
                <div className="vt-history-time">{item.timestamp}</div>
                <div className="vt-history-content">
                  <div className="vt-history-transcription">
                    <span className="vt-label-dot recognize" />
                    {item.transcription}
                  </div>
                  {item.translation && (
                    <div className="vt-history-translation">
                      <span className="vt-label-dot translate" />
                      {item.translation}
                    </div>
                  )}
                  {!item.translation && (
                    <div className="vt-history-translation vt-waiting">
                      翻译中...
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={historyEndRef} />
          </div>
        </div>
      )}

      {error && (
        <div className="vt-error">⚠️ {error}</div>
      )}
    </div>
  );
};

export default VoiceTranslation;
