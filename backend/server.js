const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const FormData = require('form-data');
const http = require('http');
const WebSocket = require('ws');
const expressWs = require('express-ws');
const { AsyncLocalStorage } = require('node:async_hooks');
const crypto = require('node:crypto');
const db = require('./db');
const fonts = require('./fonts');
const settings = require('./settings');
require('dotenv').config();

// 任务队列系统
class TaskQueue {
  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
    this.queue = [];
    this.running = 0;
  }

  // 设置最大并发数
  setMaxConcurrent(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    console.log(`更新最大并发数为: ${maxConcurrent}`);
    // 重新处理队列
    this.processQueue();
  }

  addTask(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const { task, resolve, reject } = this.queue.shift();
    this.running++;

    // 增强的错误隔离机制
    try {
      // 使用Promise.resolve包装，确保即使task不是Promise也能正确处理
      const result = await Promise.resolve(task());
      resolve(result);
    } catch (error) {
      console.error('任务处理失败:', error.message);
      // 确保即使任务失败也能正确reject，不会影响其他任务
      try {
        reject(error);
      } catch (rejectError) {
        console.error('任务reject失败:', rejectError.message);
      }
    } finally {
      // 确保无论如何都会减少running计数并继续处理队列
      try {
        this.running--;
        this.processQueue();
      } catch (finallyError) {
        console.error('处理队列时发生错误:', finallyError.message);
        // 即使发生错误，也要确保running计数正确
        if (this.running > 0) {
          this.running--;
        }
        // 尝试重新处理队列
        setTimeout(() => {
          try {
            this.processQueue();
          } catch (retryError) {
            console.error('重新处理队列失败:', retryError.message);
          }
        }, 1000);
      }
    }
  }

  getQueueSize() {
    return this.queue.length;
  }

  getRunningCount() {
    return this.running;
  }

  getMaxConcurrent() {
    return this.maxConcurrent;
  }
}

// 系统资源监控和管理
class ResourceManager {
  constructor() {
    this.cpuThreshold = 80; // CPU使用率阈值
    this.memoryThreshold = 80; // 内存使用率阈值
    this.minConcurrent = 1; // 最小并发数
    this.maxConcurrent = 4; // 最大并发数
  }

  // 获取系统资源使用情况
  getSystemStats() {
    const os = require('os');
    const cpus = os.cpus();
    
    // 计算CPU使用率
    const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const totalTicks = cpus.reduce((acc, cpu) => {
      let total = 0;
      for (const type in cpu.times) {
        total += cpu.times[type];
      }
      return acc + total;
    }, 0);
    const cpuUsage = 100 - (totalIdle / totalTicks * 100);
    
    // 计算内存使用率
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryUsage = ((totalMemory - freeMemory) / totalMemory) * 100;
    
    return {
      cpuUsage: Math.round(cpuUsage * 10) / 10,
      memoryUsage: Math.round(memoryUsage * 10) / 10,
      totalMemory: Math.round(totalMemory / 1024 / 1024), // MB
      freeMemory: Math.round(freeMemory / 1024 / 1024), // MB
      uptime: os.uptime(),
      loadavg: os.loadavg()
    };
  }

  // 根据系统负载动态调整并发数
  getOptimalConcurrent() {
    const stats = this.getSystemStats();
    
    // 基于CPU和内存使用率计算并发数
    const loadFactor = (stats.cpuUsage + stats.memoryUsage) / 2;
    
    if (loadFactor > this.cpuThreshold) {
      return this.minConcurrent;
    } else if (loadFactor > this.cpuThreshold * 0.75) {
      return Math.ceil(this.maxConcurrent * 0.5);
    } else if (loadFactor > this.cpuThreshold * 0.5) {
      return Math.ceil(this.maxConcurrent * 0.75);
    } else {
      return this.maxConcurrent;
    }
  }
}

// 监控系统
class MonitoringSystem {
  constructor() {
    this.requestStats = {
      total: 0,
      success: 0,
      failed: 0,
      totalTime: 0,
      averageTime: 0,
      lastRequests: [] // 最近的请求记录
    };
  }

  // 记录请求开始
  startRequest() {
    return {
      startTime: Date.now(),
      id: Date.now() + Math.random().toString(36).substr(2, 9)
    };
  }

  // 记录请求结束
  endRequest(requestData, success, error = null) {
    const endTime = Date.now();
    const duration = endTime - requestData.startTime;
    
    // 更新统计数据
    this.requestStats.total++;
    if (success) {
      this.requestStats.success++;
    } else {
      this.requestStats.failed++;
    }
    this.requestStats.totalTime += duration;
    this.requestStats.averageTime = this.requestStats.totalTime / this.requestStats.total;
    
    // 记录最近的请求
    this.requestStats.lastRequests.push({
      id: requestData.id,
      duration,
      success,
      error: error ? error.message : null,
      timestamp: new Date().toISOString()
    });
    
    // 只保留最近100条记录
    if (this.requestStats.lastRequests.length > 100) {
      this.requestStats.lastRequests.shift();
    }
    
    // 计算成功率
    const successRate = (this.requestStats.success / this.requestStats.total) * 100;
    
    console.log(`请求处理完成: ID=${requestData.id}, 耗时=${duration}ms, 成功=${success}, 成功率=${successRate.toFixed(2)}%`);
  }

  // 获取监控统计数据
  getStats() {
    const successRate = this.requestStats.total > 0 ? (this.requestStats.success / this.requestStats.total) * 100 : 0;
    return {
      ...this.requestStats,
      successRate: Math.round(successRate * 10) / 10
    };
  }

  // 定期输出监控报告
  generateReport() {
    const stats = this.getStats();
    console.log('=== 监控报告 ===');
    console.log(`总请求数: ${stats.total}`);
    console.log(`成功请求: ${stats.success}`);
    console.log(`失败请求: ${stats.failed}`);
    console.log(`成功率: ${stats.successRate}%`);
    console.log(`平均处理时间: ${Math.round(stats.averageTime)}ms`);
    console.log(`最近10条请求:`);
    stats.lastRequests.slice(-10).forEach(req => {
      console.log(`  ID: ${req.id}, 耗时: ${req.duration}ms, 成功: ${req.success}, 错误: ${req.error}`);
    });
    console.log('================');
  }
}

// 文件管理器
class FileManager {
  constructor() {
    // 检查是否在WSL环境中运行
    this.isWSL = process.platform === 'linux' && fs.existsSync('/proc/version') && fs.readFileSync('/proc/version', 'utf8').includes('Microsoft');
    
    // 在WSL中使用Linux格式的临时目录
    if (this.isWSL) {
      this.tempDir = path.join('/tmp', 'video-translation-uploads');
    } else {
      this.tempDir = path.join(os.tmpdir(), 'video-translation-uploads');
    }
    
    this.maxFileAge = 24 * 60 * 60 * 1000; // 24小时
    this.maxDirectorySize = 1024 * 1024 * 1024; // 1GB
    
    console.log(`文件管理器初始化，临时目录: ${this.tempDir}, 是否WSL: ${this.isWSL}`);
  }

  // 确保临时目录存在
  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      try {
        fs.mkdirSync(this.tempDir, { recursive: true });
        console.log(`创建临时目录成功: ${this.tempDir}`);
      } catch (error) {
        console.error(`创建临时目录失败: ${error.message}`);
        // 如果创建失败，尝试使用当前目录作为临时目录
        this.tempDir = path.join(process.cwd(), 'temp');
        fs.mkdirSync(this.tempDir, { recursive: true });
        console.log(`使用备选临时目录: ${this.tempDir}`);
      }
    }
  }

  // 获取临时文件路径
  getTempFilePath(filename) {
    this.ensureTempDir();
    const filePath = path.join(this.tempDir, filename);
    console.log(`生成临时文件路径: ${filePath}`);
    return filePath;
  }

  // 清理过期文件
  cleanupExpiredFiles() {
    try {
      this.ensureTempDir();
      const files = fs.readdirSync(this.tempDir);
      const now = Date.now();
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stat = fs.statSync(filePath);
        
        // 检查文件是否过期
        if (now - stat.mtimeMs > this.maxFileAge) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`清理了 ${deletedCount} 个过期文件`);
      }
    } catch (error) {
      console.error('清理过期文件失败:', error.message);
    }
  }

  // 清理目录，确保不超过最大大小
  cleanupDirectorySize() {
    try {
      this.ensureTempDir();
      const files = fs.readdirSync(this.tempDir);
      let totalSize = 0;
      const fileStats = [];

      // 计算总大小并收集文件信息
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stat = fs.statSync(filePath);
        totalSize += stat.size;
        fileStats.push({ path: filePath, size: stat.size, mtime: stat.mtimeMs });
      }

      // 如果超过最大大小，删除最旧的文件
      if (totalSize > this.maxDirectorySize) {
        // 按修改时间排序，最旧的在前
        fileStats.sort((a, b) => a.mtime - b.mtime);
        
        let deletedSize = 0;
        let deletedCount = 0;

        for (const fileStat of fileStats) {
          if (totalSize - deletedSize <= this.maxDirectorySize * 0.8) { // 留20%的缓冲
            break;
          }
          
          fs.unlinkSync(fileStat.path);
          deletedSize += fileStat.size;
          deletedCount++;
        }

        console.log(`清理了 ${deletedCount} 个文件，释放了 ${(deletedSize / 1024 / 1024).toFixed(2)} MB 空间`);
      }
    } catch (error) {
      console.error('清理目录大小失败:', error.message);
    }
  }

  // 清理所有临时文件
  cleanupAllFiles() {
    try {
      this.ensureTempDir();
      const files = fs.readdirSync(this.tempDir);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        fs.unlinkSync(filePath);
        deletedCount++;
      }

      console.log(`清理了 ${deletedCount} 个临时文件`);
    } catch (error) {
      console.error('清理所有临时文件失败:', error.message);
    }
  }

  // 获取目录使用情况
  getDirectoryUsage() {
    try {
      this.ensureTempDir();
      const files = fs.readdirSync(this.tempDir);
      let totalSize = 0;
      const fileCount = files.length;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stat = fs.statSync(filePath);
        totalSize += stat.size;
      }

      return {
        fileCount,
        totalSize: totalSize / 1024 / 1024, // MB
        maxSize: this.maxDirectorySize / 1024 / 1024, // MB
        usagePercent: (totalSize / this.maxDirectorySize) * 100
      };
    } catch (error) {
      console.error('获取目录使用情况失败:', error.message);
      return { fileCount: 0, totalSize: 0, maxSize: this.maxDirectorySize / 1024 / 1024, usagePercent: 0 };
    }
  }
}

// 创建文件管理器实例
const fileManager = new FileManager();

// 安全删除文件（带重试，避免EBUSY）
const safeUnlink = async (filePath, retries = 3, delayMs = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return true;
    } catch (err) {
      if (err.code === 'EBUSY' && i < retries - 1) {
        console.log(`文件被占用，${delayMs}ms后重试 (${i + 1}/${retries}): ${filePath}`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        console.warn(`删除文件失败: ${filePath}`, err.message);
        return false;
      }
    }
  }
  return false;
};

// 定期清理过期文件
setInterval(() => {
  fileManager.cleanupExpiredFiles();
  fileManager.cleanupDirectorySize();
  const usage = fileManager.getDirectoryUsage();
  console.log('临时目录使用情况:', usage);
}, 3600000); // 每小时清理一次

// 创建监控系统实例
const monitoringSystem = new MonitoringSystem();

// 定期生成监控报告
setInterval(() => {
  monitoringSystem.generateReport();
}, 60000); // 每分钟生成一次报告

// 创建资源管理器实例
const resourceManager = new ResourceManager();

