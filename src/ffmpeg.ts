import { parentPort, isMainThread } from 'worker_threads';
import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { Logger } from 'koishi';

const logger = new Logger('yunhu-ffmpeg');

// FFmpeg 任务类型
export type FfmpegTaskType = 'compress-video' | 'extract-thumbnail' | 'convert-audio';

// FFmpeg 任务参数
export interface FfmpegTask {
  type: FfmpegTaskType;
  input: string | Buffer;
  outputPath?: string;
  options?: any;
  taskId?: string; // 添加任务ID用于追踪
}

// FFmpeg 任务结果
export interface FfmpegResult {
  success: boolean;
  output?: Buffer;
  error?: string;
  metrics?: {
    originalSize?: number;
    compressedSize?: number;
    duration?: number;
  };
  taskId?: string; // 添加任务ID用于追踪
}

// 工作线程入口
if (!isMainThread) {
  // 设置错误处理
  process.on('uncaughtException', (err) => {
    logger.error(`工作线程未捕获异常: ${err.message}`);
    parentPort?.postMessage({
      success: false,
      error: `未捕获异常: ${err.message}`
    });
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(`工作线程未处理拒绝: ${reason}`);
    parentPort?.postMessage({
      success: false,
      error: `未处理拒绝: ${reason}`
    });
  });

  // 监听消息
  parentPort?.on('message', async (task: FfmpegTask) => {
    try {
      logger.info(`收到新任务: ${task.type}, ID: ${task.taskId}`);
      
      let result: FfmpegResult;
      switch (task.type) {
        case 'compress-video':
          result = await compressVideo(task.input, task.options);
          break;
        case 'extract-thumbnail':
          result = await extractThumbnail(task.input, task.options);
          break;
        case 'convert-audio':
          result = await convertAudio(task.input, task.options);
          break;
        default:
          throw new Error(`未知的 FFmpeg 任务类型: ${task.type}`);
      }
      
      // 添加任务ID到结果
      result.taskId = task.taskId;
      parentPort?.postMessage(result);
    } catch (error) {
      logger.error(`任务处理失败: ${error.message}`);
      parentPort?.postMessage({
        success: false,
        error: error.message,
        taskId: task.taskId
      });
    }
  });
  
  logger.info('FFmpeg 工作线程已启动，等待任务...');
}

/**
 * 处理 FFmpeg 任务
 * @param task 任务对象
 * @returns 处理结果
 */
