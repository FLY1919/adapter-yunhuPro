import { Adapter, Context, Logger, Bot, SessionError, h, Schema, Universal, Binary } from 'koishi'
import * as Yunhu from './types'
import { adaptSession } from './utils'
import { } from '@koishijs/plugin-server'
import Internal from './internal'
import { YunhuMessageEncoder } from './message'
import { execSync } from 'child_process'
import path from 'path'
import ffmpeg from 'fluent-ffmpeg'
import { FfmpegThreadPool } from './thread-pool';
import { config } from 'process'

const logger = new Logger('yunhu')

// 默认的云湖 API 地址
const YUNHU_ENDPOINT = 'https://chat-go.jwzhd.com'
const YUNHU_ENDPOINT_WEB = 'https://chat-web-go.jwzhd.com'
const YUNHU_API_PATH = '/open-apis/v1'
const YUNHU_API_PATH_WEB = '/v1'

export const name = 'yunhu'
class YunhuBot<C extends Context = Context> extends Bot<C> {
  static inject = ['server']
  static MessageEncoder = YunhuMessageEncoder
  public internal: Internal
  private Encoder: YunhuMessageEncoder<C>
  private ffmpegPath: string

  constructor(ctx: C, config: YunhuBot.Config) {
    // 添加适配器名称作为第三个参数
    super(ctx, config, 'yunhu')
    
    this.platform = 'yunhu'
    this.selfId = config.token

    if (config.ffmpeg) {
    // 设置 FFmpeg 路径
      this.ffmpegPath = this.resolveFfmpegPath(config)
    } else (
      this.ffmpegPath = ''
    )
    // 创建HTTP实例
    const http = ctx.http.extend({
      endpoint: `${this.config.endpoint}${YUNHU_API_PATH}`,
    })
    // 爬虫/抓包接口
    const httpWeb = ctx.http.extend({
      endpoint: `${this.config.endpointweb}${YUNHU_API_PATH_WEB}`,
    })
    
    // 初始化内部接口
    this.internal = new Internal(http, httpWeb, config.token, `${this.config.endpoint}${YUNHU_API_PATH}`, this.ffmpegPath, config.ffmpeg)
    this.Encoder = new YunhuMessageEncoder<C>(this, config.token)
    this.getGuildMember = async (guildId: string, userId: string) => {
      try {
        const _payload = await this.internal.getUser(userId) as Yunhu.UserInfoResponse
        return {
          "id": _payload.data.user.userId,
          "name": _payload.data.user.nickname,
          'avatar':this.config._host + "?url=" + _payload.data.user.avatarUrl,
          "tag": _payload.data.user.nickname,
          "isBot": false
        }
      } catch (error) {
        logger.error('获取群成员信息失败:', error)
        throw error
      }
    }
    this.getUser = async (userId: string) => {
      try {
        const _payload = await this.internal.getUser(userId) as Yunhu.UserInfoResponse
        return {
          "id": _payload.data.user.userId,
          "name": _payload.data.user.nickname,
          'avatar': this.config._host + "?url=" + _payload.data.user.avatarUrl,
          "tag": _payload.data.user.nickname,
          "isBot": false
        }
      }catch (error){
        logger.error('获取用户信息失败:', error)
        throw error
      }
    }
    this.getGuild = async (guildId: string) => {
      try {
        const _payload = await this.internal.getGuild(guildId)
        logger.info(_payload)
        return {
          "id": _payload.data.group.groupId,
          "name": _payload.data.group.name,
          'avatar':this.config._host + "?url=" + _payload.data.group.avatarUrl
        }
      }catch (error){
        logger.error('获取群聊消息失败:', error)
        throw error
      }
    }
    // 实现消息撤回功能
    this.deleteMessage = async (channelId: string, messageId: string) => {
      try {
        return this.internal.deleteMessage(channelId, messageId)
      } catch (error) {
        logger.error('撤回消息失败:', error)
        throw error
      }
    }
    
    // 注册服务器插件
    ctx.plugin(YunhuServer, this)
    
    // 注册关闭钩子
    ctx.on('dispose', () => {
      this.internal.shutdown();
    });
  }
  