// 定期监控系统资源并动态调整并发数
setInterval(() => {
  const stats = resourceManager.getSystemStats();
  console.log('系统资源使用情况:', stats);
  
  // 动态调整并发数
  const optimalConcurrent = resourceManager.getOptimalConcurrent();
  if (optimalConcurrent !== taskQueue.getMaxConcurrent()) {
    taskQueue.setMaxConcurrent(optimalConcurrent);
  }
}, 30000); // 每30秒监控一次

// 创建任务队列实例
const taskQueue = new TaskQueue(2); // 初始并发数

// API密钥配置（从环境变量读取）
let VOLC_API_KEY = ''; // 火山引擎API密钥
let DOUBAO_API_KEY = ''; // 豆包大模型API密钥
let VOLC_APP_ID = ''; // 火山引擎APP ID
let VOLC_ACCESS_TOKEN = ''; // 火山引擎访问令牌
let DOUBAO_MODEL = 'doubao-seed-2-0-pro-260215'; // 豆包模型名称
let TRANSLATION_PROVIDER = 'doubao';
let OPENAI_BASE_URL = '';
let OPENAI_API_KEY = '';
let OPENAI_MODEL = '';
const TRANSLATION_PRESETS = {
  qwen: { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', label: '千问（DashScope 兼容）' },
  deepseek: { base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', label: 'DeepSeek' },
  openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', label: 'OpenAI' },
  iflytek: { base: 'https://spark-api-open.xf-yun.com/v1', model: 'generalv3.5', label: '讯飞星火（HTTP 兼容）' }
};

function refreshCredentials() {
  VOLC_API_KEY = settings.get('volcApiKey');
  DOUBAO_API_KEY = settings.get('doubaoApiKey');
  VOLC_APP_ID = settings.get('volcAppId');
  VOLC_ACCESS_TOKEN = settings.get('volcAccessToken');
  DOUBAO_MODEL = settings.get('doubaoModel') || 'doubao-seed-2-0-pro-260215';
  TRANSLATION_PROVIDER = settings.get('translationProvider') || 'doubao';
  OPENAI_BASE_URL = settings.get('openaiBaseUrl');
  OPENAI_API_KEY = settings.get('openaiApiKey');
  OPENAI_MODEL = settings.get('openaiModel');
}
refreshCredentials();

// 配置验证
function validateConfig() {
  const requiredEnvVars = ['VOLC_API_KEY', 'VOLC_APP_ID', 'VOLC_ACCESS_TOKEN'];
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    console.error('❌ 缺少必需的环境变量:', missingEnvVars.join(', '));
    console.error('请在 .env 文件中配置这些变量，参考 .env.example');
    process.exit(1);
  }
  
  if (!process.env.DOUBAO_API_KEY) {
    console.warn('⚠️ 缺少豆包API密钥，部分功能可能不可用');
  }
  
  console.log('✅ 配置验证通过');
  console.log(`运行环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`服务端口: ${process.env.PORT || 3001}`);
}

// 执行配置验证
validateConfig();

// 尝试设置FFmpeg路径
const possibleFfmpegPaths = [
  'C:\\ffmpeg-8.1-full_build\\bin\\ffmpeg.exe', // 用户解压的位置
  'C:\\ffmpeg\\bin\\ffmpeg.exe',
  'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
  'C:\\Users\\AAA\\Downloads\\ffmpeg-8.1-full_build\\bin\\ffmpeg.exe',
  'C:\\Users\\AAA\\Downloads\\ffmpeg-8.1-full_build (1)\\bin\\ffmpeg.exe',
  'C:\\Users\\AAA\\Desktop\\ffmpeg\\bin\\ffmpeg.exe',
  'ffmpeg' // 默认使用系统PATH
];

let ffmpegPath = null;
let ffmpegFound = false;
for (const possiblePath of possibleFfmpegPaths) {
  try {
    if (possiblePath === 'ffmpeg') {
      // 尝试使用系统PATH中的ffmpeg
      ffmpeg.setFfmpegPath('ffmpeg');
      ffmpegPath = 'ffmpeg';
      ffmpegFound = true;
      console.log('使用系统PATH中的FFmpeg');
      break;
    }
    if (fs.existsSync(possiblePath)) {
      ffmpeg.setFfmpegPath(possiblePath);
      ffmpegPath = possiblePath;
      ffmpegFound = true;
      console.log(`找到FFmpeg: ${possiblePath}`);
      break;
    }
  } catch (err) {
    // 继续尝试下一个路径
  }
}

if (!ffmpegFound) {
  console.warn('警告: 未找到FFmpeg，视频处理功能可能无法正常工作');
  console.warn('请确保FFmpeg已正确安装并添加到系统PATH中，或放置在以下位置之一:');
  possibleFfmpegPaths.forEach(p => console.warn(`  - ${p}`));
} else {
  console.log(`FFmpeg路径已设置: ${ffmpegPath}`);
}

const app = express();
const port = process.env.PORT || 3001;

// 创建HTTP服务器（必须在expressWs之前）
const server = http.createServer(app);

// 添加WebSocket支持，传入server让express-ws绑定升级处理器
const wsInstance = expressWs(app, server);

// 使用express-ws的WebSocket服务器
const wss = wsInstance.getWss();

// 存储所有活动的WebSocket连接
const clients = new Set();

// 当前任务上下文：让 sendProgress 在不改动各调用点的情况下拿到 jobId
const jobContext = new AsyncLocalStorage();
// 已请求取消的任务
const cancelledJobs = new Set();
const renderingJobs = new Set();

function currentJobId() {
  const store = jobContext.getStore();
  return store ? store.jobId : null;
}

function throwIfCancelled() {
  const jobId = currentJobId();
  if (jobId && cancelledJobs.has(jobId)) {
    const error = new Error('任务已取消');
    error.code = 'JOB_CANCELLED';
    throw error;
  }
}

// 通过 express-ws 注册进度推送 WebSocket 路由
app.ws('/ws/progress', (ws, req) => {
  console.log('新的进度WebSocket连接');
  clients.add(ws);

  ws.on('close', () => {
    console.log('进度WebSocket连接关闭');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('进度WebSocket错误:', error);
    clients.delete(ws);
  });
});

// 发送进度信息给所有客户端（带 jobId，前端按任务过滤），并写入数据库
function sendProgress(step, progress, message) {
  const jobId = currentJobId();
  if (jobId) {
    try {
      db.updateJob(jobId, {
        progress: Math.max(0, Math.min(100, Math.round(progress))),
        currentStep: step,
      });
    } catch (error) {
      console.error('写入任务进度失败:', error.message);
    }
  }

  const data = JSON.stringify({ type: 'progress', jobId, step, progress, message });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

app.use(cors({
  origin: '*' // 允许所有来源；本服务不使用 Cookie，故不开启 credentials
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 提供前端静态文件
app.use(express.static('../dist'));

// 火山引擎API配置（API密钥已在顶部定义）
const VOLC_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3';

// 配置文件上传
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(os.tmpdir(), 'video-translation-uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  // 限制单文件大小与数量，避免超大文件打满磁盘
  limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('video/')) {
      return cb(null, true);
    }
    const error = new Error('仅支持视频文件（video/*）');
    error.status = 400;
    cb(error);
  }
});

// ---------- 字幕样式与字体 ----------
function normalizeStyle(input) {
  const style = input || {};
  const family = String(style.fontFamily || style.fontName || 'SimHei').slice(0, 80);
  return {
    fontFamily: family,
    fontSize: Math.min(Math.max(Number(style.fontSize) || 24, 8), 120),
    position: ['top', 'center', 'bottom'].includes(style.position) ? style.position : 'bottom',
    margin: Math.min(Math.max(Number(style.margin) || 36, 0), 400),
    color: /^#[0-9a-fA-F]{6}$/.test(String(style.color || '')) ? String(style.color) : '#FFFFFF'
  };
}

const fontUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

app.get('/api/settings', (req, res) => {
  res.json({ success: true, settings: settings.masked() });
});

app.put('/api/settings', (req, res) => {
  const body = req.body || {};
  const patch = {};
  for (const key of settings.ALLOWED) {
    if (key in body) patch[key] = body[key];
  }
  if (patch.translationProvider && !settings.PROVIDERS.includes(patch.translationProvider)) {
    return res.status(400).json({ success: false, error: '不支持的翻译接口' });
  }
  const masked = settings.update(patch);
  refreshCredentials();
  res.json({ success: true, settings: masked });
});

app.get('/api/usage', (req, res) => {
  const summary = db.usageSummary();
  res.json({ success: true, summary: summary.totals, recent: summary.recent });
});

app.get('/api/fonts', (req, res) => {
  res.json({ success: true, fonts: fonts.listFonts() });
});

app.post('/api/fonts', fontUpload.single('font'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请选择字体文件' });
    }
    const saved = fonts.saveFont(req.file.buffer, req.file.originalname);
    res.json({ success: true, font: saved });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete('/api/fonts', (req, res) => {
  const id = req.query.id;
  if (!id) {
    return res.status(400).json({ success: false, error: '缺少字体 id' });
  }
  const removed = fonts.removeFont(String(id));
  res.json({ success: removed });
});


// 提取音频
const extractAudio = (videoPath, audioPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(16000)
      .format('wav')
      .output(audioPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
};

// 使用火山引擎语音识别API进行语音识别和字幕生成（带时间轴）
const speechToTextWithTimestamps = async (audioPath, sourceLanguage = 'auto') => {
  try {
    const audioData = fs.readFileSync(audioPath);
    const audioBase64 = audioData.toString('base64');
    const requestId = generateUUID();

    console.log('开始语音识别处理...');
    console.log('音频文件路径:', audioPath);
    console.log('音频文件大小:', audioData.length, 'bytes');
    console.log('源语言:', sourceLanguage);

    // 语言映射
    const languageMap = {
      'auto': '',
      'zh': 'zh-CN',
      'en': 'en-US',
      'ja': 'ja-JP',
      'ko': 'ko-KR',
      'fr': 'fr-FR',
      'de': 'de-DE'
    };
    const apiLanguage = languageMap[sourceLanguage] || '';
    console.log('API语言代码:', apiLanguage || '(自动)');

    // 使用新版大模型录音文件识别API
    const submitUrl = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit';
    const queryUrl = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query';

    const submitHeaders = {
      'Content-Type': 'application/json',
      'X-Api-App-Key': VOLC_APP_ID,
      'X-Api-Access-Key': VOLC_ACCESS_TOKEN,
      'X-Api-Resource-Id': 'volc.seedasr.auc',
      'X-Api-Request-Id': requestId,
      'X-Api-Sequence': '-1'
    };

    const submitBody = {
      user: { uid: VOLC_APP_ID },
      audio: {
        format: 'wav',
        data: audioBase64,
        language: apiLanguage || 'ja-JP'
      },
      request: {
        model_name: 'bigmodel',
        show_utterances: true,
        enable_itn: true,
        enable_punc: true,
        model_version: '400'
      }
    };

    console.log('提交语音识别任务到新版大模型API...');
    console.log('请求URL:', submitUrl);
    console.log('请求Headers:', JSON.stringify({...submitHeaders, 'X-Api-Request-Id': requestId}, null, 2));
    console.log('请求Body - audio.language:', apiLanguage || '(空/自动)');
    console.log('请求Body - request:', JSON.stringify(submitBody.request));
    console.log('请求Body - audio.format:', submitBody.audio.format, ', data长度:', submitBody.audio.data.length);
    const submitResponse = await axios.post(submitUrl, submitBody, { headers: submitHeaders });

    // 新版API通过header返回状态码
    const submitStatusCode = submitResponse.headers['x-api-status-code'];
    const submitMessage = submitResponse.headers['x-api-message'];
    console.log(`提交结果 - 状态码: ${submitStatusCode}, 消息: ${submitMessage}`);

    if (submitStatusCode !== '20000000') {
      throw new Error(`语音识别提交失败: ${submitMessage || JSON.stringify(submitResponse.data)}`);
    }

    console.log('语音识别任务提交成功，开始轮询结果...');

    // 轮询查询结果
    const maxRetries = 60;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        const queryHeaders = {
          'Content-Type': 'application/json',
          'X-Api-App-Key': VOLC_APP_ID,
          'X-Api-Access-Key': VOLC_ACCESS_TOKEN,
      'X-Api-Resource-Id': 'volc.seedasr.auc',
          'X-Api-Request-Id': requestId
        };

        const queryResponse = await axios.post(queryUrl, {}, { headers: queryHeaders });

        const queryStatusCode = queryResponse.headers['x-api-status-code'];
        const queryMessage = queryResponse.headers['x-api-message'];
        console.log(`查询 (尝试 ${retryCount + 1}/${maxRetries}) - 状态码: ${queryStatusCode}, 消息: ${queryMessage}`);

        if (queryStatusCode === '20000000') {
          // 识别完成 - API响应结构: { audio_info, result: { text, utterances: [...] } }
          const rawData = queryResponse.data;
          const result = rawData.result || rawData;  // 兼容嵌套和扁平结构

          if (result.utterances && Array.isArray(result.utterances) && result.utterances.length > 0) {
            console.log(`语音识别成功！共 ${result.utterances.length} 条utterance`);
            return result.utterances.map(u => ({
              start_time: u.start_time || 0,
              end_time: u.end_time || 5000,
              text: u.text || ''
            }));
          }

          if (result.text) {
            console.log('语音识别成功，但无utterance，使用全文作为单条字幕');
            return [{ start_time: 0, end_time: (rawData.audio_info?.duration || 10000), text: result.text }];
          }

          console.log('警告: 识别成功但没有文本结果');
          return [];
        } else if (queryStatusCode === '20000001') {
          // 仍在处理中，继续轮询
          retryCount++;
        } else {
          throw new Error(`语音识别失败: ${queryMessage}`);
        }
      } catch (queryError) {
        console.error(`查询失败 (尝试 ${retryCount + 1}):`, queryError.message);
        retryCount++;
        if (retryCount >= maxRetries) {
          throw new Error(`语音识别查询超时: ${queryError.message}`);
        }
      }
    }

    throw new Error('语音识别超时，未获取到结果');
  } catch (error) {
    console.error('语音识别API调用失败:', error.response?.data || error.message);
    throw error;
  }
};

// 生成UUID的函数
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// 使用火山引擎自动字幕打轴API将翻译文本与音频对齐
const alignSubtitlesWithAudio = async (audioPath, subtitleText) => {
  try {
    console.log('开始自动字幕打轴处理...');
    console.log('音频文件路径:', audioPath);
    console.log('字幕文本:', subtitleText.substring(0, 100) + '...');
    
    // 读取音频文件
    const audioData = fs.readFileSync(audioPath);
    
    // 创建FormData
    const form = new FormData();
    form.append('data', audioData, {
      filename: 'audio.wav',
      contentType: 'audio/wav'
    });
    form.append('audio-text', subtitleText);
    
    // API参数
    const appid = VOLC_APP_ID; // 火山引擎APP ID（从环境变量读取）
    const caption_type = "speech"; // 说话类型
    const sta_punc_mode = "1"; // 省略打轴结果句级别末尾逗号句号
    const caption_category = "2"; // 字幕输出模式2
    const cluster = "ata_cluster"; // 固定值
    
    // 构建URL参数
    const url = `https://openspeech.bytedance.com/api/v1/vc/ata/submit?appid=${appid}&caption_type=${caption_type}&sta_punc_mode=${sta_punc_mode}&caption_category=${caption_category}&cluster=${cluster}`;
    
    console.log('提交自动打轴任务...');
    const submitResponse = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer; ${VOLC_ACCESS_TOKEN}` // 火山引擎访问令牌（从环境变量读取）
      }
    });
    
    console.log('提交响应:', JSON.stringify(submitResponse.data, null, 2));
    
    if (submitResponse.data && submitResponse.data.code === 0 && submitResponse.data.id) {
      const taskId = submitResponse.data.id;
      console.log('✅ 自动打轴任务提交成功，任务ID:', taskId);
      
      // 轮询查询结果
      const maxRetries = 30; // 最多重试30次
      let retryCount = 0;
      
      while (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
        
        try {
          // 查询结果
          const queryUrl = `https://openspeech.bytedance.com/api/v1/vc/ata/query?appid=${appid}&id=${taskId}&blocking=0`;
          const queryResponse = await axios.get(queryUrl, {
            headers: {
              'Authorization': `Bearer; ${VOLC_ACCESS_TOKEN}` // 火山引擎访问令牌（从环境变量读取）
            }
          });
          
          console.log(`查询响应 (尝试 ${retryCount + 1}/${maxRetries}):`, 
            JSON.stringify(queryResponse.data, null, 2));
          
          if (queryResponse.data && queryResponse.data.code === 0) {
            console.log('✅ 自动字幕打轴成功！');
            
            if (queryResponse.data.utterances && Array.isArray(queryResponse.data.utterances)) {
              // 转换utterances格式为统一的结构
              const subtitles = queryResponse.data.utterances.map(utterance => ({
                start_time: utterance.start_time || 0,
                end_time: utterance.end_time || 5000,
                text: utterance.text || ''
              }));
              
              console.log(`生成 ${subtitles.length} 个带时间轴的字幕片段`);
              return subtitles;
            } else {
              console.log('警告: 没有utterances数据');
              // 返回默认字幕
              return [{
                start_time: 0,
                end_time: 10000,
                text: subtitleText
              }];
            }
          } else if (queryResponse.data && queryResponse.data.code < 2000) {
            // 任务还在处理中，继续轮询
            console.log(`任务处理中，状态码: ${queryResponse.data.code}`);
            retryCount++;
            continue;
          } else if (queryResponse.data && queryResponse.data.code >= 2000) {
            // 任务失败
            throw new Error(`自动打轴任务失败: ${queryResponse.data.message || '未知错误'}`);
          }
        } catch (queryError) {
          console.error(`查询任务状态失败 (尝试 ${retryCount + 1}):`, queryError.message);
          retryCount++;
          if (retryCount >= maxRetries) {
            throw new Error(`自动打轴任务查询超时: ${queryError.message}`);
          }
        }
      }
      
      throw new Error('自动打轴任务超时，未获取到结果');
    } else {
      throw new Error(`自动打轴提交失败: ${JSON.stringify(submitResponse.data)}`);
    }
  } catch (error) {
    console.error('自动字幕打轴API调用失败:', error.response?.data || error.message);
    
    // 如果API失败，返回简单的时间轴（原字幕的时间轴）
    console.log('自动打轴API不可用，使用原始时间轴');
    // 这里需要返回一个默认的字幕结构，但实际应该在调用处处理
    throw new Error(`自动字幕打轴失败: ${error.message}`);
  }
};

