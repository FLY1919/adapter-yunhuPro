import { Bot, Context, Fragment, Logger } from 'koishi';
import { SendOptions } from '@satorijs/protocol';

import { FormatType, getImageAsBase64 } from '../utils/utils';
import { BotTableItem, Config } from '../config';
import { YunhuMessageEncoder } from './message';
import { Internal } from './internal';

const logger = new Logger('yunhu');

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
    async uploadImageUrl(image: string | Buffer | any)
    {
        return this.internal.uploadImageUrl(image);
    }

    async uploadImage(image: string | Buffer | any)
    {
        return this.internal.uploadImage(image);
    }

    async uploadVideo(video: string | Buffer | any)
    {
        return this.internal.uploadVideo(video);
    }

    async uploadFile(fileData: string | Buffer | any)
    {
        return this.internal.uploadFile(fileData);
    }

    async getBotInfo(botId: string)
    {
        return this.internal.getBotInfo(botId);
    }

    async getYunhuMessageList(channelId: string, messageId: string, options: { before?: number; after?: number; } = {})
    {
        return this.internal.getMessageList(channelId, messageId, options);
    }

    async setBoard(
        chatId: string,
        contentType: FormatType,
        content: string,
        options: { memberId?: string; expireTime?: number; } = {}
    )
    {
        return this.internal.setBoard(chatId, contentType, content, options);
    }

    async setAllBoard(
        chatId: string,
        contentType: FormatType,
        content: string,
        options: { expireTime?: number; } = {}
    )
    {
        return this.internal.setAllBoard(chatId, contentType, content, options);
    }

    async getGuildMember(guildId: string, userId: string)
    {
        return this.internal.getGuildMember(guildId, userId);
    }

    async dismissBoard(chatId: string, chatType: 'user' | 'group', memberId?: string)
    {
        return this.internal.dismissBoard(chatId, chatType, memberId);
    }

    async dismissAllBoard()
    {
        return this.internal.dismissAllBoard();
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
