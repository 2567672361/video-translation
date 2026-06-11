const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

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
  process.exit(1);
} else {
  console.log(`FFmpeg路径已设置: ${ffmpegPath}`);
}

// 测试视频和字幕文件路径
const videoPath = path.resolve('./uploads/1776259851615.mp4'); // 使用现有的视频文件
const subtitlePath = path.resolve('./uploads/test_subtitle.srt');
const outputPath = path.resolve('./uploads/test_output.mp4');

// 创建测试字幕文件
const subtitleContent = `1
00:00:00,000 --> 00:00:05,000
This is a test subtitle

2
00:00:05,000 --> 00:00:10,000
For testing FFmpeg subtitle functionality`;

fs.writeFileSync(subtitlePath, subtitleContent, 'utf-8');
console.log(`创建测试字幕文件: ${subtitlePath}`);

// 检查文件是否存在
console.log('视频文件存在:', fs.existsSync(videoPath));
console.log('字幕文件存在:', fs.existsSync(subtitlePath));

// 转换路径为WSL风格
const wslVideoPath = videoPath.replace(/\\/g, '/');
const wslSubtitlePath = subtitlePath.replace(/\\/g, '/');
const wslOutputPath = outputPath.replace(/\\/g, '/');

console.log('WSL视频路径:', wslVideoPath);
console.log('WSL字幕路径:', wslSubtitlePath);
console.log('WSL输出路径:', wslOutputPath);

// 直接测试FFmpeg命令
console.log('开始测试FFmpeg...');

ffmpeg(wslVideoPath)
  .output(wslOutputPath)
  .outputOptions([
    '-vf', `subtitles='${wslSubtitlePath}':force_style='FontSize=24,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=2'`
  ])
  .on('start', (commandLine) => {
    console.log('FFmpeg命令:', commandLine);
  })
  .on('end', () => {
    console.log('✅ FFmpeg处理完成');
    console.log('输出文件:', outputPath);
    // 清理测试文件
    try {
      fs.unlinkSync(subtitlePath);
      console.log('清理测试字幕文件');
    } catch (error) {
      console.warn('清理测试文件失败:', error.message);
    }
    process.exit(0);
  })
  .on('error', (err) => {
    console.error('❌ FFmpeg错误:', err.message);
    console.error('错误堆栈:', err.stack);
    process.exit(1);
  })
  .on('stderr', (stderrLine) => {
    console.log('FFmpeg stderr:', stderrLine);
  })
  .run();