// 使用火山引擎机器翻译API（新版控制台）
const translateTextWithVolc = async (text, targetLanguage) => {
  try {
    // 语言代码映射
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
    const sourceLang = ''; // 空字符串表示自动检测源语言
    
    // 辅助函数：翻译单个文本片段
    const translateSegment = async (segmentText) => {
      const requestId = generateUUID();
      
      const response = await axios.post('https://openspeech.bytedance.com/api/v3/machine_translation/matx_translate', {
        text_list: [segmentText], // 文档要求是数组，即使只有一条文本
        source_language: sourceLang,
        target_language: targetLang
      }, {
        headers: {
          'X-Api-Key': VOLC_API_KEY, // 新版控制台使用X-Api-Key
          'X-Api-Resource-Id': 'volc.speech.mt', // 固定值
          'X-Api-Request-Id': requestId,
          'Content-Type': 'application/json'
        }
      });

      // 文档说明成功码是20000000
      if (response.data.code === 20000000 && response.data.data && response.data.data.translation_list) {
        // 返回数组中的第一条翻译结果
        return response.data.data.translation_list[0].translation || segmentText;
      }

      throw new Error(`火山引擎翻译API返回错误: ${JSON.stringify(response.data)}`);
    };

    // 检查文本长度，如果过长则分段处理（火山引擎API token限制约1024）
    // 保守估计：中文字符约1token/字，英文字符约0.25token/字，按字符数分段
    const MAX_CHARS_PER_SEGMENT = 800; // 保守估计，留有余量
    
    if (text.length <= MAX_CHARS_PER_SEGMENT) {
      // 短文本直接翻译
      return await translateSegment(text);
    }
    
    console.log(`文本过长(${text.length}字符，超过${MAX_CHARS_PER_SEGMENT}限制)，进行分段翻译...`);
    
    // 按句子分割（更自然的分段方式）
    // 匹配中英文标点作为句子分割点
    const sentenceRegex = /[^。！？.!?\n]+[。！？.!?\n]*/g;
    const sentences = text.match(sentenceRegex) || [text];
    
    let translatedSegments = [];
    let currentSegment = '';
    let segmentCount = 0;
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (!sentence) continue;
      
      // 如果当前句子本身已经超过限制，需要进一步分割
      if (sentence.length > MAX_CHARS_PER_SEGMENT) {
        console.warn(`句子过长(${sentence.length}字符)，按字符分割`);
        // 按字符数分割长句子
        for (let j = 0; j < sentence.length; j += MAX_CHARS_PER_SEGMENT) {
          const chunk = sentence.substring(j, j + MAX_CHARS_PER_SEGMENT);
          try {
            const translated = await translateSegment(chunk);
            translatedSegments.push(translated);
            segmentCount++;
          } catch (error) {
            console.warn(`分段翻译失败（第${segmentCount + 1}段）: ${error.message}`);
            translatedSegments.push(chunk); // 失败时保留原文
            segmentCount++;
          }
        }
      } else if (currentSegment.length + sentence.length + 1 <= MAX_CHARS_PER_SEGMENT) {
        // 可以添加到当前分段
        currentSegment += (currentSegment ? ' ' : '') + sentence;
      } else {
        // 当前分段已满，先翻译当前分段
        if (currentSegment) {
          try {
            const translated = await translateSegment(currentSegment);
            translatedSegments.push(translated);
            segmentCount++;
          } catch (error) {
            console.warn(`分段翻译失败（第${segmentCount + 1}段）: ${error.message}`);
            translatedSegments.push(currentSegment); // 失败时保留原文
            segmentCount++;
          }
        }
        // 开始新的分段
        currentSegment = sentence;
      }
    }
    
    // 翻译最后一个分段
    if (currentSegment) {
      try {
        const translated = await translateSegment(currentSegment);
        translatedSegments.push(translated);
        segmentCount++;
      } catch (error) {
        console.warn(`分段翻译失败（第${segmentCount + 1}段）: ${error.message}`);
        translatedSegments.push(currentSegment); // 失败时保留原文
        segmentCount++;
      }
    }
    
    console.log(`分段翻译完成，共${segmentCount}段`);
    return translatedSegments.join(' ');
    
  } catch (error) {
    console.error('火山引擎翻译API调用失败:', error.response?.data || error.message);
    throw new Error(`翻译失败: ${error.message}`);
  }
};

