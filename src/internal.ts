import { Context, h, HTTP, Dict, Logger } from 'koishi'
import { FormData, File } from 'formdata-node'
import axios, { AxiosRequestConfig } from 'axios'
import * as Types from './types'
import { createHash } from 'crypto';
import { Buffer } from 'buffer';
import {  
  updateFileExtension,
  ResourceType,
  FormatType,
  getExtension,
  resolveResource
} from './utils'

const logger = new Logger('yunhu')

const IMAGE_URL = "https://chat-img.jwznb.com/"

// 上传基类
abstract class BaseUploader {
  protected MAX_SIZE: number

  constructor(
    protected http: HTTP,
    protected token: string,
    protected apiendpoint: string,
    protected resourceType: ResourceType,
    protected ffmpeg: any // Koishi 的 ffmpeg 服务
  ) {
    // 设置不同资源类型的最大大小限制
    this.MAX_SIZE = resourceType === 'image' ? 10 * 1024 * 1024 : 
                  resourceType === 'video' ? 20 * 1024 * 1024 : 
                  100 * 1024 * 1024
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
  constructor(http: HTTP, token: string, apiendpoint: string, ffmpeg: any) {
    super(http, token, apiendpoint, 'image', ffmpeg)
  }


  async upload(image: string | Buffer | any): Promise<string> {
    const form = new FormData()
    
    // 解析资源
    const { buffer, fileName, mimeType } = await resolveResource(
      image, 
      'image.png', 
      'image/png', 
      this.http
    )
    
    // 简单验证图片格式
    const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 
                           'image/bmp', 'image/tiff', 'image/svg+xml', 'image/x-icon']
    
    if (!validImageTypes.includes(mimeType)) {
      throw new Error(`不支持的图片格式: ${mimeType}`)
    }
    
    let finalBuffer = buffer
    let finalMimeType = mimeType
    let finalFileName = updateFileExtension(fileName, mimeType)
    
    // 记录图片信息
    const originalSize = buffer.length
    const originalMB = (originalSize / (1024 * 1024)).toFixed(2)
    logger.info(`图片: 类型=${mimeType}, 大小=${originalMB}MB`)
    
    // 简单的大小检查
    if (originalSize > this.MAX_SIZE) {
      const sizeMB = (originalSize / (1024 * 1024)).toFixed(2)
      throw new Error(`图片大小${sizeMB}MB超过10MB限制，无法上传`)
    }
    // 创建文件对象并上传
    const file = new File([finalBuffer], finalFileName, { type: finalMimeType })
    form.append('image', file)
    return this.sendFormData(form)
  }

  async uploadGetUrl(image: string | Buffer | any): Promise<Dict> {
    const form = new FormData()
    
    // 解析资源
    const { buffer, fileName, mimeType } = await resolveResource(
      image, 
      'image.png', 
      'image/png', 
      this.http
    )
    
    // 简单验证图片格式
    const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 
                           'image/bmp', 'image/tiff', 'image/svg+xml', 'image/x-icon']
    
    if (!validImageTypes.includes(mimeType)) {
      throw new Error(`不支持的图片格式: ${mimeType}`)
    }
    
    let finalBuffer = buffer
    let finalMimeType = mimeType
    let finalFileName = updateFileExtension(fileName, mimeType)
    
    // 记录图片信息
    const originalSize = buffer.length
    const originalMB = (originalSize / (1024 * 1024)).toFixed(2)
    logger.info(`图片: 类型=${mimeType}, 大小=${originalMB}MB`)
    
    // 简单的大小检查
    if (originalSize > this.MAX_SIZE) {
      const sizeMB = (originalSize / (1024 * 1024)).toFixed(2)
      throw new Error(`图片大小${sizeMB}MB超过10MB限制，无法上传`)
    }
    // 创建文件对象并上传
    const file = new File([finalBuffer], finalFileName, { type: finalMimeType })
    form.append('image', file)
    
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
  constructor(http: HTTP, token: string, apiendpoint: string, ffmpeg: any) {
    super(http, token, apiendpoint, 'video', ffmpeg)
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
    
    // 如果视频需要压缩且大小超过限制，使用 ffmpeg 服务进行压缩
    if (originalSize > this.MAX_SIZE) {
      logger.info(`视频超过20MB限制，启动压缩...`)
      
      try {
        // 使用 Koishi 的 ffmpeg 服务进行压缩
        const tempInput = await this.ffmpeg.temp(buffer, 'input.mp4');
        const tempOutput = await this.ffmpeg.temp(null, 'output.mp4');
        
        // 构建 ffmpeg 命令
        await this.ffmpeg
          .input(tempInput)
          .outputOptions([
            '-c:v', 'libx264',
            '-crf', '28',
            '-preset', 'fast',
            '-c:a', 'aac',
            '-b:a', '64k'
          ])
          .output(tempOutput)
          .run();
        
        // 读取压缩后的视频
        finalBuffer = await this.ffmpeg.read(tempOutput);
        
        const compressedSize = finalBuffer.length
        const compressedMB = (compressedSize / (1024 * 1024)).toFixed(2)
        logger.info(`压缩后视频大小: ${compressedMB}MB`)
        
        // 清理临时文件
        await this.ffmpeg.clean(tempInput);
        await this.ffmpeg.clean(tempOutput);
      } catch (error) {
        logger.error('视频压缩失败:', error);
        throw new Error('视频压缩失败，无法上传');
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
  constructor(http: HTTP, token: string, apiendpoint: string, ffmpeg: any) {
    super(http, token, apiendpoint, 'file', ffmpeg)
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

  constructor(
    private http: HTTP, 
    private httpWeb: HTTP,
    private token: string, 
    private apiendpoint: string,
    private ffmpeg: any // Koishi 的 ffmpeg 服务
  ) {
    this.imageUploader = new ImageUploader(http, token, apiendpoint, ffmpeg)
    this.videoUploader = new VideoUploader(http, token, apiendpoint, ffmpeg)
    this.fileUploader = new FileUploader(http, token, apiendpoint, ffmpeg)
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
    const id = chatId.split(':')[0]
    const payload = { msgId, id, chatType }
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
  
  async getMessageList(chatId: string, messageId: string, options: { before?: number; after?: number} = {}): Promise<Types.ApiResponse> {
    const chatType = chatId.split(':')[1]
    const Id = chatId.split(':')[0]
    const { before , after} = options
    logger.warn(chatId)
    const url =`/bot/messages?token=${this.token}&chat-id=${Id}&chat-type=${chatType}&message-id=${messageId}&before=${before || 0}&after=${after || 0}`
    return this.http.get(url)
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
    const Id = chatId.split(':')[0]
    const payload = {
      Id,
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
    const Id = chatId.split(':')[0]
    const payload = {
      Id,
      chatType,
      contentType,
      content,
      ...options
    }
    return this.http.post(`/bot/board-all?token=${this.token}`, payload)
  }
  
}

