import { Context, Logger, Universal } from 'koishi';
import { YunhuBot } from './bot';
import * as Yunhu from '../utils/types';
import { adaptSession } from '../utils/utils';

import { } from '@koishijs/plugin-server';

export class Webhook
{
    constructor(private ctx: Context, private bot: YunhuBot)
    {
        this.ctx = ctx;
        this.bot = bot;
    }

    public async connect()
    {
        this.bot.ctx.server.post(this.bot.config.path, async (ctx) =>
        {
            ctx.status = 200;

            // 使用类型断言获取请求体
            const payload: Yunhu.YunhuEvent = (ctx.request as any).body;
            this.bot.loggerInfo('Received payload:', payload);

            // 确保机器人处于在线状态
            if (this.bot.status !== Universal.Status.ONLINE)
            {
                this.bot.online();
            }

            // 转换并分发会话
            const session = adaptSession(this.bot, payload);
            if (session)
            {
                this.bot.dispatch(await session);
            }

            // 返回成功响应
            ctx.body = { code: 0, message: 'success' };
        });
    }
}