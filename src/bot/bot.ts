import { Bot, Context, Logger } from 'koishi';
import { BotTableItem, Config } from '../config';
import * as Yunhu from '../utils/types';
import Internal from './internal';
import { YunhuMessageEncoder } from './message';

const logger = new Logger('yunhu');

const YUNHU_API_PATH = '/open-apis/v1';
const YUNHU_API_PATH_WEB = '/v1';

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
            endpoint: `${this.config.endpoint}${YUNHU_API_PATH}`,
        });

        // 爬虫/抓包接口
        const httpWeb = this.ctx.http.extend({
            endpoint: `${this.config.endpointweb}${YUNHU_API_PATH_WEB}`,
        });

        // 初始化内部接口
        this.internal = new Internal(http, httpWeb, botConfig.token, `${this.config.endpoint}${YUNHU_API_PATH}`, this);
        this.Encoder = new YunhuMessageEncoder(this, botConfig.token);

        // 实现各种方法
        this.getGuildMember = async (guildId: string, userId: string) =>
        {
            try
            {
                const _payload = await this.internal.getUser(userId) as Yunhu.UserInfoResponse;
                return {
                    "id": _payload.data.user.userId,
                    "name": _payload.data.user.nickname,
                    'avatar': _payload.data.user.avatarUrl,
                    "tag": _payload.data.user.nickname,
                    "isBot": false
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
                    "id": _payload.data.user.userId,
                    "name": _payload.data.user.nickname,
                    'avatar': _payload.data.user.avatarUrl,
                    "tag": _payload.data.user.nickname,
                    "isBot": false
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

    // 日志调试功能

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

    // 设置 disposing 状态
    setDisposing(disposing: boolean)
    {
        this.isDisposing = disposing;
    }

    // 启动机器人
    async start()
    {
        await super.start();
    }

    // 停止机器人
    async stop()
    {
        await super.stop();
    }
}