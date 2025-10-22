import { Bot, Context, Logger } from 'koishi';

import { getImageAsBase64 } from '../utils/utils';
import { BotTableItem, Config } from '../config';
import { YunhuMessageEncoder } from './message';
import * as Yunhu from '../utils/types';
import Internal from './internal';

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

        // 实现各种方法
        this.getGuildMember = async (guildId: string, userId: string) =>
        {
            try
            {
                const _payload = await this.internal.getUser(userId) as Yunhu.UserInfoResponse;
                return {
                    id: _payload.data.user.userId,
                    name: _payload.data.user.nickname,
                    avatar: _payload.data.user.avatarUrl,
                    tag: _payload.data.user.nickname,
                    isBot: false
                };
            } catch (error)
            {
                this.loggerError('获取群成员信息失败:', error);
                throw error;
            }
        };
        this.getUser = async (userId: string) =>
        {
            try
            {
                const _payload = await this.internal.getUser(userId) as Yunhu.UserInfoResponse;
                return {
                    id: _payload.data.user.userId,
                    name: _payload.data.user.nickname,
                    avatar: _payload.data.user.avatarUrl,
                    tag: _payload.data.user.nickname,
                    isBot: false
                };
            } catch (error)
            {
                this.loggerError('获取用户信息失败:', error);
                throw error;
            }
        };
        this.getGuild = async (guildId: string) =>
        {
            try
            {
                const _payload = await this.internal.getGuild(guildId);
                return {
                    id: _payload.data.group.groupId,
                    name: _payload.data.group.name,
                    avatar: _payload.data.group.avatarUrl
                };
            } catch (error)
            {
                this.loggerError('获取群组信息失败:', error);
                throw error;
            }
        };
        this.getChannel = async (channelId: string, guildId?: string) =>
        {
            try
            {
                const [id, type] = channelId.split(':');
                if (type === 'group')
                {
                    const guild = await this.getGuild(guildId || id);
                    return {
                        id: channelId,
                        name: guild.name,
                        type: 0 // 文本频道
                    };
                }
            } catch (error)
            {
                this.loggerError('获取频道信息失败:', error);
                throw error;
            }
        };

        // 实现消息撤回功能
        this.deleteMessage = async (channelId: string, messageId: string) =>
        {
            try
            {
                return this.internal.deleteMessage(channelId, messageId);
            } catch (error)
            {
                this.loggerError('撤回消息失败:', error);
                throw error;
            }
        };

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