  /**
   * 解析 FFmpeg 路径
   * @param config 配置对象
   * @returns FFmpeg 可执行文件路径
   */
  private resolveFfmpegPath(config: YunhuBot.Config): string {
    // 1. 如果配置中提供了路径，直接使用
    if (config.ffmpegPath) {
      if (this.isValidFfmpegPath(config.ffmpegPath)) {
        logger.info(`使用配置的 FFmpeg 路径: ${config.ffmpegPath}`)
        return config.ffmpegPath
      } else {
        logger.warn(`配置的 FFmpeg 路径无效: ${config.ffmpegPath}`)
      }
    }
    
    // 2. 尝试使用 ffmpeg-static 包
    try {
      const ffmpegStatic = require('ffmpeg-static')
      if (ffmpegStatic) {
        logger.info(`使用 ffmpeg-static 提供的 FFmpeg: ${ffmpegStatic}`)
        return ffmpegStatic
      }
    } catch (error) {
      logger.warn('ffmpeg-static 未安装或不可用')
    }
    
    // 3. 尝试在系统 PATH 中查找 ffmpeg
    try {
      const systemFfmpeg = this.findFfmpegInPath()
      if (systemFfmpeg) {
        logger.info(`在系统 PATH 中找到 FFmpeg: ${systemFfmpeg}`)
        return systemFfmpeg
      }
    } catch (error) {
      logger.warn('在系统 PATH 中查找 FFmpeg 失败')
    }
    
    // 4. 尝试在常见安装位置查找
    const commonPaths = this.getCommonFfmpegPaths()
    for (const possiblePath of commonPaths) {
      if (this.isValidFfmpegPath(possiblePath)) {
        logger.info(`在常见位置找到 FFmpeg: ${possiblePath}`)
        return possiblePath
      }
    }
    
    // 5. 最终尝试使用默认名称
    logger.warn('无法找到有效的 FFmpeg 路径，将尝试使用默认名称')
    return 'ffmpeg'
  }
  
  /**
   * 检查 FFmpeg 路径是否有效
   * @param path 路径
   * @returns 是否有效
   */
  private isValidFfmpegPath(path: string): boolean {
    try {
      // 检查文件是否存在
      require('fs').accessSync(path, require('fs').constants.X_OK)
      
      // 检查版本信息
      const versionOutput = execSync(`"${path}" -version`, { encoding: 'utf-8' })
      return versionOutput.includes('ffmpeg version')
    } catch (error) {
      return false
    }
  }
  
  /**
   * 在系统 PATH 中查找 FFmpeg
   * @returns FFmpeg 路径或 null
   */
  private findFfmpegInPath(): string | null {
    try {
      const which = process.platform === 'win32' ? 'where' : 'which'
      const path = execSync(`${which} ffmpeg`, { encoding: 'utf-8' }).trim()
      if (path) return path
    } catch (error) {
      // 忽略错误
    }
    return null
  }
  
  /**
   * 获取常见的 FFmpeg 安装路径
   * @returns 路径数组
   */
  private getCommonFfmpegPaths(): string[] {
    const paths = []
    
    // Windows 常见路径
    if (process.platform === 'win32') {
      paths.push(
        path.join('C:', 'Program Files', 'ffmpeg', 'bin', 'ffmpeg.exe'),
        path.join('C:', 'ffmpeg', 'bin', 'ffmpeg.exe'),
        path.join(process.env.ProgramFiles, 'ffmpeg', 'bin', 'ffmpeg.exe')
      )
    } 
    // macOS 常见路径
    else if (process.platform === 'darwin') {
      paths.push(
        '/usr/local/bin/ffmpeg',
        '/opt/homebrew/bin/ffmpeg',
        '/usr/bin/ffmpeg'
      )
    }
    // Linux 常见路径
    else {
      paths.push(
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/opt/ffmpeg/bin/ffmpeg'
      )
    }
    
    return paths
  }
}

