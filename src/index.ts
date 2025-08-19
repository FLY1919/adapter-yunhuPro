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

const logger = new Logger('yunhu')

// 默认的云湖 API 地址
const YUNHU_ENDPOINT = 'https://chat-go.jwzhd.com'
const YUNHU_API_PATH = '/open-apis/v1'

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
    
    // 设置 FFmpeg 路径
    this.ffmpegPath = this.resolveFfmpegPath(config)
    
    // 创建HTTP实例
    const http = ctx.http.extend({
      endpoint: `${this.config.endpoint}${YUNHU_API_PATH}`,
    })
    
    // 初始化内部接口
    this.internal = new Internal(http, config.token, `${this.config.endpoint}${YUNHU_API_PATH}`, this.ffmpegPath)
    this.Encoder = new YunhuMessageEncoder<C>(this, config.token)
    
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
  async connect(bot: YunhuBot) {
    await this.initialize(bot)
    
    // 设置消息事件监听
    this.ctx.on('send', (session) => {
      logger.info(`New message: ${session.messageId} in channel: ${session.channelId}`)
    })

    // 注册Webhook路由
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
        bot.dispatch(session)
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

// 默认导出 YunhuBot 类
export default YunhuBot

// 配置命名空间
namespace YunhuBot {
  export interface Config {
    token: string;
    endpoint?: string;
    path?: string;
    cat?: string;
    ffmpegPath?: string;
  }

  export const Config: Schema<Config> = Schema.object({
    token: Schema.string()
      .required()
      .description('机器人 Token'),
    
    endpoint: Schema.string()
      .default(YUNHU_ENDPOINT)
      .description('云湖 API 地址，默认无需修改'),
    
    path: Schema.string()
      .default('/yunhu')
      .description('Webhook 接收路径'),
    
    cat: Schema.string()
      .default('猫娘')
      .description('她很可爱，你可以摸摸'),
    
    ffmpegPath: Schema.string()
      .description('FFmpeg 可执行文件路径')
      .default('')
      .role('path')
  })
}