// 使用豆包大模型进行机器翻译（作为备用）
const translateTextWithDoubao = async (text, targetLanguage) => {
  try {
    const languageNames = {
      'zh': '中文',
      'en': '英文',
      'ja': '日文',
      'ko': '韩文',
      'fr': '法文',
      'de': '德文',
      'es': '西班牙文',
      'ru': '俄文',
      'ar': '阿拉伯文'
    };

    const targetLang = languageNames[targetLanguage] || targetLanguage;
    const requestId = generateUUID();

    // 根据用户提供的curl示例，使用Authorization: Bearer认证
    // 豆包API端点是 https://ark.cn-beijing.volces.com/api/v3/responses
    const headers = {
      'Authorization': `Bearer ${DOUBAO_API_KEY}`, // 使用豆包API密钥
      'Content-Type': 'application/json'
    };

    // 构建请求体，使用用户示例中的格式
    const requestBody = {
      "model": DOUBAO_MODEL, // 豆包模型名称（从环境变量读取）
      "input": [
        {
          "role": "user",
          "content": [
            {
              "type": "input_text",
              "text": `请将以下文本翻译成${targetLang}，只返回翻译结果，不要其他解释：${text}`
            }
          ]
        }
      ]
    };

    const response = await axios.post('https://ark.cn-beijing.volces.com/api/v3/responses', requestBody, {
      headers: headers,
      timeout: 30000 // 增加超时时间到30秒
    });

    // 检查响应格式
    // 根据测试结果，响应格式为output数组，包含reasoning和message
    if (response.data && response.data.output && Array.isArray(response.data.output)) {
      // 查找type为"message"的输出项
      const messageOutput = response.data.output.find(item => item.type === 'message');
      if (messageOutput && messageOutput.content && Array.isArray(messageOutput.content)) {
        // 查找type为"output_text"的内容项
        const textContent = messageOutput.content.find(item => item.type === 'output_text');
        if (textContent && textContent.text) {
          return textContent.text.trim();
        }
      }
    }
    
    // 备用解析：旧的choices格式
    if (response.data && response.data.choices && response.data.choices[0]) {
      return response.data.choices[0].message.content.trim();
    }

    console.error('豆包API返回响应:', JSON.stringify(response.data, null, 2));
    throw new Error(`豆包API返回无效响应: ${JSON.stringify(response.data)}`);
  } catch (error) {
    console.error('豆包翻译API调用失败:', error.response?.data || error.message);
    
    // 如果是认证错误，记录详细信息
    if (error.response && error.response.status === 401) {
      console.error('豆包API认证失败，请检查API密钥和权限');
    }
    
    throw new Error(`豆包翻译失败: ${error.message}`);
  }
};

// 使用LLM逐句翻译字幕，保留时间轴（自动分批）
// 单句过长时按标点拆分，并按字符数比例分配时间，避免整段字幕“一股脑”出现
const segmentLongSubtitle = (subtitles, maxDurationMs = 8000) => {
  const punctuation = /[。！？!?；;，,、]/;
  const result = [];

  for (const item of subtitles) {
    const start = Number(item.start_time) || 0;
    const end = Number(item.end_time) || 0;
    const duration = Math.max(0, end - start);
    const text = String(item.text || '').trim();

    if (duration <= maxDurationMs || text.length < 4) {
      result.push(item);
      continue;
    }

    const pieces = text.split(punctuation).map((piece) => piece.trim()).filter(Boolean);
    if (pieces.length < 2) {
      result.push(item);
      continue;
    }

    const totalChars = pieces.reduce((sum, piece) => sum + piece.length, 0) || 1;
    let cursor = start;
    pieces.forEach((piece, index) => {
      const isLast = index === pieces.length - 1;
      const span = Math.round((duration * piece.length) / totalChars);
      const pieceEnd = isLast ? end : Math.min(cursor + span, end);
      if (pieceEnd > cursor) {
        result.push({ ...item, start_time: cursor, end_time: pieceEnd, text: piece });
      }
      cursor = pieceEnd;
    });
  }

  return result;
};

// 时间校对：ASR 只给出一整段时，先用自动打轴接口重新对齐，失败再按标点拆分兜底
const refineSubtitleTiming = async (audioPath, subtitles) => {
  if (!Array.isArray(subtitles) || subtitles.length === 0) return subtitles;

  const longest = Math.max(...subtitles.map((s) => (Number(s.end_time) || 0) - (Number(s.start_time) || 0)));
  if (subtitles.length > 1 && longest <= 12000) return subtitles;

  const text = subtitles.map((s) => s.text).join('\n');
  try {
    const aligned = await alignSubtitlesWithAudio(audioPath, text);
    if (Array.isArray(aligned) && aligned.length > 1) {
      console.log(`自动打轴完成：${aligned.length} 条字幕`);
      return aligned;
    }
  } catch (error) {
    console.warn('自动打轴失败，改用标点拆分兜底:', error.message);
  }

  const fallback = segmentLongSubtitle(subtitles);
  console.log(`标点拆分兜底：${subtitles.length} 条 -> ${fallback.length} 条`);
  return fallback;
};

