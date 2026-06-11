const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

// 设置FFmpeg路径
const ffmpegExe = 'C:\\ffmpeg-8.1-full_build\\bin\\ffmpeg.exe';
if (fs.existsSync(ffmpegExe)) {
  ffmpeg.setFfmpegPath(ffmpegExe);
  console.log(`FFmpeg路径已设置: ${ffmpegExe}`);
} else {
  console.warn('FFmpeg未找到，尝试使用系统PATH');
}

const videoPath = path.resolve('./uploads/1775812814483.mp4');
const subtitlePath = path.resolve('./uploads/test_subtitle2.srt');
const outputDir = './uploads';

// 创建测试字幕文件
const subtitleContent = `1
00:00:00,000 --> 00:00:05,000
测试字幕

2
00:00:05,000 --> 00:00:10,000
第二行字幕`;

fs.writeFileSync(subtitlePath, subtitleContent, 'utf-8');
console.log(`创建测试字幕文件: ${subtitlePath}`);

// 测试不同的subtitles过滤器语法
const testCases = [
  {
    name: '简单subtitles，无样式',
    filter: `subtitles='${subtitlePath.replace(/\\/g, '/')}'`
  },
  {
    name: 'subtitles不带引号',
    filter: `subtitles=${subtitlePath.replace(/\\/g, '/')}`
  },
  {
    name: 'subtitles带force_style，用双引号',
    filter: `subtitles="${subtitlePath.replace(/\\/g, '/')}":force_style='FontSize=24,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=2'`
  },
  {
    name: 'subtitles带force_style，用转义冒号',
    filter: `subtitles='${subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:')}':force_style='FontSize=24,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=2'`
  },
  {
    name: '使用videoFilters方法',
    useVideoFilters: true,
    filter: {
      filter: 'subtitles',
      options: {
        filename: subtitlePath.replace(/\\/g, '/'),
        force_style: 'FontSize=24,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=2'
      }
    }
  }
];

async function runTest(testCase, index) {
  return new Promise((resolve, reject) => {
    const outputPath = path.resolve(outputDir, `test_output_${index}.mp4`);
    console.log(`\n=== 测试: ${testCase.name} ===`);
    console.log(`输出文件: ${outputPath}`);
    
    const command = ffmpeg(videoPath)
      .output(outputPath);
    
    if (testCase.useVideoFilters) {
      command.videoFilters([testCase.filter]);
    } else {
      command.outputOptions(['-vf', testCase.filter]);
    }
    
    command
      .on('start', (cmdLine) => {
        console.log(`命令: ${cmdLine}`);
      })
      .on('end', () => {
        console.log(`✅ 成功`);
        resolve(true);
      })
      .on('error', (err) => {
        console.log(`❌ 失败: ${err.message}`);
        resolve(false); // 不拒绝，继续下一个测试
      })
      .on('stderr', (line) => {
        if (line.includes('Error') || line.includes('Invalid')) {
          console.log(`FFmpeg stderr: ${line}`);
        }
      })
      .run();
  });
}

async function runAllTests() {
  console.log('开始测试不同的subtitles过滤器语法...');
  console.log(`视频文件: ${videoPath}`);
  console.log(`字幕文件: ${subtitlePath}`);
  
  for (let i = 0; i < testCases.length; i++) {
    await runTest(testCases[i], i);
  }
  
  // 清理测试字幕文件
  fs.unlinkSync(subtitlePath);
  console.log('\n测试完成');
}

runAllTests().catch(console.error);