const path = require('path');
const fs = require('fs');

// 导入需要的函数（直接从server.js复制或重构）
// 这里我们直接测试分割和合并功能

console.log('=== 测试视频分割与合并功能 ===');

// 使用现有的视频文件进行测试
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
  console.error('❌ uploads目录不存在');
  process.exit(1);
}

// 查找最新的MP4视频文件
const mp4Files = fs.readdirSync(uploadsDir)
  .filter(file => file.endsWith('.mp4') && !file.includes('_output') && !file.includes('_chunk'))
  .map(file => ({
    name: file,
    path: path.resolve(uploadsDir, file),
    mtime: fs.statSync(path.resolve(uploadsDir, file)).mtime
  }))
  .sort((a, b) => b.mtime - a.mtime);

if (mp4Files.length === 0) {
  console.error('❌ uploads目录中没有测试视频文件');
  process.exit(1);
}

const testVideoPath = mp4Files[0].path;
console.log(`使用测试视频: ${path.basename(testVideoPath)}`);

// 测试1：获取视频时长
async function testGetVideoDuration() {
  console.log('\n--- 测试1：获取视频时长 ---');
  try {
    // 动态导入server.js中的函数
    const serverModule = require('./server.js');
    // 注意：我们需要访问getVideoDuration函数，但它可能不是导出的
    // 这里我们直接复制函数逻辑
    const ffmpeg = require('fluent-ffmpeg');
    
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(testVideoPath, (err, metadata) => {
        if (err) {
          reject(new Error(`无法获取视频时长: ${err.message}`));
        } else {
          const duration = metadata.format.duration;
          console.log(`✅ 视频时长: ${duration} 秒`);
          resolve(duration);
        }
      });
    });
  } catch (error) {
    console.error('❌ 获取视频时长失败:', error.message);
    throw error;
  }
}

// 测试2：分割视频
async function testSplitVideo() {
  console.log('\n--- 测试2：分割视频 ---');
  try {
    // 动态导入server.js中的函数
    const { splitVideoIntoChunks } = require('./server.js');
    
    // 设置较小的分割阈值（10秒），以便测试分割功能
    const chunkDuration = 10; // 10秒
    console.log(`分割阈值: ${chunkDuration} 秒`);
    
    const chunkPaths = await splitVideoIntoChunks(testVideoPath, chunkDuration);
    console.log(`✅ 生成 ${chunkPaths.length} 个视频片段`);
    
    // 验证片段文件是否存在
    for (const chunkPath of chunkPaths) {
      if (fs.existsSync(chunkPath)) {
        console.log(`  片段存在: ${path.basename(chunkPath)}`);
      } else {
        console.error(`  片段不存在: ${chunkPath}`);
      }
    }
    
    return chunkPaths;
  } catch (error) {
    console.error('❌ 分割视频失败:', error.message);
    throw error;
  }
}

// 测试3：合并视频
async function testMergeVideo(chunkPaths) {
  console.log('\n--- 测试3：合并视频 ---');
  try {
    const { mergeVideoChunks } = require('./server.js');
    
    const outputPath = path.join(uploadsDir, `test_merged_${Date.now()}.mp4`);
    console.log(`输出路径: ${outputPath}`);
    
    await mergeVideoChunks(chunkPaths, outputPath);
    
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log(`✅ 视频合并成功，文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      
      // 清理合并后的测试文件
      fs.unlinkSync(outputPath);
      console.log('清理合并测试文件');
    } else {
      console.error('❌ 合并后的视频文件不存在');
    }
    
    return outputPath;
  } catch (error) {
    console.error('❌ 合并视频失败:', error.message);
    throw error;
  }
}

// 测试4：清理临时文件
function testCleanup(chunkPaths) {
  console.log('\n--- 测试4：清理临时文件 ---');
  let cleanedCount = 0;
  
  for (const chunkPath of chunkPaths) {
    try {
      if (fs.existsSync(chunkPath)) {
        fs.unlinkSync(chunkPath);
        cleanedCount++;
      }
    } catch (error) {
      console.warn(`清理文件失败 ${path.basename(chunkPath)}: ${error.message}`);
    }
  }
  
  console.log(`✅ 清理 ${cleanedCount} 个临时文件`);
}

// 运行所有测试
async function runAllTests() {
  try {
    console.log('开始视频分割与合并测试...');
    
    // 测试1：获取视频时长
    const duration = await testGetVideoDuration();
    
    // 只有当视频时长大于5秒时才进行分割测试（避免太短的视频）
    if (duration < 5) {
      console.log('⚠️ 视频时长太短（<5秒），跳过分割测试');
      console.log('✅ 所有测试完成（部分跳过）');
      return;
    }
    
    // 测试2：分割视频
    const chunkPaths = await testSplitVideo();
    
    if (chunkPaths.length === 0) {
      console.log('⚠️ 没有生成视频片段，跳过合并测试');
      return;
    }
    
    // 测试3：合并视频
    await testMergeVideo(chunkPaths);
    
    // 测试4：清理临时文件
    testCleanup(chunkPaths);
    
    console.log('\n🎉 所有测试通过！视频分割与合并功能正常');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    process.exit(1);
  }
}

runAllTests().catch(console.error);