const translateSubtitlesWithLLM = async (subtitles, targetLanguage, sourceLanguage = 'auto') => {
  if (!subtitles || subtitles.length === 0) return subtitles;

  const languageNames = {
    zh: '中文', en: '英文', ja: '日文', ko: '韩文', fr: '法文', de: '德文', es: '西班牙文', ru: '俄文', ar: '阿拉伯文'
  };
  const targetLangName = languageNames[targetLanguage] || targetLanguage;
  const normalizeLang = (code, fallback) => ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'ar'].includes(code) ? code : fallback;
  const translationOptions = { target_language: normalizeLang(targetLanguage, 'zh') };
  if (sourceLanguage && sourceLanguage !== 'auto') {
    translationOptions.source_language = normalizeLang(sourceLanguage, translationOptions.target_language);
  }

  const provider = TRANSLATION_PROVIDER || 'doubao';
  const compatible = provider !== 'doubao';
  const preset = TRANSLATION_PRESETS[provider] || {};
  const batchSize = 25;
  const totalBatches = Math.ceil(subtitles.length / batchSize);
  const allTranslated = [];

  const requestBatch = async (text, expectLines) => {
    if (compatible) {
      const base = String(OPENAI_BASE_URL || preset.base || '').replace(/\/+$/, '');
      if (!base || !OPENAI_API_KEY) {
        throw new Error('翻译接口未配置（baseUrl / apiKey）');
      }
      const response = await axios.post(
        `${base}/chat/completions`,
        {
          model: OPENAI_MODEL || preset.model || 'qwen-plus',
          temperature: 0.2,
          messages: [
            { role: 'system', content: `你是专业字幕翻译助手。把用户给出的每一行翻译成${targetLangName}，严格保持行数与顺序，不合并、不解释、不添加编号。` },
            { role: 'user', content: `[必须输出恰好${expectLines}行，每行对应原文一行]\n${text}` }
          ]
        },
        { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, timeout: 120000 }
      );
      return String(response.data?.choices?.[0]?.message?.content || '').trim();
    }

    const body = {
      model: DOUBAO_MODEL,
      input: [{ role: 'user', content: [{ type: 'input_text', text, translation_options: translationOptions }] }]
    };
    const response = await axios.post('https://ark.cn-beijing.volces.com/api/v3/responses', body, {
      headers: { Authorization: `Bearer ${DOUBAO_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 120000
    });
    let translated = '';
    if (response.data?.output && Array.isArray(response.data.output)) {
      const message = response.data.output.find((item) => item.type === 'message');
      const content = message?.content?.find((item) => item.type === 'output_text');
      translated = content?.text || '';
    }
    if (!translated && response.data?.choices?.[0]?.message?.content) {
      translated = response.data.choices[0].message.content;
    }
    return String(translated).trim();
  };

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    const start = batchIndex * batchSize;
    const batch = subtitles.slice(start, Math.min(start + batchSize, subtitles.length));
    const batchText = batch.map((item) => item.text).join('\n');

    let lines = (await requestBatch(batchText, batch.length)).split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length !== batch.length) {
      try {
        const retryLines = (await requestBatch(batchText, batch.length)).split('\n').map((line) => line.trim()).filter(Boolean);
        if (retryLines.length === batch.length) lines = retryLines;
      } catch (error) {
        console.warn('翻译重试失败:', error.message);
      }
      while (lines.length < batch.length) lines.push('');
      lines = lines.slice(0, batch.length);
    }

    allTranslated.push(...lines);
    try {
      db.recordUsage(currentJobId(), provider, 'translate', batchText.length, compatible ? (OPENAI_MODEL || preset.model) : DOUBAO_MODEL);
    } catch (error) {
      console.error('记录翻译用量失败:', error.message);
    }
  }

  console.log(`翻译完成：${allTranslated.length} 条（${provider}）`);
  return subtitles.map((item, index) => ({ ...item, text: allTranslated[index] || item.text }));
};

// 使用对话模型对翻译和原文进行校准验证
const proofreadTranslation = async (originalText, translatedText, targetLanguage) => {
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

    // 根据用户提供的curl示例，使用Authorization: Bearer认证
    const headers = {
      'Authorization': `Bearer ${DOUBAO_API_KEY}`, // 使用豆包API密钥
      'Content-Type': 'application/json'
    };

    // 构建请求体，使用豆包对话API格式（/api/v3/chat/completions端点）
    const requestBody = {
      "model": DOUBAO_MODEL, // 豆包模型名称（从环境变量读取）
      "messages": [
        {
          "role": "system",
          "content": "你是一个专业的翻译校准助手，负责检查翻译质量，评估语义准确性和表达通顺性。"
        },
        {
          "role": "user",
          "content": `请校准验证以下翻译质量，检查语义是否准确、表达是否通顺：

原文：${originalText}

翻译：${translatedText}

请指出翻译是否准确，如有错误请给出修正建议。如果翻译准确，回复"校准通过"。如果需要修正，请先说明问题，然后给出修正后的翻译。`
        }
      ]
    };

    const response = await axios.post('https://ark.cn-beijing.volces.com/api/v3/chat/completions', requestBody, {
      headers: headers,
      timeout: 120000 // 120秒超时，校准任务可能需要更长时间
    });

    // 检查响应格式（标准OpenAI兼容格式）
    let feedback = '';
    if (response.data && response.data.choices && response.data.choices[0]) {
      feedback = response.data.choices[0].message.content.trim();
      console.log('豆包校准响应全文:', feedback);
      console.log('豆包校准响应长度:', feedback.length);
    } else {
      throw new Error(`校准API返回无效响应: ${JSON.stringify(response.data)}`);
    }

    // 检查是否需要修正翻译
    if (feedback.includes('校准通过') || feedback.includes('翻译准确')) {
      return { corrected: false, translatedText, feedback };
    }

    // 提取修正后的翻译（精确处理，避免提取无关文本）
    let correctedText = null;
    
    // 先记录完整的feedback用于调试
    console.log('开始提取修正文本，feedback长度:', feedback.length);
    if (feedback.length > 500) {
      console.log('feedback前500字符:', feedback.substring(0, 500) + '...');
    } else {
      console.log('完整feedback:', feedback);
    }
    
    // 辅助函数：验证提取的文本是否像真正的翻译
    function isValidTranslation(text) {
      if (!text || text.length < 2) return false;
      
      // 检查是否包含常见的问题分析词汇
      const problemIndicators = ['问题：', '分析：', '评估：', '建议：', '注意：', '需要', '应该', '可以', '改进', '优化', '总结：', '结论：', '评估结果：'];
      for (const indicator of problemIndicators) {
        if (text.includes(indicator)) {
          return false;
        }
      }
      
      // 检查中文字符比例（真正的翻译应该主要是中文）
      const chineseCharCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const chineseRatio = chineseCharCount / text.length;
      
      // 真正的翻译应该有较高的中文字符比例（> 0.3）
      if (chineseRatio < 0.3 && text.length > 20) {
        console.log('中文字符比例过低:', chineseRatio, '可能不是真正的翻译');
        return false;
      }
      
      return true;
    }
    
    // 尝试多种可能的标记模式
    const possibleMarkers = [
      '修正后的翻译[：:]',
      '修正为[：:]',
      '建议修改为[：:]',
      '正确翻译[：:]',
      '校准后的翻译[：:]',
      '修改为[：:]',
      '修正建议[：:]'
    ];
    
    // 方法1：尝试提取引号内的内容（最精确）
    for (const marker of possibleMarkers) {
      const quotedPattern = new RegExp(`${marker}\\s*["'"]([^"']+)["'"]`);
      const quotedMatch = feedback.match(quotedPattern);
      if (quotedMatch) {
        correctedText = quotedMatch[1].trim();
        console.log(`通过引号提取修正文本(标记: ${marker}):`, correctedText);
        if (isValidTranslation(correctedText)) {
          return { corrected: true, translatedText: correctedText, feedback };
        } else {
          console.log('引号内文本验证失败，尝试其他方法');
        }
      }
    }
    
    // 方法2：精确提取两个标记之间的内容
    for (const marker of possibleMarkers) {
      const markerPattern = new RegExp(`${marker}\\s*([\\s\\S]*?)(?=\\n\\n|\\n\\s*(?:其他|注意|建议|或者|总结|分析|评估|综上所述|改进|优化|问题|结论)|$)`);
      const markerMatch = feedback.match(markerPattern);
      if (markerMatch) {
        correctedText = markerMatch[1].trim();
        // 如果有多行，只取第一行
        const firstLineEnd = correctedText.indexOf('\n');
        if (firstLineEnd !== -1) {
          correctedText = correctedText.substring(0, firstLineEnd).trim();
        }
        // 清理尾随标点
        correctedText = correctedText.replace(/[。，、；：！？\.\,;:!?\s]+$/, '');
        console.log(`通过精确标记匹配提取修正文本(标记: ${marker}):`, correctedText);
        
        // 验证文本是否合理
        if (!isValidTranslation(correctedText)) {
          console.log('提取文本验证失败，尝试清理');
          // 尝试找到第一个完整句子
          const sentenceEnd = correctedText.search(/[。！？\.!?]/);
          if (sentenceEnd !== -1) {
            correctedText = correctedText.substring(0, sentenceEnd + 1);
            correctedText = correctedText.replace(/[。，、；：！？\.\,;:!?\s]+$/, '');
            console.log('清理后文本:', correctedText);
          }
        }
        
        if (isValidTranslation(correctedText)) {
          return { corrected: true, translatedText: correctedText, feedback };
        }
      }
    }
    
    // 方法3：查找标记并提取到下一个换行或句号
    for (const marker of possibleMarkers) {
      const markerName = marker.replace(/\[：:\]/, '');
      const markerIndex = feedback.indexOf(markerName);
      if (markerIndex !== -1) {
        let startIndex = markerIndex + markerName.length;
        // 跳过冒号、空格等字符
        while (startIndex < feedback.length && (feedback[startIndex] === '：' || feedback[startIndex] === ':' || feedback[startIndex] === ' ' || feedback[startIndex] === '\n' || feedback[startIndex] === '\r' || feedback[startIndex] === '：')) {
          startIndex++;
        }
        if (startIndex < feedback.length) {
          // 查找结束点：换行、句号、或常见标记
          let endIndex = feedback.length;
          const endMarkers = ['\n\n', '\n其他', '\n注意', '\n建议', '\n或者', '\n总结', '\n分析', '\n评估', '。', '；', '.', ';'];
          
          for (const endMarker of endMarkers) {
            const markerPos = feedback.indexOf(endMarker, startIndex);
            if (markerPos !== -1 && markerPos < endIndex) {
              endIndex = markerPos;
            }
          }
          
          correctedText = feedback.substring(startIndex, endIndex).trim();
          
          // 如果文本过长或验证失败，进行清理
          if (correctedText.length > 100 || !isValidTranslation(correctedText)) {
            console.log('文本可能需要清理，长度:', correctedText.length);
            // 尝试找到第一个完整句子
            const sentenceEnd = correctedText.search(/[。！？\.!?]/);
            if (sentenceEnd !== -1 && sentenceEnd < 100) {
              correctedText = correctedText.substring(0, sentenceEnd + 1);
              correctedText = correctedText.replace(/[。，、；：！？\.\,;:!?\s]+$/, '');
              console.log('清理后文本:', correctedText);
            }
          }
          
          console.log(`通过标记查找提取修正文本(标记: ${markerName}):`, correctedText);
          
          if (isValidTranslation(correctedText)) {
            return { corrected: true, translatedText: correctedText, feedback };
          }
        }
      }
    }

    console.log('未找到有效的修正后的翻译，使用原始翻译文本');
    return { corrected: false, translatedText, feedback };
  } catch (error) {
    console.error('校准API调用失败:', error.response?.data || error.message);
    
    // 如果是认证错误，记录详细信息
    if (error.response && error.response.status === 401) {
      console.error('校准API认证失败，请检查API密钥和权限');
    }
    
    throw new Error(`校准失败: ${error.message}`);
  }
};

// 生成带时间轴的字幕文件
const generateSubtitleWithTimestamps = (subtitles, subtitlePath) => {
  let subtitleContent = '';

  subtitles.forEach((item, index) => {
    const startTime = formatTime(item.start_time);
    const endTime = formatTime(item.end_time);
    subtitleContent += `${index + 1}\n${startTime} --> ${endTime}\n${item.text}\n\n`;
  });

  fs.writeFileSync(subtitlePath, subtitleContent, 'utf-8');
};

// 格式化时间（毫秒转换为SRT格式）
const formatTime = (ms) => {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
};

// 合成字幕到视频
// 把 SRT 转成 ASS，样式（字体/字号/位置/颜色）才能被 libass 可靠应用
const buildAssContent = (srtContent, style, width, height) => {
  const hex = String(style.color || '#FFFFFF').replace('#', '').padEnd(6, 'F').slice(0, 6);
  const bgr = `${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`.toUpperCase();
  const alignment = style.position === 'top' ? 8 : style.position === 'center' ? 5 : 2;
  const fontSize = Math.min(Math.max(Number(style.fontSize) || 24, 8), 120);
  const marginV = Math.min(Math.max(Number(style.margin) || 36, 0), 400);
  const family = String(style.fontFamily || 'SimHei');
  const playW = width || 1280;
  const playH = height || 720;

  const toAssTime = (value) => {
    const match = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(value.trim());
    if (!match) return '0:00:00.00';
    const [, h, m, sec, ms] = match;
    return `${Number(h)}:${m}:${sec}.${String(Math.round(Number(ms) / 10)).padStart(2, '0')}`;
  };

  const events = [];
  const blocks = srtContent.replace(/\r/g, '').split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    const timeIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeIndex === -1) continue;
    const [start, end] = lines[timeIndex].split('-->');
    const text = lines.slice(timeIndex + 1).join('\N');
    if (!text) continue;
    events.push(`Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Default,,0,0,0,,${text}`);
  }

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${playW}
PlayResY: ${playH}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${family},${fontSize},&H00${bgr},&H00${bgr},&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,1,0,${alignment},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;
};

const addSubtitleToVideo = (videoPath, subtitlePath, outputPath, subtitleStyle = null) => {
  return new Promise((resolve, reject) => {
    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 验证文件是否存在
    if (!fs.existsSync(videoPath)) {
      reject(new Error(`视频文件不存在: ${videoPath}`));
      return;
    }
    
    if (!fs.existsSync(subtitlePath)) {
      reject(new Error(`字幕文件不存在: ${subtitlePath}`));
      return;
    }
    
    // 在WSL环境中，需要使用WSL风格的路径
    let wslVideoPath = videoPath;
    let wslSubtitlePath = subtitlePath;
    let wslOutputPath = outputPath;
    
    // 检查是否在WSL环境中运行
    if (process.platform === 'linux' && fs.existsSync('/mnt/c')) {
      // 如果是Windows路径，转换为WSL路径
      if (wslVideoPath.includes('C:')) {
        wslVideoPath = wslVideoPath.replace(/^C:/, '/mnt/c').replace(/\\/g, '/');
      }
      if (wslSubtitlePath.includes('C:')) {
        wslSubtitlePath = wslSubtitlePath.replace(/^C:/, '/mnt/c').replace(/\\/g, '/');
      }
      if (wslOutputPath.includes('C:')) {
        wslOutputPath = wslOutputPath.replace(/^C:/, '/mnt/c').replace(/\\/g, '/');
      }
    } else {
      // 确保使用正斜杠
      wslVideoPath = wslVideoPath.replace(/\\/g, '/');
      wslSubtitlePath = wslSubtitlePath.replace(/\\/g, '/');
      wslOutputPath = wslOutputPath.replace(/\\/g, '/');
    }
    
    console.log(`视频路径: ${wslVideoPath}`);
    console.log(`字幕路径: ${wslSubtitlePath}`);
    console.log(`输出路径: ${wslOutputPath}`);
    
    const style = subtitleStyle || {};
    ffmpeg.ffprobe(wslVideoPath, (probeError, metadata) => {
      let originalSize = null;
      if (!probeError && metadata && Array.isArray(metadata.streams)) {
        const videoStream = metadata.streams.find((stream) => stream.codec_type === 'video');
        if (videoStream && videoStream.width && videoStream.height) {
          originalSize = `${videoStream.width}x${videoStream.height}`;
        }
      }

      const width = originalSize ? Number(originalSize.split('x')[0]) : null;
      const height = originalSize ? Number(originalSize.split('x')[1]) : null;
      const assContent = buildAssContent(fs.readFileSync(subtitlePath, 'utf-8'), style, width, height);
      const assPath = path.join(path.dirname(outputPath), `${Date.now()}_style.ass`);
      fs.writeFileSync(assPath, assContent, 'utf-8');
      const wslAssPath = process.platform === 'win32' ? assPath.replace(/\\/g, '/') : assPath;

      const escapePath = (value) => value.replace(/\\/g, '/').replace(/:/g, '\\:');
      const parts = [`filename='${escapePath(wslAssPath)}'`];
      if (fonts.FONT_DIR) parts.push(`fontsdir='${escapePath(fonts.FONT_DIR)}'`);
      if (originalSize) parts.push(`original_size=${originalSize}`);
      const filter = `subtitles=${parts.join(':')}`;

      console.log('字幕滤镜:', filter);

      ffmpeg(wslVideoPath)
        .output(wslOutputPath)
        .outputOptions(['-vf', filter, '-crf', '18', '-preset', 'slow'])
        .videoCodec('libx264')
        .audioCodec('aac')
        .on('start', (commandLine) => {
          console.log('FFmpeg命令:', commandLine);
        })
        .on('end', () => resolve())
        .on('error', (err) => {
          console.error('FFmpeg错误:', err.message);
          reject(err);
        })
        .on('stderr', (stderrLine) => {
          console.log('FFmpeg stderr:', stderrLine);
        })
        .run();
    });
  });
};

// 获取视频时长（秒）
const getVideoDuration = (videoPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(new Error(`无法获取视频时长: ${err.message}`));
      } else {
        const duration = metadata.format.duration;
        console.log(`视频时长: ${duration} 秒`);
        resolve(duration);
      }
    });
  });
};