class YunhuServer<C extends Context> extends Adapter<C, YunhuBot<C>> {
  // 根据文件扩展名获取内容类型
  private getContentType(extension: string): string {
    const typeMap = {
      // Image types
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'ico': 'image/x-icon',

      // Video types
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'wmv': 'video/x-ms-wmv',
      'flv': 'video/x-flv',
      'm4v': 'video/x-m4v',
      '3gp': 'video/3gpp',

      // Audio types
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'flac': 'audio/flac',
      'aac': 'audio/aac',

      // Document types
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'txt': 'text/plain',
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed',
      '7z': 'application/x-7z-compressed',

      // Web formats
      'css': 'text/css',
      'js': 'application/javascript',
      'json': 'application/json',
      'html': 'text/html',
      'htm': 'text/html'
    }

    function getContentType(extension: string): string {
      return typeMap[extension.toLowerCase()] || 'application/octet-stream';
    }


    return typeMap[extension] || 'application/octet-stream'
  }
  async connect(bot: YunhuBot) {
    await this.initialize(bot)
    
    // 爬虫/抓包接口

    // 设置消息事件监听
    this.ctx.on('send', (session) => {
      logger.info(`New message: ${session.messageId} in channel: ${session.channelId}`)
    })

    // 注册Webhook路由
    bot.ctx.server.get(`${bot.config.path_host}`, async (ctx) => {
    ctx.status = 200;
    const targetUrl = ctx.query?.url as string | undefined;

    if (!targetUrl) {
      ctx.status = 400;
      ctx.body = 'Missing URL parameter. Usage: /proxy?url=目标URL';
      return;
    }

    // 解码URL
    let decodedUrl: string;
    try {
      decodedUrl = decodeURIComponent(targetUrl);
      if (!decodedUrl.startsWith('http')) {
        ctx.status = 400;
        ctx.body = 'Invalid URL. Must start with http or https.';
        return;
      }
    } catch (e) {
      ctx.status = 400;
      ctx.body = 'Invalid URL encoding.';
      return;
    }

    try {
      // 获取文件扩展名
      const urlObj = new URL(decodedUrl);
      const pathname = urlObj.pathname;
      const extension = pathname.includes('.') 
        ? pathname.split('.').pop()?.toLowerCase() || ''
        : '';

      // 设置请求头
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      };
      headers['Referer'] = `www.yhchat.com`;
    

      // 使用Koishi的HTTP客户端发起请求
      const response = await this.ctx.http.get(decodedUrl, {
        headers,
        responseType: 'arraybuffer',
        timeout: 30000 // 30秒超时
      });

      // 设置内容类型
      const contentType = this.getContentType(extension);
      ctx.set('Content-Type', contentType);
      
      // 对于可预览的文件类型，直接在浏览器中显示
      // 对于其他类型，设置为附件下载
      if (!contentType.startsWith('image/') && 
          !contentType.startsWith('video/') && 
          !contentType.startsWith('audio/') &&
          !contentType.startsWith('text/')) {
        const filename = pathname.split('/').pop() || 'file';
        ctx.set('Content-Disposition', `attachment; filename="${filename}"`);
      }
      
      ctx.body = Buffer.from(response);
    } catch (error) {
      logger.error(`Proxy request failed: ${error.message}`);
      ctx.status = 500;
      ctx.body = `Proxy Error: ${error.message}`;
    }
  });
    
    // 处理Webhook请求
    bot.ctx.server.post(bot.config.path, async (ctx) => {
      ctx.status = 200
      
      // 使用类型断言获取请求体
      const payload: Yunhu.YunhuEvent = (ctx.request as any).body
      logger.info('Received payload:')
      logger.info(payload)

      // 确保机器人处于在线状态
      if (bot.status !== Universal.Status.ONLINE) {
        await this.initialize(bot)
      }

      // 转换并分发会话
      const session = adaptSession(bot, payload)
      if (session) {
        bot.dispatch(await session)
      }
      
      // 返回成功响应
      ctx.body = { code: 0, message: 'success' }
    })
  }

  // 初始化机器人状态
  async initialize(bot: YunhuBot) {
    try {
      bot.online()
      logger.info(`Bot ${bot.selfId} is now online`)
    } catch (e) {
      logger.warn(`Failed to initialize bot: ${e.message}`)
      bot.offline()
    }
  }
}

// 配置命名空间
namespace YunhuBot {
  export interface Config {
    token: string;
    endpoint?: string;
    endpointweb?: string;
    _host:string;
    path_host:string;
    path?: string;
    cat?: string;
    ffmpegPath?: string;
    ffmpeg?: boolean;
  }

  export const Config: Schema<Config> = Schema.object({
    token: Schema.string()
      .required()
      .description('机器人 Token'),
    ffmpeg: Schema.boolean()
      .default(false)
      .role('boolean')
      .description('FFmpeg 是否启用视频压缩功能，启用后可发送视频消息，默认关闭'),
    endpoint: Schema.string()
      .default(YUNHU_ENDPOINT)
      .description('云湖 API 地址，默认无需修改'),
    endpointweb: Schema.string()
      .default(YUNHU_ENDPOINT_WEB)
      .description('云湖 API 地址，默认无需修改'),
    
    path: Schema.string()
      .default('/yunhu')
      .description('Webhook 接收路径'),
    
    cat: Schema.string()
      .default('猫娘')
      .description('她很可爱，你可以摸摸'),
    _host: Schema.string()
      .default('http://127.0.0.1:5140/pic')
      .description('图片反代'),
    path_host: Schema.string()
      .default('/pic')
      .description('图片反代'),
     
    ffmpegPath: Schema.string()
      .description('FFmpeg 可执行文件路径')
      .default('')
      .role('path')
  })
}

// 默认导出 YunhuBot 类
export default YunhuBot
