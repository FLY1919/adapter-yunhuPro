import { Context, h, HTTP, Dict, Logger } from 'koishi'
import { FormData, File } from 'formdata-node'
import axios, { AxiosRequestConfig } from 'axios'
import * as Types from './types'
import { createHash } from 'crypto';
import { Buffer } from 'buffer';
import { 
  resolveResource, 
  validateImage, 
  compressImage, 
  updateFileExtension,
  ResourceType,
  FormatType,
  getExtension
} from './utils'
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import os from 'os';
import { FfmpegThreadPool } from './thread-pool'; // 从 thread-pool.ts 导入
import { FfmpegTask, FfmpegResult } from './ffmpeg'; // 从 ffmpeg.ts 导入
import YunhuBot from '.';
const logger = new Logger('yunhu')

// 获取CPU核心数，用于确定工作线程数量
const CPU_CORES = os.cpus().length;

const IMAGE_URL = "https://chat-img.jwznb.com/"

// 图片压缩工作线程任务
if (!isMainThread) {
  const { buffer, mimeType, maxSize } = workerData;
  compressImage(buffer, mimeType, maxSize)
    .then(result => parentPort?.postMessage(result))
    .catch(error => parentPort?.postMessage({ error }));
  process.exit(0);
}

// 上传基类
abstract class BaseUploader {
  protected MAX_SIZE: number
  protected ffmpegPool: FfmpegThreadPool

  constructor(
    protected http: HTTP,
    protected token: string,
    protected apiendpoint: string,
    protected resourceType: ResourceType,
    ffmpegPool: FfmpegThreadPool
  ) {
    // 设置不同资源类型的最大大小限制
    this.MAX_SIZE = resourceType === 'image' ? 10 * 1024 * 1024 : 
                  resourceType === 'video' ? 20 * 1024 * 1024 : 
                  100 * 1024 * 1024
    
    this.ffmpegPool = ffmpegPool;
  }

  protected async sendFormData(form: FormData): Promise<string> {
    const uploadUrl = `${this.apiendpoint}/${this.resourceType}/upload?token=${this.token}`
    
    const axiosConfig: AxiosRequestConfig = {
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    }

    try {
      const response = await axios.post(uploadUrl, form, axiosConfig)
      const res = response.data

      if (res.code !== 1) {
        throw new Error(`${this.resourceType}上传失败：${res.msg}，响应码${res.code}`)
      }
      
      logger.info(`${this.resourceType}上传成功: key=${res.data[this.resourceType + 'Key']}`)
      return res.data[this.resourceType + 'Key']
    } catch (error: any) {
      logger.error(`${this.resourceType}上传请求失败:`, error.message)
      if (axios.isAxiosError(error) && error.response) {
        logger.error(`Axios响应状态: ${error.response.status}`)
        logger.error(`Axios响应体:`, error.response.data)
      }
      throw new Error(`${this.resourceType}上传失败：${error.message}`)
    }
  }

  abstract upload(resource: string | Buffer | any): Promise<string>
}

// 图片上传器
class ImageUploader extends BaseUploader {
  constructor(http: HTTP, token: string, apiendpoint: string, ffmpegPool: FfmpegThreadPool) {
    super(http, token, apiendpoint, 'image', ffmpegPool)
  }

