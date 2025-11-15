import { FormatType, getImageAsBase64 } from '../utils/utils';
import { Bot, Context, Fragment, Logger } from 'koishi';
import { SendOptions } from '@satorijs/protocol';
import { BotTableItem, Config } from '../config';
import { YunhuMessageEncoder } from './message';
import { fragmentToPayload } from './message';
import { Internal } from './internal';

const logger = new Logger('adapter-yunhupro');

export class YunhuBot extends Bot<Context, Config>
{
  static inject = ['server'];
  static MessageEncoder = YunhuMessageEncoder;
  public internal: Internal;
  private Encoder: YunhuMessageEncoder;
  private isDisposing = false;
  public botConfig: BotTableItem;

  constructor(public ctx: Context, botConfig: BotTableItem, config: Config)
  {
    super(ctx, config, 'yunhu');
    this.platform = 'yunhu';
    this.selfId = botConfig.botId;
    this.botConfig = botConfig;

    // 创建HTTP实例
    const http = this.ctx.http.extend({
      endpoint: this.config.endpoint,
    });

    // 爬虫/抓包接口
    const httpWeb = this.ctx.http.extend({
      endpoint: this.config.endpointweb,
    });

    // 初始化内部接口
    this.internal = new Internal(http, httpWeb, botConfig.token, this.config.endpoint, this);
    this.Encoder = new YunhuMessageEncoder(this, botConfig.token);
  }

  async getUser(userId: string)
  {
    return this.internal.getUser(userId);
  }

  async getGuild(guildId: string)
  {
    return this.internal.getGuild(guildId);
  }

  async getChannel(channelId: string, guildId?: string)
  {
    return this.internal.getChannel(channelId, guildId);
  }

  async deleteMessage(channelId: string, messageId: string)
  {
    return this.internal.deleteMessage(channelId, messageId);
  }

  async getMessage(channelId: string, messageId: string)
  {
    return this.internal.getMessage(channelId, messageId);
  }

  async sendMessage(channelId: string, content: Fragment, guildId?: string, options?: SendOptions): Promise<string[]>
  {
    const encoder = new YunhuMessageEncoder(this, channelId, guildId, options);
    await encoder.send(content);
    const messageId = encoder.getMessageId();
    if (messageId)
    {
      return [messageId];
    } else
    {
      return [];
    }
  }

  async editMessage(channelId: string, messageId: string, content: Fragment): Promise<void>
  {
    if (!content)
    {
      this.loggerError('editMessage 调用失败，content不能为空');
      return;
    }

    const [type, id] = channelId.split(':');
    const recvType = type === 'private' ? 'user' : type;
    const recvId = id;

    const messagePayload = await fragmentToPayload(this, content);

    if (!messagePayload)
    {
      this.loggerError('editMessage失败: 解析后的消息内容为空，无法发送');
      return;
    }
    const payload = {
      msgId: messageId,
      recvId,
      recvType,
      contentType: messagePayload.contentType,
      content: messagePayload.content,
    };

    this.logInfo(`editMessage payload: ${JSON.stringify(payload, null, 2)}`);
    await this.internal.editMessage(payload);
  }

  logInfo(...args: any[])
  {
    if (this.config.loggerinfo)
    {
      (logger.info as (...args: any[]) => void)(...args);
    }
  }

  loggerInfo(...args: any[])
  {
    (logger.info as (...args: any[]) => void)(...args);
  }

  loggerError(...args: any[])
  {
    (logger.error as (...args: any[]) => void)(...args);
  }

  setDisposing(disposing: boolean)
  {
    this.isDisposing = disposing;
  }

  // 启动机器人
  async start()
  {
    try
    {
      const botInfo = await this.internal.getBotInfo(this.selfId);
      if (botInfo.code === 1)
      {
        this.user.name = botInfo.data.bot.nickname;
        this.user.avatar = await getImageAsBase64(botInfo.data.bot.avatarUrl, this.ctx.http);
        this.selfId = botInfo.data.bot.botId;
      }
      await super.start();
      this.online();
    } catch (error)
    {
      this.loggerError('Failed to get bot info:', error);
      this.offline();
    }
  }

  // 停止机器人
  async stop()
  {
    await super.stop();
  }
}
