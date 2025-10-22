import { Context, sleep } from 'koishi';
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
  let isDisposing = false;
  let bot: YunhuBot | null = null;

  ctx.on('ready', async () =>
  {
    if (process.env.NODE_ENV === 'development' && !__dirname.includes('node_modules'))
    {
      await sleep(1 * 1000);  // 神秘步骤，可以保佑dev模式
    }

    if (isDisposing)
    {
      return;
    }

    // 清理旧实例
    if (bot)
    {
      try
      {
        bot.setDisposing(true);
        await Promise.race([
          bot.stop(),
          new Promise(resolve => setTimeout(resolve, 500))
        ]);
      } catch (error)
      {
        if (bot)
        {
          bot.loggerError('清理旧适配器失败:', error);
        } else
        {
          ctx.logger.error('清理旧适配器失败:', error);
        }
      }
    }

    if (isDisposing)
    {
      return;
    }

    // 创建机器人
    bot = new YunhuBot(ctx, config);
    ctx.logger.info('云湖适配器插件启动完成');

    // Koishi 会自动调用 bot.start()
  });

  ctx.on('dispose', async () =>
  {
    if (isDisposing) return;
    isDisposing = true;

    if (bot)
    {
      try
      {
        // 立即停用
        bot.setDisposing(true);
        await Promise.race([
          bot.stop(),
          new Promise(resolve => setTimeout(resolve, 1000))
        ]);
        ctx.logger.info('云湖适配器已停止运行');
      } catch (error)
      {
        ctx.logger.error('云湖适配器停止失败:', error);
      } finally
      {
        bot = null;
      }
    }
  });
}
