import { Bot, Context, Logger } from 'koishi';
import { Config } from '../index';
import * as Yunhu from '../utils/types';
import Internal from './internal';
import { YunhuMessageEncoder } from './message';
import { YunhuServer } from './server';

import { } from 'koishi-plugin-ffmpeg';

const logger = new Logger('yunhu');

const YUNHU_API_PATH = '/open-apis/v1';
const YUNHU_API_PATH_WEB = '/v1';

export class YunhuBot<C extends Context = Context> extends Bot<C, Config>
{
    static inject = ['server', 'ffmpeg'];
    static MessageEncoder = YunhuMessageEncoder;
    public internal: Internal;
    private Encoder: YunhuMessageEncoder<C>;

    constructor(adapter: YunhuServer<C>, config: Config)
    {
        super((adapter as any).ctx, config, 'yunhu');
        this.platform = 'yunhu';
        this.selfId = config.token;

        // 创建HTTP实例
        const http = this.ctx.http.extend({
            endpoint: `${this.config.endpoint}${YUNHU_API_PATH}`,
        });

        // 爬虫/抓包接口
        const httpWeb = this.ctx.http.extend({
            endpoint: `${this.config.endpointweb}${YUNHU_API_PATH_WEB}`,
        });

        // 初始化内部接口，传入 ffmpeg 服务
        this.internal = new Internal(http, httpWeb, config.token, `${this.config.endpoint}${YUNHU_API_PATH}`, this.ctx.ffmpeg);
        this.Encoder = new YunhuMessageEncoder<C>(this, config.token);
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
                logger.error('获取群成员信息失败:', error);
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
                logger.error('获取用户信息失败:', error);
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
                logger.error('获取群聊消息失败:', error);
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
                logger.error('撤回消息失败:', error);
                throw error;
            }
        };

        // 解析并设置 FFmpeg 路径
    }
}