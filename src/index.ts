import { Context, Universal, sleep } from 'koishi';
import { } from '@koishijs/plugin-server';

import { adaptSession } from './utils/utils';
import * as Yunhu from './utils/types';
import { YunhuBot } from './bot/bot';
import { Config } from './config';

export * from './config';
export * from './bot/bot';

export const name = 'adapter-yunhupro';
export const reusable = false;
export const filter = false;
export const inject = {
  required: ['http', 'logger', 'server'],
  optional: ['ffmpeg']
};

export const usage = `
---
`;

export function apply(ctx: Context, config: Config)
{
  const bots: YunhuBot[] = [];
  let isDisposing = false;

  ctx.on('ready', async () =>
  {
    if (process.env.NODE_ENV === 'development' && !__dirname.includes('node_modules'))
    {
      await sleep(1 * 1000);  // 神秘步骤，可以保佑dev模式
    }
    if (isDisposing) return;

    // 筛选出启用的机器人，并去除 path 重复的机器人
    const uniqueBotsConfig = config.botTable
      .filter(botConfig => botConfig.enable)
      .filter((botConfig, index, self) =>
        index === self.findIndex(b => b.path === botConfig.path)
      );

    // 遍历 botTable，为每个机器人创建实例和路由
    for (const botConfig of uniqueBotsConfig)
    {
      const bot = new YunhuBot(ctx, botConfig, config);
      bots.push(bot);

      // 为每个机器人设置独立的 Webhook 监听
      ctx.server.post(botConfig.path, async (koaCtx) =>
      {
        koaCtx.status = 200;
        const payload: Yunhu.YunhuEvent = (koaCtx.request as any).body;
        bot.logInfo('接收到 payload:', payload);

        // 确保机器人处于在线状态
        if (bot.status !== Universal.Status.ONLINE)
        {
          bot.online();
        }

        // 转换并分发会话，adaptSession 内部会自行 dispatch
        await adaptSession(bot, payload);

        // 返回成功响应
        koaCtx.body = { code: 0, message: 'success' };
      });
      ctx.logger.info(`Created bot instance for ${bot.selfId} at path ${botConfig.path}`);
    }
  });

  ctx.on('dispose', async () =>
  {
    isDisposing = true;
    for (const bot of bots)
    {
      await bot.stop();
    }
    ctx.logger.info('All Yunhu bots stopped.');
    bots.length = 0; // 清空数组
  });
}
