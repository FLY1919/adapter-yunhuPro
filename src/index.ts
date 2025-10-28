import { Context, Logger, Universal, sleep } from 'koishi';

import { } from '@koishijs/plugin-server';
import { } from '@koishijs/plugin-console';

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

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

export const logger = new Logger('adapter-yunhupro');
export const usage = `
<hr>

<a href="https://fly1919.github.io/adapter-yunhupro/" target="_blank" rel="noopener noreferrer">点击此处查看文档！</a>

<hr>
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

    if (config.showConsole)
    {
      ctx.inject(['console'], (ctx) =>
      {
        ctx.console.addEntry({
          dev: path.resolve(__dirname, './../client/index.ts'),
          prod: path.resolve(__dirname, './../dist'),
        });
      });
    }

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
        bot.logInfo('接收到 payload:\n', JSON.stringify(payload, null, 2));

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

      // 处理 GET 请求，用于给用户提示
      ctx.server.get(botConfig.path, async (koaCtx) =>
      {
        const templatePath = path.resolve(__dirname, '../data/webhook.html');
        const htmlContent = await fs.readFile(templatePath, 'utf-8');

        koaCtx.type = 'html';
        koaCtx.body = htmlContent;

      });
      ctx.logger.info(`[${bot.selfId}] 机器人上线，创建监听：http://localhost:${ctx.server.port}${botConfig.path}`);
    }
  });

  ctx.on('dispose', async () =>
  {
    isDisposing = true;
    for (const bot of bots)
    {
      await bot.stop();
    }
    ctx.logger.info('适配器已停止运行。');
    bots.length = 0; // 清空数组
  });
}
