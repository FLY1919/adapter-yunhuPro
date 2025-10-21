import { Adapter, Context, Logger, Universal } from 'koishi';
import { } from '@koishijs/plugin-server';

import { YunhuBot } from './bot';
import { Webhook } from './ws';

const logger = new Logger('yunhu');

export class YunhuServer<C extends Context> extends Adapter<C, YunhuBot<C>>
{

    bots: YunhuBot<C>[] = [];
    async start(bot: YunhuBot<C>)
    {
        await bot.adapter.connect(bot);
    }

    async stop(bot: YunhuBot<C>)
    {
        bot.offline();
    }

    async connect(bot: YunhuBot<C>)
    {
        await this.initialize(bot);
        const webhook = new Webhook(this.ctx, bot);
        await webhook.connect();
    }

    // 初始化机器人状态
    async initialize(bot: YunhuBot)
    {
        try
        {
            bot.online();
            logger.info(`Bot ${bot.selfId} is now online`);
        } catch (e)
        {
            logger.warn(`Failed to initialize bot: ${e.message}`);
            bot.offline();
        }
    }
}