// 分割视频为多个片段
const splitVideoIntoChunks = async (videoPath, chunkDurationSeconds = 300) => {
  return new Promise((resolve, reject) => {
    const outputDir = path.dirname(videoPath);
    const baseName = path.basename(videoPath, path.extname(videoPath));
    const chunkPattern = path.join(outputDir, `${baseName}_chunk_%03d.mp4`);
    
    console.log(`分割视频: ${videoPath}`);
    console.log(`片段时长: ${chunkDurationSeconds} 秒`);
    console.log(`输出模式: ${chunkPattern}`);
    
    ffmpeg(videoPath)
      .output(chunkPattern)
      .outputOptions([
        '-c', 'copy', // 复制编码，避免重新编码
        '-f', 'segment',
        '-segment_time', chunkDurationSeconds.toString(),
        '-reset_timestamps', '1' // 重置时间戳，每个片段从0开始
      ])
      .on('start', (commandLine) => {
        console.log('FFmpeg命令:', commandLine);
      })
      .on('end', async () => {
        try {
          // 查找生成的片段文件
          const files = fs.readdirSync(outputDir);
          const chunkFiles = files
            .filter(file => file.startsWith(`${baseName}_chunk_`) && file.endsWith('.mp4'))
            .map(file => path.join(outputDir, file))
            .sort(); // 按文件名排序
          
          console.log(`生成 ${chunkFiles.length} 个视频片段`);
          resolve(chunkFiles);
        } catch (error) {
          reject(new Error(`查找视频片段失败: ${error.message}`));
        }
      })
      .on('error', (err) => {
        reject(new Error(`视频分割失败: ${err.message}`));
      })
      .run();
  });
};

// 合并视频片段
const mergeVideoChunks = async (chunkPaths, outputPath) => {
  return new Promise((resolve, reject) => {
    if (chunkPaths.length === 0) {
      reject(new Error('没有视频片段可合并'));
      return;
    }
    
    console.log(`合并 ${chunkPaths.length} 个视频片段到: ${outputPath}`);
    
    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 创建concat文件列表 - 使用绝对路径确保FFmpeg能找到文件
    const concatFilePath = path.resolve(path.join(outputDir, 'concat_list.txt'));
    
    // 确保所有输入文件路径都是绝对路径
    const absoluteChunkPaths = chunkPaths.map(chunkPath => {
      const absolutePath = path.resolve(chunkPath);
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`视频片段不存在: ${absolutePath}`);
      }
      return absolutePath;
    });
    
    // 生成concat文件内容 - 使用正斜杠确保跨平台兼容性
    const concatContent = absoluteChunkPaths.map(chunkPath => 
      `file '${chunkPath.replace(/\\/g, '/')}'`
    ).join('\n');
    
    console.log('生成concat文件内容:');
    console.log(concatContent);
    
    try {
      // 写入concat文件
      fs.writeFileSync(concatFilePath, concatContent, 'utf-8');
      console.log(`Concat文件已创建: ${concatFilePath}`);
      
      // 验证文件是否成功创建
      if (!fs.existsSync(concatFilePath)) {
        throw new Error(`Concat文件创建失败: ${concatFilePath}`);
      }
      
      // 检查文件内容
      const fileContent = fs.readFileSync(concatFilePath, 'utf-8');
      console.log(`验证文件内容 (${fileContent.length}字节):`, fileContent.substring(0, 200) + '...');
      
    } catch (fileError) {
      reject(new Error(`创建concat文件失败: ${fileError.message}`));
      return;
    }
    
    console.log('FFmpeg合并命令: ffmpeg -f concat -safe 0 -i ' + concatFilePath.replace(/\\/g, '/') + ' -c copy ' + outputPath);
    
    ffmpeg()
      .input(concatFilePath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy']) // 复制编码，避免重新编码
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log('FFmpeg实际命令:', commandLine);
      })
      .on('end', () => {
        // 清理concat文件
        try {
          if (fs.existsSync(concatFilePath)) {
            fs.unlinkSync(concatFilePath);
            console.log('清理临时concat文件');
          }
        } catch (cleanupError) {
          console.warn('清理临时文件失败:', cleanupError.message);
        }
        console.log('✅ 视频合并完成');
        resolve();
      })
      .on('error', (err) => {
        // 尝试清理concat文件
        try {
          if (fs.existsSync(concatFilePath)) {
            fs.unlinkSync(concatFilePath);
          }
        } catch {}
        
        console.error('FFmpeg合并错误详情:', err.message);
        reject(new Error(`视频合并失败: ${err.message}`));
      })
      .run();
  });
};

// 调整字幕时间轴（添加时间偏移）
const adjustSubtitlesTimestamps = (subtitles, timeOffsetMs) => {
  return subtitles.map(subtitle => ({
    ...subtitle,
    start_time: subtitle.start_time + timeOffsetMs,
    end_time: subtitle.end_time + timeOffsetMs
  }));
};

// 处理单个视频片段（返回处理后的视频路径和字幕数据）
const processVideoChunk = async (chunkPath, sourceLanguage, targetLanguage, subtitleStyle = null) => {
  console.log(`处理视频片段: ${chunkPath}`);
  
  // 确保临时目录存在
  fileManager.ensureTempDir();
  
  const timestamp = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const audioPath = fileManager.getTempFilePath(`${timestamp}_chunk.wav`);
  const subtitlePath = fileManager.getTempFilePath(`${timestamp}_chunk.srt`);
  const outputPath = fileManager.getTempFilePath(`${timestamp}_chunk_output.mp4`);
  
  try {
    // 提取音频
    await extractAudio(chunkPath, audioPath);
    
    // 步骤1：语音识别生成带时间轴的字幕
    const subtitles = await speechToTextWithTimestamps(audioPath, sourceLanguage);
    console.log(`ASR识别结果: ${subtitles.length} 条字幕`);
    try {
      const chars = subtitles.reduce((sum, item) => sum + String(item.text || '').length, 0);
      db.recordUsage(currentJobId(), 'volc', 'asr', chars, 'seedasr');
    } catch (error) {
      console.error('记录识别用量失败:', error.message);
    }
    if (subtitles.length > 0) {
      console.log(`首条字幕: ${subtitles[0].start_time}ms-${subtitles[0].end_time}ms "${subtitles[0].text}"`);
    }
    
    // 步骤2：逐句翻译，保留ASR时间轴
    let finalSubtitles = null;
    
    if (subtitles.length > 0) {
      console.log('使用LLM逐句翻译 + ASR原始时间轴');
      finalSubtitles = await translateSubtitlesWithLLM(subtitles, targetLanguage, sourceLanguage);
      finalSubtitles = await refineSubtitleTiming(audioPath, finalSubtitles);
    } else {
      // ASR也没有结果，创建单条字幕覆盖整个片段
      console.warn('ASR未返回任何字幕，创建单条覆盖字幕');
      const chunkDuration = 300 * 1000; // 5分钟
      finalSubtitles = [{
        start_time: 0,
        end_time: chunkDuration,
        text: '（无法识别音频内容）'
      }];
    }
    
    // 生成字幕文件
    generateSubtitleWithTimestamps(finalSubtitles, subtitlePath);
    
    // 验证SRT文件
    const srtContent = fs.readFileSync(subtitlePath, 'utf-8');
    console.log(`SRT文件大小: ${Buffer.byteLength(srtContent)} bytes, 内容前100字符: ${srtContent.substring(0, 100)}`);
    
    // 合成字幕到视频
    await addSubtitleToVideo(chunkPath, subtitlePath, outputPath, subtitleStyle);
    
    // 清理临时文件（保留输出视频）
    await safeUnlink(audioPath);
    await safeUnlink(subtitlePath);
    
    return {
      videoPath: outputPath,
      subtitles: finalSubtitles,
      originalText: subtitles.map(s => s.text).join(' '),
      translatedText: finalSubtitles.map(s => s.text).join(' ')
    };
  } catch (error) {
    // 清理临时文件（如果存在）
    try { fs.unlinkSync(audioPath); } catch {}
    try { fs.unlinkSync(subtitlePath); } catch {}
    throw new Error(`处理视频片段失败: ${error.message}`);
  }
};

// 合并字幕数据（将所有片段的字幕合并成一个数组，调整时间轴）
const mergeSubtitleData = (chunkResults) => {
  const mergedSubtitles = [];
  let timeOffset = 0;
  
  for (let i = 0; i < chunkResults.length; i++) {
    const chunk = chunkResults[i];
    const adjustedSubtitles = adjustSubtitlesTimestamps(chunk.subtitles, timeOffset);
    mergedSubtitles.push(...adjustedSubtitles);
    
    // 获取片段时长（估算：使用最后一个字幕的结束时间）
    if (adjustedSubtitles.length > 0) {
      const chunkDuration = Math.max(...adjustedSubtitles.map(s => s.end_time));
      timeOffset += chunkDuration;
    } else {
      // 如果没有字幕，假设片段时长为300秒（5分钟）
      timeOffset += 300 * 1000;
    }
  }
  
  console.log(`合并完成，总计 ${mergedSubtitles.length} 个字幕片段`);
  return mergedSubtitles;
};

// 视频上传和翻译API
// multer 以 latin1 解析文件名，中文名会变成乱码，这里按 UTF-8 还原
const normalizeFilename = (name) => {
  if (!name || !/[^\x00-\x7F]/.test(name)) return name;
  const converted = Buffer.from(name, 'latin1').toString('utf8');
  return converted.includes('\uFFFD') ? name : converted;
};

app.post('/api/translate-video', upload.single('video'), async (req, res) => {
  const requestData = monitoringSystem.startRequest();

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请上传视频文件' });
    }

    const { sourceLanguage = 'auto', targetLanguage = 'zh', subtitleStyle } = req.body;
    let parsedSubtitleStyle = null;
    if (subtitleStyle) {
      try {
        parsedSubtitleStyle = JSON.parse(subtitleStyle);
      } catch (error) {
        console.warn('解析字幕样式失败，使用默认样式:', error.message);
      }
    }

    const jobId = crypto.randomUUID();
    db.createJob({
      id: jobId,
      filename: normalizeFilename(req.file.originalname),
      fileSize: req.file.size,
      sourcePath: req.file.path,
      sourceLanguage,
      targetLanguage
    });

    db.updateJob(jobId, { subtitleStyle: JSON.stringify(normalizeStyle(parsedSubtitleStyle)) });

    // 立即返回任务标识，实际处理在队列中进行
    res.status(202).json({ success: true, jobId, status: 'pending' });
    enqueueTranslateJob(jobId, req.file.path, {
      sourceLanguage,
      targetLanguage,
      subtitleStyle: parsedSubtitleStyle
    });

    monitoringSystem.endRequest(requestData, true);
  } catch (error) {
    console.error('创建翻译任务失败:', error);
    if (req.file) {
      await safeUnlink(req.file.path);
    }
    monitoringSystem.endRequest(requestData, false, error);
    res.status(500).json({ success: false, error: error.message || '创建任务失败' });
  }
});

/** 入队，并在任务结束后把结果写回数据库 */
function enqueueTranslateJob(jobId, videoPath, options) {
  taskQueue
    .addTask(() => jobContext.run({ jobId }, () => runTranslationJob(jobId, videoPath, options)))
    .then((result) => {
      const cancelled = cancelledJobs.has(jobId);
      if (result && result.videoUrl) {
        db.updateJob(jobId, { videoUrl: result.videoUrl });
      }
      if (result && Array.isArray(result.steps)) {
        db.addSteps(jobId, result.steps);
      }
      if (result && Array.isArray(result.finalSubtitles)) {
        db.addTranslations(jobId, result.finalSubtitles);
      }
      db.updateJob(jobId, {
        status: cancelled ? 'canceled' : 'succeeded',
        progress: cancelled ? 0 : 100,
        currentStep: cancelled ? '已取消' : '处理完成'
      });
      cancelledJobs.delete(jobId);
    })
    .catch((error) => {
      const cancelled = cancelledJobs.has(jobId) || error.code === 'JOB_CANCELLED';
      console.error(`任务 ${jobId} 处理失败:`, error.message);
      db.updateJob(jobId, {
        status: cancelled ? 'canceled' : 'failed',
        currentStep: cancelled ? '已取消' : '处理失败',
        errorMessage: cancelled ? null : String(error.message || '处理失败').split('\n')[0].slice(0, 200)
      });
      cancelledJobs.delete(jobId);
    });
}

