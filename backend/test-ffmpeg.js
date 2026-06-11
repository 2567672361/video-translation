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
} else {
  console.log(`FFmpeg路径已设置: ${ffmpegPath}`);
}

// 测试视频和字幕文件路径（使用现有的文件）
const videoPath = path.resolve('./uploads/1775812814483.mp4');
const subtitlePath = path.resolve('./uploads/test_subtitle.srt');
const outputPath = path.resolve('./uploads/test_output.mp4');

// 创建测试字幕文件
const subtitleContent = `1
00:00:00,000 --> 00:00:05,000
这是一个测试字幕

2
00:00:05,000 --> 00:00:10,000
用于测试FFmpeg字幕合成功能`;

fs.writeFileSync(subtitlePath, subtitleContent, 'utf-8');
console.log(`创建测试字幕文件: ${subtitlePath}`);

// 测试addSubtitleToVideo函数
const addSubtitleToVideo = (videoPath, subtitlePath, outputPath) => {
  return new Promise((resolve, reject) => {
    // 转换路径为绝对路径并使用正斜杠（FFmpeg兼容）
    const absoluteVideoPath = path.resolve(videoPath).replace(/\\/g, '/');
    const absoluteSubtitlePath = path.resolve(subtitlePath).replace(/\\/g, '/');
    const absoluteOutputPath = path.resolve(outputPath).replace(/\\/g, '/');
    
    console.log('视频路径:', absoluteVideoPath);
    console.log('字幕路径:', absoluteSubtitlePath);
    console.log('输出路径:', absoluteOutputPath);
    
    const command = ffmpeg(absoluteVideoPath)
      .output(absoluteOutputPath)
      .outputOptions([
        '-vf', `subtitles='${absoluteSubtitlePath}':force_style='FontSize=24,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=2'`
      ])
      .on('start', (commandLine) => {
        console.log('FFmpeg命令:', commandLine);
      })
      .on('end', () => {
        console.log('FFmpeg处理完成');
        resolve();
      })
      .on('error', (err) => {
        console.error('FFmpeg错误:', err.message);
        reject(err);
      })
      .on('stderr', (stderrLine) => {
        console.log('FFmpeg stderr:', stderrLine);
      });
    
    console.log('开始运行FFmpeg...');
    command.run();
  });
};

// 运行测试
console.log('开始测试FFmpeg字幕合成...');
console.log('视频文件存在:', fs.existsSync(videoPath));
console.log('字幕文件存在:', fs.existsSync(subtitlePath));

addSubtitleToVideo(videoPath, subtitlePath, outputPath)
  .then(() => {
    console.log('✅ 测试成功！输出文件:', outputPath);
    // 清理测试字幕文件
    fs.unlinkSync(subtitlePath);
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 测试失败:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  });