  // 使用工作线程池进行图片压缩
  private async compressImageInWorker(buffer: Buffer, mimeType: string): Promise<{ buffer: Buffer, mimeType: string }> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: { 
          type: 'image',
          buffer, 
          mimeType, 
          maxSize: this.MAX_SIZE 
        }
      });

      worker.on('message', (result) => {
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result);
        }
        worker.terminate();
      });

      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`工作线程异常退出，退出码: ${code}`));
      });
    });
  }

  // 处理图片的公共方法
  private async processImage(image: string | Buffer | any): Promise<{ 
    buffer: Buffer, 
    fileName: string, 
    mimeType: string,
    hash?: string
  }> {
    // 解析资源
    const { buffer, fileName, mimeType } = await resolveResource(
      image, 
      'image.png', 
      'image/png', 
      this.http
    );
    
    // 验证图片格式
    const { mimeType: validMimeType } = await validateImage(buffer);
    let finalMimeType = validMimeType;
    let finalBuffer = buffer;
    
    // 更新文件扩展名
    let finalFileName = updateFileExtension(fileName, validMimeType);
    
    // 记录验证后的图片信息
    const originalSize = buffer.length;
    const originalMB = (originalSize / (1024 * 1024)).toFixed(2);
    logger.info(`验证后的图片: 类型=${validMimeType}, 大小=${originalMB}MB`);
    
    // 如果图片需要压缩且大小超过限制，使用工作线程进行压缩
    if (originalSize > this.MAX_SIZE) {
      logger.info(`图片超过大小限制，启动压缩工作线程...`);
      const result = await this.compressImageInWorker(buffer, validMimeType);
      finalBuffer = result.buffer;
      finalMimeType = result.mimeType;
      
      // 更新文件扩展名
      finalFileName = updateFileExtension(finalFileName, finalMimeType);
    }

    // 最终大小验证
    if (finalBuffer.length > this.MAX_SIZE) {
      const sizeMB = (finalBuffer.length / (1024 * 1024)).toFixed(2);
      throw new Error(`图片大小${sizeMB}MB超过10MB限制`);
    }

    return {
      buffer: finalBuffer,
      fileName: finalFileName,
      mimeType: finalMimeType
    };
  }

  async upload(image: string | Buffer | any): Promise<string> {
    const { buffer, fileName, mimeType } = await this.processImage(image);
    
    const form = new FormData();
    const file = new File([buffer], fileName, { type: mimeType });
    form.append('image', file);
    
    return this.sendFormData(form);
  }

  async uploadGetUrl(image: string | Buffer | any): Promise<Dict> {
    const result = await this.processImage(image);
    const { buffer, fileName, mimeType } = result;
    
    const form = new FormData();
    const file = new File([buffer], fileName, { type: mimeType });
    form.append('image', file);
    
    // 计算图片哈希用于生成URL
    const hash = createHash('md5');
    hash.update(buffer);
    const imageHash = hash.digest('hex');
    const extension = getExtension(mimeType);
    
    // 并行执行上传和URL生成
    const [imagekey] = await Promise.all([
      this.sendFormData(form),
    ]);
    
    return {
      imageurl: `${IMAGE_URL}${imageHash}.${extension}`,
      imagekey
    };
  }
}

// 视频上传器
class VideoUploader extends BaseUploader {
  constructor(
    http: HTTP, 
    token: string, 
    apiendpoint: string, 
    ffmpegPool: FfmpegThreadPool,
    private enableFfmpeg: boolean // 添加是否启用 FFmpeg 的配置
  ) {
    super(http, token, apiendpoint, 'video', ffmpegPool)
  }

  async upload(video: string | Buffer | any): Promise<string> {
    const form = new FormData()
    
    // 解析资源
    const { buffer, fileName, mimeType } = await resolveResource(
      video, 
      'video.mp4', 
      'video/mp4', 
      this.http
    )
    
    // 记录原始大小
    const originalSize = buffer.length
    const originalMB = (originalSize / (1024 * 1024)).toFixed(2)
    logger.info(`原始视频大小: ${originalMB}MB`)
    
    let finalBuffer = buffer
    
    // 如果视频需要压缩且大小超过限制，并且启用了 FFmpeg，使用线程池进行压缩
    if (originalSize > this.MAX_SIZE) {
      if (this.enableFfmpeg && this.ffmpegPool) {
        logger.info(`视频超过20MB限制，启动压缩任务...`)
        
        const task: FfmpegTask = {
          type: 'compress-video',
          input: buffer,
          options: {
            maxSize: this.MAX_SIZE
          }
        };
        
        const result = await this.ffmpegPool.executeTask(task);
        if (result.success && result.output) {
          finalBuffer = Buffer.isBuffer(result.output)
            ? result.output
            : Buffer.from(result.output); 
          
          const compressedSize = finalBuffer.length
          const compressedMB = (compressedSize / (1024 * 1024)).toFixed(2)
          logger.info(`压缩后视频大小: ${compressedMB}MB`)
          
          if (result.metrics) {
            const reduction = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
            logger.info(`压缩率: ${reduction}%`);
          }
        } else {
          throw new Error(result.error || 'internal >> 视频压缩失败');
        }
      } else {
        // 如果未启用 FFmpeg，直接报错
        const sizeMB = (originalSize / (1024 * 1024)).toFixed(2)
        throw new Error(`视频大小${sizeMB}MB超过${this.MAX_SIZE / (1024 * 1024)}MB限制，且FFmpeg功能未启用`);
      }
    }

    // 最终大小验证
    if (finalBuffer.length > this.MAX_SIZE) {
      const sizeMB = (finalBuffer.length / (1024 * 1024)).toFixed(2)
      throw new Error(`视频大小${sizeMB}MB超过${this.MAX_SIZE / (1024 * 1024)}MB限制`)
    }

    // 创建文件对象并上传
    const file = new File([finalBuffer], fileName, { type: mimeType })
    form.append('video', file)
    return this.sendFormData(form)
  }
}


