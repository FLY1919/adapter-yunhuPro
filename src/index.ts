import { Context, sleep } from 'koishi';
import { YunhuServer } from './bot/server';
import { Config } from './config';

export * from './config';

export const name = 'adapter-yunhupro';
export const reusable = true;
export const filter = false;
export const inject = {
  required: ['http', 'logger', 'server'],
};

export function apply(ctx: Context, config: Config)
{
  ctx.on('ready', async () =>
  {
    if (process.env.NODE_ENV === 'development' && !__dirname.includes('node_modules'))
    {
      await sleep(1 * 1000);  // 神秘步骤，可以保佑dev模式
    }

    ctx.plugin(YunhuServer, config);

  });

  ctx.on('dispose', async () =>
  {
  });
}
