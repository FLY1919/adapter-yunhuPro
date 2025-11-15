import { HTTP } from 'koishi';

import { BaseUploader } from './BaseUploader';
import { YunhuBot } from '../bot/bot';
import { SizeLimitError } from '../utils/types';

// 文件上传器
export class FileUploader extends BaseUploader
{
  constructor(http: HTTP, token: string, apiendpoint: string, bot: YunhuBot)
  {
    super(http, token, apiendpoint, 'file', bot);
  }

  async upload(url: string): Promise<string>
  {
    return this.processUpload(url);
  }

  async uploadGetKey(url: string): Promise<{ url: string; key: string; }>
  {
    return this.processUpload(url, true);
  }

  private async processUpload(url: string, returnKey: boolean = false): Promise<any>
  {
    // 从URL获取文件
    if (url.length < 500)
    {
      this.bot.logInfo(url);
    }
    const { data, filename, type } = await this.http.file(url, { timeout: this.bot.config.uploadTimeout * 1000 });
    const buffer = Buffer.from(data);

    // 大小验证
    if (buffer.length > this.MAX_SIZE)
    {
      throw new SizeLimitError(`文件大小超过${this.MAX_SIZE / (1024 * 1024)}MB限制`);
    }

    // 创建表单并上传
    const form = new FormData();
    const blob = new Blob([data], { type: type || 'application/octet-stream' });
    const extension = (type && type.split('/')[1]) || 'dat';
    const finalFilename = filename && filename.includes('.') ? filename : `${filename || 'file'}.${extension}`;
    form.append('file', blob, finalFilename);
    const fileKey = await this.sendFormData(form);


    const fileUrl = `${this.bot.config.resourceEndpoint}${fileKey}.${extension}`;
    this.bot.logInfo(`生成的文件URL: ${fileUrl}`);
    if (returnKey)
    {
      return {
        url: fileUrl,
        key: fileKey
      };
    }
    return fileUrl;
  }
}