/** 实际处理流程：保留原有步骤与日志，只去掉对 req/res 的依赖 */
async function runTranslationJob(jobId, videoPath, options) {
  const { sourceLanguage, targetLanguage, subtitleStyle: parsedSubtitleStyle } = options;
  const MAX_CHUNK_DURATION = 300; // 5分钟（300秒）

  try {
    throwIfCancelled();
    db.updateJob(jobId, { status: 'running', currentStep: '准备处理' });

        // 确保临时目录存在
        fileManager.ensureTempDir();
        
        const outputPath = fileManager.getTempFilePath(Date.now() + '_output.mp4');
        const finalSubtitlePath = fileManager.getTempFilePath(Date.now() + '_final.srt');
        
        console.log('开始处理视频翻译...');
        console.log(`视频路径: ${videoPath}`);
        
        // 发送开始处理的进度信息
        sendProgress('准备上传', 0, '开始处理视频翻译');
        
        // 获取视频时长
        const videoDuration = await getVideoDuration(videoPath);
        console.log(`视频时长: ${videoDuration} 秒`);
        throwIfCancelled();
        
        // 判断是否需要分割
        if (videoDuration <= MAX_CHUNK_DURATION) {
          console.log('视频时长较短，使用标准流程处理');
          
          // 标准流程：直接处理整个视频
          throwIfCancelled();
          const audioPath = fileManager.getTempFilePath(Date.now() + '.wav');
          const subtitlePath = fileManager.getTempFilePath(Date.now() + '.srt');
          
          // 步骤状态跟踪
          const steps = [];
          
          // 提取音频
          try {
            sendProgress('音频提取', 15, '开始提取音频');
            await extractAudio(videoPath, audioPath);
            sendProgress('音频提取', 25, '音频提取成功');
            steps.push({ name: 'audio_extraction', status: 'success', message: '音频提取成功' });
          } catch (error) {
            sendProgress('音频提取', 15, `音频提取失败: ${error.message}`);
            steps.push({ name: 'audio_extraction', status: 'failed', message: `音频提取失败: ${error.message}` });
            throw error;
          }

          // 步骤1：语音识别生成带时间轴的字幕
          let subtitles;
          try {
            sendProgress('语音识别', 30, '开始语音识别');
            subtitles = await speechToTextWithTimestamps(audioPath, sourceLanguage);
            sendProgress('语音识别', 40, `字幕生成成功，生成${subtitles.length}个字幕片段`);
            try {
              const chars = subtitles.reduce((sum, item) => sum + String(item.text || '').length, 0);
              db.recordUsage(currentJobId(), 'volc', 'asr', chars, 'seedasr');
            } catch (error) {
              console.error('记录识别用量失败:', error.message);
            }
            steps.push({ name: 'speech_recognition', status: 'success', message: `字幕生成成功，生成${subtitles.length}个字幕片段` });
          } catch (error) {
            sendProgress('语音识别', 30, `字幕生成失败: ${error.message}`);
            steps.push({ name: 'speech_recognition', status: 'failed', message: `字幕生成失败: ${error.message}` });
            throw error;
          }

          // 合并所有识别文本用于翻译
          const fullText = subtitles.map(s => s.text).join(' ');

          // 步骤2：逐句翻译，保留ASR时间轴
          let finalSubtitles = null;
          try {
            sendProgress('翻译处理', 45, '开始逐句翻译');
            finalSubtitles = await translateSubtitlesWithLLM(subtitles, targetLanguage, sourceLanguage);
            finalSubtitles = await refineSubtitleTiming(audioPath, finalSubtitles);
            sendProgress('翻译处理', 65, `翻译成功，共${finalSubtitles.length}条`);
            steps.push({ name: 'translation', status: 'success', message: `逐句翻译成功，共${finalSubtitles.length}条` });
          } catch (error) {
            sendProgress('翻译处理', 45, `翻译失败: ${error.message}`);
            steps.push({ name: 'translation', status: 'failed', message: `翻译失败: ${error.message}` });
            throw error;
          }

          // 生成字幕
          try {
            sendProgress('字幕生成', 80, '开始生成字幕文件');
            generateSubtitleWithTimestamps(finalSubtitles, subtitlePath);
            sendProgress('字幕生成', 85, '字幕文件生成成功');
            steps.push({ name: 'subtitle_generation', status: 'success', message: '字幕文件生成成功' });
          } catch (error) {
            sendProgress('字幕生成', 80, `字幕文件生成失败: ${error.message}`);
            steps.push({ name: 'subtitle_generation', status: 'failed', message: `字幕文件生成失败: ${error.message}` });
            throw error;
          }

          // 合成字幕到视频
          try {
            sendProgress('视频合成', 90, '开始视频合成');
            await addSubtitleToVideo(videoPath, subtitlePath, outputPath, parsedSubtitleStyle);
            sendProgress('视频合成', 95, '视频合成成功');
            steps.push({ name: 'video_synthesis', status: 'success', message: '视频合成成功' });
          } catch (error) {
            sendProgress('视频合成', 90, `视频合成失败: ${error.message}`);
            steps.push({ name: 'video_synthesis', status: 'failed', message: `视频合成失败: ${error.message}` });
            throw error;
          }

          // 清理中间产物；原始视频保留，供失败重试使用（由定时清理负责回收）
          await safeUnlink(audioPath);
          await safeUnlink(subtitlePath);

          return {
            success: true,
            originalText: fullText,
            translatedText: finalSubtitles.map(s => s.text).join(' '),
            originalSubtitles: subtitles,
            finalSubtitles: finalSubtitles,
            videoUrl: `/uploads/${path.basename(outputPath)}`,
            processedInChunks: false,
            steps: steps
          };
          
        } else {
          // 长视频：需要分割处理
          console.log(`视频时长 ${videoDuration} 秒超过阈值 ${MAX_CHUNK_DURATION} 秒，启用分割处理`);
          
          // 步骤状态跟踪
          const steps = [];
          
          // 步骤1：分割视频
          console.log('分割视频...');
          sendProgress('视频分割', 20, '开始分割视频');
          let chunkPaths;
          try {
            chunkPaths = await splitVideoIntoChunks(videoPath, MAX_CHUNK_DURATION);
            console.log(`生成 ${chunkPaths.length} 个视频片段`);
            sendProgress('视频分割', 30, `视频分割成功，生成${chunkPaths.length}个片段`);
            steps.push({ name: 'video_splitting', status: 'success', message: `视频分割成功，生成${chunkPaths.length}个片段` });
          } catch (error) {
            sendProgress('视频分割', 20, `视频分割失败: ${error.message}`);
            steps.push({ name: 'video_splitting', status: 'failed', message: `视频分割失败: ${error.message}` });
            throw error;
          }
          
          // 步骤2：串行处理每个视频片段（避免API限流）
          console.log('开始处理视频片段...');
          sendProgress('片段处理', 40, `开始处理${chunkPaths.length}个视频片段`);
          const chunkResults = [];
          
          for (let i = 0; i < chunkPaths.length; i++) {
            throwIfCancelled();
            const chunkPath = chunkPaths[i];
            console.log(`处理片段 ${i + 1}/${chunkPaths.length}: ${path.basename(chunkPath)}`);
            try {
              const result = await processVideoChunk(chunkPath, sourceLanguage, targetLanguage, parsedSubtitleStyle);
              chunkResults.push(result);
              console.log(`✅ 片段 ${i + 1} 处理成功`);
              const currentProgress = 40 + (50 * (i + 1) / chunkPaths.length);
              sendProgress('片段处理', Math.min(currentProgress, 90), `处理片段 ${i + 1}/${chunkPaths.length} 成功`);
            } catch (error) {
              console.error(`❌ 片段 ${i + 1} 处理失败:`, error.message);
            }
          }

          if (chunkResults.length === 0) {
            sendProgress('片段处理', 50, '所有视频片段处理失败');
            steps.push({ name: 'chunk_processing', status: 'failed', message: '所有视频片段处理失败' });
            throw new Error('所有视频片段处理失败');
          }
          
          console.log(`成功处理 ${chunkResults.length}/${chunkPaths.length} 个视频片段`);
          sendProgress('片段处理', 90, `视频片段处理完成，成功${chunkResults.length}/${chunkPaths.length}个片段`);
          steps.push({ name: 'chunk_processing', status: 'success', message: `视频片段处理完成，成功${chunkResults.length}/${chunkPaths.length}个片段` });
          
          // 步骤3：合并处理后的视频片段
          console.log('合并视频片段...');
          sendProgress('视频合并', 92, '开始合并视频片段');
          let processedVideoPaths;
          try {
            processedVideoPaths = chunkResults.map(result => result.videoPath);
            await mergeVideoChunks(processedVideoPaths, outputPath);
            sendProgress('视频合并', 94, '视频片段合并成功');
            steps.push({ name: 'video_merging', status: 'success', message: '视频片段合并成功' });
          } catch (error) {
            sendProgress('视频合并', 92, `视频片段合并失败: ${error.message}`);
            steps.push({ name: 'video_merging', status: 'failed', message: `视频片段合并失败: ${error.message}` });
            throw error;
          }
          
          // 步骤4：合并字幕数据并调整时间轴
          console.log('合并字幕数据...');
          sendProgress('字幕合并', 96, '开始合并字幕数据');
          let mergedSubtitles;
          try {
            mergedSubtitles = mergeSubtitleData(chunkResults);
            sendProgress('字幕合并', 98, `字幕数据合并成功，共${mergedSubtitles.length}个字幕片段`);
            steps.push({ name: 'subtitle_merging', status: 'success', message: `字幕数据合并成功，共${mergedSubtitles.length}个字幕片段` });
          } catch (error) {
            sendProgress('字幕合并', 96, `字幕数据合并失败: ${error.message}`);
            steps.push({ name: 'subtitle_merging', status: 'failed', message: `字幕数据合并失败: ${error.message}` });
            throw error;
          }
          
          // 生成最终字幕文件
          try {
            generateSubtitleWithTimestamps(mergedSubtitles, finalSubtitlePath);
            steps.push({ name: 'final_subtitle_generation', status: 'success', message: '最终字幕文件生成成功' });
          } catch (error) {
            steps.push({ name: 'final_subtitle_generation', status: 'failed', message: `最终字幕文件生成失败: ${error.message}` });
            throw error;
          }
          
          // 步骤5：合成最终字幕到合并后的视频（可选，因为每个片段已经包含字幕）
          // 注意：由于每个片段已经包含字幕，合并后的视频自然包含所有字幕
          // 这里我们不再重复合成字幕，直接使用合并后的视频
          
          // 步骤6：清理临时文件
          console.log('清理临时文件...');
          
          // 清理视频片段文件（原始和处理后的）
          const allChunkFiles = [...chunkPaths, ...processedVideoPaths];
          for (const file of allChunkFiles) {
            await safeUnlink(file);
          }
          
          // 合并原始文本和翻译文本
          const allOriginalText = chunkResults.map(r => r.originalText).join(' ');
          const allTranslatedText = chunkResults.map(r => r.translatedText).join(' ');
          
          return {
            success: true,
            originalText: allOriginalText,
            translatedText: allTranslatedText,
            proofreadFeedback: null, // 分段处理中校准可能不适用
            proofreadError: '分段处理中跳过校准步骤',
            proofreadCorrected: false,
            autoAlignError: null,
            autoAlignSuccess: true, // 每个片段都进行了自动打轴
            originalSubtitles: [], // 分段处理中没有统一的原始字幕
            finalSubtitles: mergedSubtitles,
            videoUrl: `/uploads/${path.basename(outputPath)}`,
            processedInChunks: true,
            chunkCount: chunkPaths.length,
            successfulChunks: chunkResults.length,
            steps: steps
          };
        }
        
  } catch (error) {
    console.error('视频翻译处理失败:', error);
    // 保留原始视频，便于用户重试；24 小时清理任务会回收
    throw error;
  }
}

