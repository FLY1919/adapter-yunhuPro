import { HTTP } from 'koishi';

import { BaseUploader } from './BaseUploader';
import { YunhuBot } from '../bot/bot';

// 文件上传器
export class FileUploader extends BaseUploader
{
    constructor(http: HTTP, token: string, apiendpoint: string, bot: YunhuBot)
    {
        super(http, token, apiendpoint, 'file', bot);
    }

    async upload(url: string): Promise<string>
    {
        // 从URL获取文件
        const { data, filename, type } = await this.http.file(url, { timeout: this.bot.config.uploadTimeout * 1000 });
        const buffer = Buffer.from(data);

        // 大小验证
        if (buffer.length > this.MAX_SIZE)
        {
            throw new Error(`文件大小超过${this.MAX_SIZE / (1024 * 1024)}MB限制`);
        }

        // 创建表单并上传
        const form = new FormData();
        const blob = new Blob([data], { type: type || 'application/octet-stream' });
        form.append('file', blob, filename || 'file');
        return this.sendFormData(form);
    }
}