export async function processFfmpegTask(task: FfmpegTask): Promise<FfmpegResult> {
  try {
    let result: FfmpegResult;
    switch (task.type) {
      case 'compress-video':
        result = await compressVideo(task.input, task.options);
        // 检查压缩后大小是否超限
        if (result.success && result.output && task.options?.maxSize) {
          if (result.output.length > task.options.maxSize) {
            logger.error(`压缩后视频大小: ${(result.output.length / 1024 / 1024).toFixed(2)}MB 超过限制: ${(task.options.maxSize / 1024 / 1024).toFixed(2)}MB`);
            return {
              success: false,
              error: `压缩后视频大小${(result.output.length / 1024 / 1024).toFixed(2)}MB超过${(task.options.maxSize / 1024 / 1024).toFixed(2)}MB限制`,
              metrics: result.metrics
            };
          }
        }
        return result;
      case 'extract-thumbnail':
        return await extractThumbnail(task.input, task.options);
      case 'convert-audio':
        return await convertAudio(task.input, task.options);
      default:
        throw new Error(`未知的 FFmpeg 任务类型: ${task.type}`);
    }
  } catch (error) {
    logger.error(`FFmpeg 任务处理失败: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

async function getOriginalBitrate(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      resolve(parseInt(videoStream.bit_rate) / 1000 || 1000); // 返回kbps
    });
  });
}

/**
 * 压缩视频
 * @param input 输入视频 (Buffer 或文件路径)
 * @param options 压缩选项
 * @returns 压缩结果
 */

async function compressVideo(input: string | Buffer | Uint8Array, options: any): Promise<FfmpegResult> {
  const { maxSize = 20 * 1024 * 1024 } = options;
  // 确保输入有效
  if (!input) {
    throw new Error('视频压缩错误: 未指定输入');
  }
  
  // 处理可能的 Uint8Array 输入
  if (input instanceof Uint8Array && !Buffer.isBuffer(input)) {
    input = Buffer.from(input);
  }
  
  if (Buffer.isBuffer(input) && input.length === 0) {
    throw new Error('视频压缩错误: 输入Buffer为空');
  }
  
  logger.info(`开始视频压缩任务，输入类型: ${typeof input}`);
  if (Buffer.isBuffer(input)) {
    logger.info(`输入Buffer大小: ${input.length} 字节`);
  } else {
    logger.info(`输入文件路径: ${input}`);
  }

  // 如果是 Buffer 或 Uint8Array，保存到临时文件
  let inputPath: string;
  let isTempFile = false;
  
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    const tempDir = os.tmpdir();
    inputPath = path.join(tempDir, `temp-video-${Date.now()}.mp4`);
    
    try {
      logger.info(`将Buffer写入临时文件: ${inputPath}`);
      await fs.writeFile(inputPath, input);
      
      // 验证文件是否写入成功
      const stats = await fs.stat(inputPath);
      if (stats.size === 0) {
        throw new Error('临时文件写入失败，文件大小为0');
      }
      logger.info(`临时文件写入成功，大小: ${stats.size} 字节`);
      
      isTempFile = true;
    } catch (writeError) {
      logger.error(`写入临时文件失败: ${writeError.message}`);
      throw new Error(`无法创建临时视频文件: ${writeError.message}`);
    }
  } else {
    inputPath = input;
    
    // 验证文件是否存在
    try {
      await fs.access(inputPath);
      const stats = await fs.stat(inputPath);
      if (stats.size === 0) {
        throw new Error('输入文件为空');
      }
    } catch (accessError) {
      logger.error(`无法访问输入文件: ${accessError.message}`);
      throw new Error(`输入文件不存在或不可访问: ${inputPath}`);
    }
  }

  try {
    // 获取原始视频信息 - 增加错误处理
  let metadata: { size: number; duration: number; bit_rate: number };
  try {
    metadata = await getVideoMetadata(inputPath);
    logger.info(`视频元数据: 大小=${metadata.size} 字节, 时长=${metadata.duration} 秒`);
  } catch (metaError: any) {
    logger.error(`获取视频元数据失败: ${metaError.message}`);
    throw new Error('无法解析视频文件，可能格式不受支持');
  }
  
  const originalSize = metadata.size;
  const duration = metadata.duration || 60; // 默认60秒
  const bit_rate = metadata.bit_rate;

  // 计算目标比特率 (kbps)
  const targetBitrate = Math.min(
    Math.floor((maxSize * 8) / (metadata.duration * 1024) * 0.7), // 70%的安全余量
    await getOriginalBitrate(inputPath) * 0.5 // 不超过原始比特率的50%
  );
  
  // 创建输出路径
  const outputPath = path.join(os.tmpdir(), `compressed-video-${Date.now()}.mp4`);
  
  // 检查 libx264 是否可用，否则使用 mpeg4 作为回退
  const videoCodec = 'libx265';
  let codecAvailable = true;
  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .addInput(inputPath)
        .videoCodec(videoCodec)
        .on('error', () => reject())
        .on('end', () => resolve())
        .outputOptions('-frames:v', '1')
        .outputOptions('-f', 'null')
        .saveToFile(os.tmpdir() + `/probe-${Date.now()}.null`);
    });
  } catch {
    codecAvailable = false;
    logger.warn('libx265 不可用，使用 mpeg4 作为回退');
  }

  // 执行压缩
  await new Promise<void>((resolve, reject) => {
    let lastPercent = 0;
    ffmpeg(inputPath)
      .videoCodec(codecAvailable ? 'libx265' : 'mpeg4')
      .videoBitrate(targetBitrate)
      .outputOptions('-preset', 'slower')
      .outputOptions('-movflags', 'faststart')
      .outputOptions('-maxrate', `${targetBitrate}k`)
      .outputOptions('-bufsize', `${targetBitrate * 2}k`)
      .outputOptions("-crf", "20")
      .size('?x360') // 最大高度360p，保持宽高比
      .audioCodec('aac')
      .audioBitrate('64k')
      .outputOptions('-y') // 覆盖输出
      .on('start', (commandLine) => {
        logger.info(`启动视频压缩: ${commandLine}`);
      })
      .on('progress', (progress) => {
        // progress.percent 可能为 undefined，需判断
        if (progress.percent !== undefined) {
          const percent = Math.floor(progress.percent);
          if (percent !== lastPercent) {
            lastPercent = percent;
            logger.info(`视频压缩进度: ${percent}%`);
          }
        }
      })
      .on('end', () => {
        logger.info('视频压缩完成');
        resolve();
      })
      .on('error', (err) => {
        logger.error('视频压缩失败:', err.message);
        reject(err);
      })
      .save(outputPath);
  });
    
    // 读取压缩后的视频
    const compressedBuffer = await fs.readFile(outputPath);
    const compressedSize = compressedBuffer.length;
    
    // 清理临时文件
    await fs.unlink(outputPath);
    if (isTempFile) await fs.unlink(inputPath);
    
    return {
      success: true,
      output: compressedBuffer,
      metrics: {
        originalSize,
        compressedSize,
        duration
      }
    };
  } catch (error) {
    // 清理临时文件
    if (isTempFile) {
      try {
        await fs.unlink(inputPath);
      } catch (cleanError) {
        logger.warn(`清理临时文件失败: ${cleanError.message}`);
      }
    }
    
    // 记录原始错误
    logger.error(`ffmpeg.ts:视频压缩失败: ${error.message}`);
    
    // 抛出更友好的错误信息
    throw new Error(`ffmpeg.ts:视频压缩失败: ${error.message}`);
  }
}


/**
 * 提取视频缩略图
 * @param input 输入视频 (Buffer 或文件路径)
 * @param options 选项
 * @returns 缩略图结果
 */
async function extractThumbnail(input: string | Buffer, options: any): Promise<FfmpegResult> {
  const { time = '00:00:00' } = options;
  
  // 如果是 Buffer，保存到临时文件
  let inputPath: string;
  let isTempFile = false;
  
  if (Buffer.isBuffer(input)) {
    const tempDir = os.tmpdir();
    inputPath = path.join(tempDir, `temp-video-${Date.now()}.mp4`);
    await fs.writeFile(inputPath, input);
    isTempFile = true;
  } else {
    inputPath = input;
  }
  
  try {
    // 创建输出路径
    const outputPath = path.join(os.tmpdir(), `thumbnail-${Date.now()}.jpg`);
    
    // 执行缩略图提取
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .screenshots({
          timestamps: [time],
          folder: path.dirname(outputPath),
          filename: path.basename(outputPath),
          size: '320x180'
        })
        .on('end', () => {
          logger.info('缩略图提取完成');
          resolve();
        })
        .on('error', (err) => {
          logger.error('缩略图提取失败:', err.message);
          reject(err);
        });
    });
    
    // 读取缩略图
    const thumbnailBuffer = await fs.readFile(outputPath);
    
    // 清理临时文件
    await fs.unlink(outputPath);
    if (isTempFile) await fs.unlink(inputPath);
    
    return {
      success: true,
      output: thumbnailBuffer,
      metrics: {}
    };
  } catch (error) {
    // 清理临时文件
    if (isTempFile) await fs.unlink(inputPath).catch(() => {});
    throw error;
  }
}

/**
 * 转换音频格式
 * @param input 输入音频 (Buffer 或文件路径)
 * @param options 选项
 * @returns 转换结果
 */
async function convertAudio(input: string | Buffer, options: any): Promise<FfmpegResult> {
  const { format = 'mp3', bitrate = '128k' } = options;
  
  // 如果是 Buffer，保存到临时文件
  let inputPath: string;
  let isTempFile = false;
  
  if (Buffer.isBuffer(input)) {
    const tempDir = os.tmpdir();
    inputPath = path.join(tempDir, `temp-audio-${Date.now()}.${format}`);
    await fs.writeFile(inputPath, input);
    isTempFile = true;
  } else {
    inputPath = input;
  }
  
  try {
    // 创建输出路径
    const outputPath = path.join(os.tmpdir(), `converted-audio-${Date.now()}.${format}`);
    
    // 执行音频转换
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioBitrate(bitrate)
        .toFormat(format)
        .on('start', (command) => {
          logger.info(`启动音频转换: ${command}`);
        })
        .on('end', () => {
          logger.info('音频转换完成');
          resolve();
        })
        .on('error', (err) => {
          logger.error('音频转换失败:', err.message);
          reject(err);
        })
        .save(outputPath);
    });
    
    // 读取转换后的音频
    const convertedBuffer = await fs.readFile(outputPath);
    
    // 清理临时文件
    await fs.unlink(outputPath);
    if (isTempFile) await fs.unlink(inputPath);
    
    return {
      success: true,
      output: convertedBuffer,
      metrics: {}
    };
  } catch (error) {
    // 清理临时文件
    if (isTempFile) await fs.unlink(inputPath).catch(() => {});
    throw error;
  }
}

/**
 * 获取视频元数据
 * @param filePath 视频文件路径
 * @returns 元数据
 */
async function getVideoMetadata(filePath: string): Promise<{ size: number; duration: number, bit_rate: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      
      const size = metadata.format.size;
      const duration = metadata.format.duration || 60; // 默认60秒
      const bit_rate = metadata.format.bit_rate
      resolve({ size, duration ,bit_rate });
    });
  });
}