// ---------- 任务查询接口 ----------
app.get('/api/jobs', (req, res) => {
  const status = ['pending', 'running', 'succeeded', 'failed', 'canceled', 'canceling'].includes(req.query.status)
    ? req.query.status
    : null;
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  res.json({
    success: true,
    jobs: db.listJobs({ limit, offset, status }),
    total: db.countJobs(status),
    limit,
    offset
  });
});

app.delete('/api/jobs/:id', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  if (['pending', 'running', 'canceling'].includes(job.status)) {
    return res.status(409).json({ success: false, error: '任务进行中，请先取消' });
  }
  cancelledJobs.delete(job.id);
  db.deleteJob(job.id);
  res.json({ success: true, id: job.id });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  res.json({ success: true, job });
});

app.get('/api/jobs/:id/render', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  res.json({
    success: true,
    render_status: job.render_status || 'idle',
    render_error: job.render_error || null,
    video_url: job.video_url || null
  });
});

app.post('/api/jobs/:id/render', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  if (job.status !== 'succeeded') {
    return res.status(409).json({ success: false, error: '只有已完成的任务可以重新合成' });
  }
  if (renderingJobs.has(job.id)) {
    return res.status(409).json({ success: false, error: '正在合成中，请稍候' });
  }
  if (!job.source_path || !fs.existsSync(job.source_path)) {
    return res.status(409).json({ success: false, error: '源视频已被清理，请重新上传后再合成' });
  }
  const subtitles = db.listSubtitles(job.id);
  if (subtitles.length === 0) {
    return res.status(400).json({ success: false, error: '暂无字幕，无法合成' });
  }

  renderingJobs.add(job.id);
  db.setRenderStatus(job.id, 'running');
  res.status(202).json({ success: true, render_status: 'running' });

  (async () => {
    try {
      const subtitlePath = fileManager.getTempFilePath(`${Date.now()}_edited.srt`);
      const outputPath = fileManager.getTempFilePath(`${Date.now()}_edited.mp4`);
      const timedSubtitles = subtitles.map((item) => ({
        start_time: Number(item.start_ms) || 0,
        end_time: Number(item.end_ms) || 0,
        text: item.translated_text || item.source_text || ''
      }));
      generateSubtitleWithTimestamps(timedSubtitles, subtitlePath);
      let renderStyle = null;
      try {
        renderStyle = job.subtitle_style ? JSON.parse(job.subtitle_style) : null;
      } catch (error) {
        renderStyle = null;
      }
      await addSubtitleToVideo(job.source_path, subtitlePath, outputPath, normalizeStyle(renderStyle));
      await safeUnlink(subtitlePath);
      db.updateJob(job.id, { videoUrl: `/uploads/${path.basename(outputPath)}` });
      db.setRenderStatus(job.id, 'done');
      try {
        db.recordUsage(job.id, 'ffmpeg', 'render', 0, 'ffmpeg');
      } catch (error) {
        console.error('记录合成用量失败:', error.message);
      }
      console.log(`任务 ${job.id} 字幕重新合成完成`);
    } catch (error) {
      console.error(`任务 ${job.id} 重新合成失败:`, error.message);
      db.setRenderStatus(job.id, 'failed', String(error.message || '合成失败').split('\n')[0].slice(0, 200));
    } finally {
      renderingJobs.delete(job.id);
    }
  })();
});

app.put('/api/jobs/:id/style', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  const style = normalizeStyle(req.body && req.body.style);
  db.updateJob(job.id, { subtitleStyle: JSON.stringify(style) });
  res.json({ success: true, style });
});

app.put('/api/jobs/:id/subtitles', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }

  const expectedVersion = req.body && req.body.expected_version;
  if (expectedVersion && job.subtitles_updated_at && expectedVersion !== job.subtitles_updated_at) {
    return res.status(409).json({
      success: false,
      error: '字幕已被其他窗口修改，请刷新后重试',
      version: job.subtitles_updated_at,
      subtitles: db.listSubtitles(job.id)
    });
  }

  const incoming = req.body && req.body.subtitles;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return res.status(400).json({ success: false, error: '至少保留一条字幕' });
  }
  if (incoming.length > 2000) {
    return res.status(400).json({ success: false, error: '字幕条数超过上限（2000）' });
  }

  const cleaned = [];
  for (let index = 0; index < incoming.length; index += 1) {
    const item = incoming[index] || {};
    const start = Number(item.start_ms);
    const end = Number(item.end_ms);
    const text = String(item.translated_text || '').trim();
    const label = `第 ${index + 1} 条`;

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return res.status(400).json({ success: false, error: `${label}时间码无效` });
    }
    if (start < 0) {
      return res.status(400).json({ success: false, error: `${label}开始时间不能为负` });
    }
    if (end <= start) {
      return res.status(400).json({ success: false, error: `${label}结束时间必须晚于开始时间` });
    }
    if (!text) {
      return res.status(400).json({ success: false, error: `${label}译文不能为空` });
    }

    cleaned.push({
      start_ms: Math.round(start),
      end_ms: Math.round(end),
      translated_text: text,
      source_text: item.source_text || null
    });
  }

  cleaned.sort((a, b) => a.start_ms - b.start_ms);

  let adjusted = 0;
  for (let index = 0; index < cleaned.length - 1; index += 1) {
    if (cleaned[index].end_ms > cleaned[index + 1].start_ms) {
      cleaned[index].end_ms = Math.max(cleaned[index].start_ms + 100, cleaned[index + 1].start_ms - 50);
      adjusted += 1;
    }
  }

  try {
    const subtitles = db.replaceSubtitles(job.id, cleaned);
    const updated = db.getJob(job.id);
    res.json({ success: true, subtitles, adjusted, version: updated ? updated.subtitles_updated_at : null });
  } catch (error) {
    console.error('保存字幕失败:', error);
    res.status(500).json({ success: false, error: '保存字幕失败' });
  }
});

app.get('/api/jobs/:id/downloads', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  res.json({ success: true, downloads: db.listDownloads(job.id) });
});

app.get('/api/jobs/:id/subtitles', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  res.json({ success: true, jobId: job.id, version: job.subtitles_updated_at || null, subtitles: db.listSubtitles(job.id) });
});

app.get('/api/jobs/:id/subtitles.srt', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  const subtitles = db.listSubtitles(job.id);
  if (subtitles.length === 0) {
    return res.status(404).send('暂无字幕');
  }
  const content = subtitles
    .map((item, index) => {
      const start = formatTime(Number(item.start_ms) || 0);
      const end = formatTime(Number(item.end_ms) || 0);
      const text = item.translated_text || item.source_text || '';
      return `${index + 1}\n${start} --> ${end}\n${text}\n`;
    })
    .join('\n');
  try {
    db.recordDownload(job.id, 'srt', `subtitle-${job.id.slice(0, 8)}.srt`);
  } catch (error) {
    console.error('记录字幕下载失败:', error.message);
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="subtitle-${job.id.slice(0, 8)}.srt"`);
  res.send(content);
});

app.post('/api/jobs/:id/cancel', (req, res) => {
  const jobId = req.params.id;
  const job = db.getJob(jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  if (!['pending', 'running', 'canceling'].includes(job.status)) {
    return res.status(409).json({ success: false, error: '任务已结束，无法取消' });
  }
  cancelledJobs.add(jobId);
  db.updateJob(jobId, { status: 'canceling', currentStep: '取消中' });
  res.json({ success: true, jobId, status: 'canceling' });
});


app.post('/api/jobs/:id/retry', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  if (!['failed', 'canceled'].includes(job.status)) {
    return res.status(409).json({ success: false, error: '只有失败或已取消的任务可以重试' });
  }
  if (!job.source_path || !fs.existsSync(job.source_path)) {
    return res.status(409).json({ success: false, error: '原始文件已被清理，请重新上传' });
  }

  const jobId = crypto.randomUUID();
  db.createJob({
    id: jobId,
    filename: job.filename,
    fileSize: job.file_size,
    sourcePath: job.source_path,
    sourceLanguage: job.source_language,
    targetLanguage: job.target_language
  });
  enqueueTranslateJob(jobId, job.source_path, {
    sourceLanguage: job.source_language,
    targetLanguage: job.target_language,
    subtitleStyle: null
  });

  res.status(202).json({ success: true, jobId, retryOf: job.id });
});

// 安全解析临时目录内的文件名，阻止 ../、..\\ 造成的目录穿越
const resolveTempFile = (rawName) => {
  const root = path.resolve(fileManager.tempDir);
  const resolved = path.resolve(root, path.basename(String(rawName || '')));
  if (resolved === root || !resolved.startsWith(root + path.sep)) return null;
  return resolved;
};

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    queue: {
      running: taskQueue.getRunningCount(),
      waiting: taskQueue.getQueueSize()
    }
  });
});

// 提供翻译后的视频预览，不删除文件
app.get('/preview/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = resolveTempFile(filename);
  if (!filePath) return res.status(400).send('Invalid file name');
  
  console.log(`预览请求: ${filename}, 文件路径: ${filePath}, 临时目录: ${fileManager.tempDir}`);
  
  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    console.log(`文件不存在: ${filePath}`);
    return res.status(404).send('File not found');
  }
  
  // 设置视频流媒体头
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // 发送文件但不删除，用于预览
  res.sendFile(filePath);
});

// 提供翻译后的视频下载，下载后删除文件
app.get('/uploads/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = resolveTempFile(filename);
  if (!filePath) return res.status(400).send('Invalid file name');
  
  console.log(`下载请求: ${filename}, 文件路径: ${filePath}, 临时目录: ${fileManager.tempDir}`);
  
  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    console.log(`文件不存在: ${filePath}`);
    return res.status(404).send('File not found');
  }
  
  // 记录下载（用于「下载记录」展示）
  try {
    const jobId = db.jobIdForVideo(filename);
    if (jobId) db.recordDownload(jobId, 'video', filename);
  } catch (error) {
    console.error('记录视频下载失败:', error.message);
  }

  // 直接下载，不在下载后删除：文件由 24 小时/1GB 清理策略回收
  res.download(filePath, filename, (err) => {
    if (err) {
      console.error('下载失败:', err);
    }
  });
});

// 导出辅助函数供测试使用
module.exports = {
  TaskQueue,
  ResourceManager,
  resolveTempFile,
  app,
  server,
  getVideoDuration,
  splitVideoIntoChunks,
  mergeVideoChunks,
  adjustSubtitlesTimestamps,
  segmentLongSubtitle,
  refineSubtitleTiming,
  processVideoChunk,
  mergeSubtitleData,
  translateSubtitlesWithLLM,
  extractAudio,
  speechToTextWithTimestamps,
  translateTextWithVolc,
  proofreadTranslation,
  alignSubtitlesWithAudio,
  generateSubtitleWithTimestamps,
  addSubtitleToVideo
};

// 启动服务器（仅在被直接运行时启动，便于测试中安全地 require）
if (require.main === module) {
  server.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
    console.log('使用火山引擎API配置（新版控制台）:');
    console.log('- 语音识别: OpenSpeech ASR API (带时间轴字幕生成)');
    console.log('- 翻译: 火山引擎机器翻译API (新版控制台，使用X-Api-Key)');
    console.log('- 校准: 豆包对话模型 (使用X-Api-Key)');
    console.log('API Key: ' + (VOLC_API_KEY ? '已配置（长度 ' + VOLC_API_KEY.length + '，不在日志中输出）' : '未配置'));
    console.log('注意: 所有API使用新版控制台认证格式 (X-Api-Key)');
    console.log(`后端服务可通过 http://localhost:${port} 访问`);
    console.log(`或通过IP地址访问: http://172.22.16.1:${port}`);
    console.log(`WebSocket服务可通过 ws://localhost:${port} 访问`);
  });
}