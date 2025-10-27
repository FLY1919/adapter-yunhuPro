import { HTTP, Dict } from 'koishi';

import { createHash } from 'node:crypto';

import { BaseUploader } from './BaseUploader';
import { YunhuBot } from '../bot/bot';

// 图片上传器
export class ImageUploader extends BaseUploader
{
    constructor(http: HTTP, token: string, apiendpoint: string, bot: YunhuBot)
    {
        super(http, token, apiendpoint,
            'image', bot);
    }

    async upload(url: string): Promise<string>
    {
        return this.processUpload(url);
    }

    async uploadGetUrl(url: string): Promise<Dict>
    {
        return this.processUpload(url, true);
    }

    // 私有方法，处理上传逻辑
    private async processUpload(url: string, returnUrl: boolean = false): Promise<any>
    {
        // 从URL获取文件
        const { data, filename, type: mimeType } = await this.http.file(url, { timeout: this.bot.config.uploadTimeout * 1000 });
        const buffer = Buffer.from(data);

        // 记录检测到的MIME类型
        this.bot.logInfo(`检测到的MIME类型: ${mimeType}`);

        // 验证图片格式
        const validImageTypes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/bmp',
            'image/tiff',
            'image/svg+xml',
            'image/x-icon',
            "image/jpg"
        ];

        if (!validImageTypes.includes(mimeType))
        {
            this.bot.loggerError(`不支持的图片格式: ${mimeType}`);
            throw new Error(`不支持的图片格式: ${mimeType}`);
        }

        // 记录图片信息
        const originalSize = buffer.length;
        const originalMB = (originalSize / (1024 * 1024)).toFixed(2);
        this.bot.logInfo(`图片: 类型=${mimeType}, 大小=${originalMB}MB`);

        // 大小检查
        if (originalSize > this.MAX_SIZE)
        {
            const sizeMB = (originalSize / (1024 * 1024)).toFixed(2);
            this.bot.loggerError(`图片大小${sizeMB}MB，超过10MB限制，无法上传`);
            throw new Error(`图片大小${sizeMB}MB，超过10MB限制，无法上传`);
        }

        // 创建表单并上传
        const form = new FormData();
        const blob = new Blob([buffer], { type: mimeType });
        form.append('image', blob, filename);

        if (returnUrl)
        {
            // 计算图片哈希用于生成URL
            const hash = createHash('md5');
            hash.update(buffer);
            const imageHash = hash.digest('hex');
            const extension = mimeType.split('/')[1] || 'png';
            this.bot.logInfo(`图片哈希: ${imageHash}, 扩展名: ${extension}`);

            const imagekey = await this.sendFormData(form);
            const imageUrl = `${this.bot.config.resourceEndpoint}${imageHash}.${extension}`;
            this.bot.logInfo(`生成的图片URL: ${imageUrl}`);

            return {
                imageurl: imageUrl,
                imagekey
            };
        } else
        {
            return this.sendFormData(form);
        }
    }
}