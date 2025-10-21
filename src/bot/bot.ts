import { Bot, Context, Logger } from 'koishi';
import { Config } from '../index';
import * as Yunhu from '../utils/types';
import Internal from './internal';
import { YunhuMessageEncoder } from './message';
import { Webhook } from './ws';


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
    private webhook: Webhook;

    constructor(public ctx: Context, config: Config)
    {
        super(ctx, config, 'yunhu');
        this.platform = 'yunhu';
        this.selfId = config.token;

        // 日志输出插件启动
        this.loggerInfo(`云湖适配器初始化，机器人ID: ${config.token}`);

        // 创建HTTP实例
        const http = this.ctx.http.extend({
            endpoint: `${this.config.endpoint}${YUNHU_API_PATH}`,
        });

        // 爬虫/抓包接口
        const httpWeb = this.ctx.http.extend({
            endpoint: `${this.config.endpointweb}${YUNHU_API_PATH_WEB}`,
        });

        // 初始化内部接口
        this.internal = new Internal(http, httpWeb, config.token, `${this.config.endpoint}${YUNHU_API_PATH}`, this);
        this.Encoder = new YunhuMessageEncoder(this, config.token);
        this.webhook = new Webhook(ctx, this);

        // 实现各种方法
        this.getGuildMember = async (guildId: string, userId: string) =>
        {
            try
            {
                const _payload = await this.internal.getUser(userId) as Yunhu.UserInfoResponse;
                return {
                    "id": _payload.data.user.userId,
                    "name": _payload.data.user.nickname,
                    'avatar': this.config._host + "?url=" + _payload.data.user.avatarUrl,
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
                    'avatar': this.config._host + "?url=" + _payload.data.user.avatarUrl,
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
                const chatType = guildId.split(':')[1];
                const Id = guildId.split(':')[0];
                if (chatType == 'group')
                {
                    const _payload = await this.internal.getGuild(Id);
                    return {
                        "id": _payload.data.group.groupId + ':' + chatType,
                        "name": _payload.data.group.name,
                        'avatar': this.config._host + "?url=" + _payload.data.group.avatarUrl
                    };
                } else
                {
                    const _payload = await this.internal.getUser(Id);
                    return {
                        "id": _payload.data.user.userId + ':' + chatType,
                        "name": _payload.data.user.nickname,
                        'avatar': this.config._host + "?url=" + _payload.data.user.avatarUrl
                    };
                }
            } catch (error)
            {
                this.loggerError('获取群聊消息失败:', error);
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
        this.loggerInfo('云湖机器人开始启动...');
        await super.start();

        // 启动 webhook 连接
        try
        {
            await this.webhook.connect();
            this.loggerInfo('Webhook 连接成功');
        } catch (error)
        {
            this.loggerError('Webhook 连接失败:', error);
            throw error;
        }

        this.loggerInfo('云湖机器人启动完成');
    }

    // 停止机器人
    async stop()
    {
        this.loggerInfo('云湖机器人开始停止...');
        await super.stop();
        this.loggerInfo('云湖机器人已停止');
    }
}