// 文件上传器
class FileUploader extends BaseUploader {
  constructor(http: HTTP, token: string, apiendpoint: string, ffmpegPool: FfmpegThreadPool) {
    super(http, token, apiendpoint, 'file', ffmpegPool)
  }

  async upload(fileData: string | Buffer | any): Promise<string> {
    const form = new FormData()
    
    // 解析资源
    const { buffer, fileName, mimeType } = await resolveResource(
      fileData, 
      'file.dat', 
      'application/octet-stream', 
      this.http
    )
    
    // 大小验证
    if (buffer.length > this.MAX_SIZE) {
      throw new Error(`文件大小超过${this.MAX_SIZE / (1024 * 1024)}MB限制`)
    }

    // 创建文件对象并上传
    const file = new File([buffer], fileName, { type: mimeType })
    form.append('file', file)
    return this.sendFormData(form)
  }
}

// 主类
export default class Internal {
  private imageUploader: ImageUploader
  private videoUploader: VideoUploader
  private fileUploader: FileUploader
  private ffmpegPool: FfmpegThreadPool

  constructor(
  private http: HTTP, 
  private httpWeb: HTTP,
  private token: string, 
  private apiendpoint: string,
  private ffmpegPath: string,
  private enableFfmpeg: boolean // 添加是否启用 FFmpeg 的配置
) {
  // 只有当启用 FFmpeg 时才创建线程池
  this.ffmpegPool = enableFfmpeg ? new FfmpegThreadPool() : null;
  
  this.imageUploader = new ImageUploader(http, token, apiendpoint, this.ffmpegPool)
  this.videoUploader = new VideoUploader(http, token, apiendpoint, this.ffmpegPool, enableFfmpeg) // 传递 enableFfmpeg
  this.fileUploader = new FileUploader(http, token, apiendpoint, this.ffmpegPool)
}

  sendMessage(payload: Dict) {
    return this.http.post(`/bot/send?token=${this.token}`, payload)
  }

  async uploadImageUrl(image: string | Buffer | any): Promise<Dict> {
    return this.imageUploader.uploadGetUrl(image)
  }
  async uploadImage(image: string | Buffer | any): Promise<string | undefined> {
    return this.imageUploader.upload(image)
  }

  async uploadVideo(video: string | Buffer | any): Promise<string> {
    return this.videoUploader.upload(video)
  }

  async uploadFile(fileData: string | Buffer | any): Promise<string> {
    return this.fileUploader.upload(fileData)
  }

  async deleteMessage(chatId: string, msgId: string) {
    const chatType = chatId.split(':')[1]
    const payload = { msgId, chatId, chatType }
    logger.info(`撤回消息: ${JSON.stringify(payload)}`)
    return this.http.post(`/bot/recall?token=${this.token}`, payload)
  }
  async getGuild(guildId: string): Promise<Types.GroupInfo>  {
    const payload = { "groupId":guildId }
    return this.httpWeb.post(`/group/group-info`, payload)
  }

  async getUser(userId: string): Promise<Types.UserInfoResponse>{
    return this.httpWeb.get(`/user/homepage?userId=${userId}`)
  }

// 获取图片并转换为Base64
  async getImageAsBase64(url: string): Promise<string> {
    try {
      // 设置请求头，包括Referer
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'Referer': 'www.yhchat.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      // 获取图片MIME类型
      const contentType = response.headers['content-type'];
      if (!contentType || !contentType.startsWith('image/')) {
        throw new Error('响应不是有效的图片类型');
      }

      // 将ArrayBuffer转换为Base64
      const base64 = Buffer.from(response.data, 'binary').toString('base64');
      
      // 返回Data URL格式
      return `data:${contentType};base64,${base64}`;
    } catch (error) {
      console.error('获取图片失败:', error);
      throw new Error(`无法获取图片: ${error.message}`);
    }
  } 

  async setBoard(
    chatId: string,
    contentType: FormatType,
    content: string,
    options: { memberId?: string; expireTime?: number } = {}
  ) {
    const chatType = chatId.split(':')[1]
    const payload = {
      chatId,
      chatType,
      contentType,
      content,
      ...options
    }
    
    return this.http.post(`/bot/board?token=${this.token}`, payload)
  }

  async setAllBoard(
    chatId: string,
    contentType: FormatType,
    content: string,
    options: { expireTime?: number } = {}
  ) {
    const chatType = chatId.split(':')[1]
    const payload = {
      chatId,
      chatType,
      contentType,
      content,
      ...options
    }
    return this.http.post(`/bot/board-all?token=${this.token}`, payload)
  }
  
  /**
   * 关闭时清理资源
   */
  shutdown() {
  if (this.ffmpegPool) {
    this.ffmpegPool.shutdown();
    }
  }
}