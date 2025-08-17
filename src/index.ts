import { Adapter, Context, Logger, Bot, SessionError, h, Schema, Universal, Binary } from 'koishi'
import * as Yunhu from './types'
import { adaptSession } from './utils'
import { } from '@koishijs/plugin-server'
import Internal from './internal'
import { YunhuMessageEncoder } from './message'

const logger = new Logger('yunhu')

// 默认的云湖 API 地址
const YUNHU_ENDPOINT = 'https://chat-go.jwzhd.com'
const YUNHU_API_PATH = '/open-apis/v1'

export const name = 'yunhu'

class YunhuBot<C extends Context = Context> extends Bot<C> {
  static inject = ['server']
  static MessageEncoder = YunhuMessageEncoder
  public internal: Internal
  
  constructor(ctx: C, config: YunhuBot.Config) {
    // 添加适配器名称作为第三个参数
    super(ctx, config, 'yunhu')
    
    this.platform = 'yunhu'
    this.selfId = config.token
    
    // 创建HTTP实例
    const http = ctx.http.extend({
      endpoint: `${this.config.endpoint}${YUNHU_API_PATH}`,
    })
    
    // 初始化内部接口
    this.internal = new Internal(http, config.token, `${this.config.endpoint}${YUNHU_API_PATH}`)
    
    // 注册服务器插件
    ctx.plugin(YunhuServer, this)
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

export default YunhuBot

// 配置命名空间
namespace YunhuBot {
  export interface Config {
    token: string;
    endpoint?: string;
    path?: string;
    cat?: string;
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
      .description('她很可爱，你可以摸摸')
  })
}
