import { Context, HTTP } from 'koishi';

import { } from 'koishi-plugin-ffmpeg';

import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BaseUploader } from './BaseUploader';
import { YunhuBot } from '../bot/bot';
import { compressVideo } from '../utils/utils';

// 视频上传器
export class VideoUploader extends BaseUploader
{
    constructor(http: HTTP, token: string, apiendpoint: string, bot: YunhuBot)
    {
        super(http, token, apiendpoint, 'video', bot);
    }

    async upload(url: string): Promise<string>
    {
        // 从URL获取文件
        const { data, filename, type } = await this.http.file(url, { timeout: this.bot.config.uploadTimeout * 1000 });
        const buffer = Buffer.from(data);

        // 记录原始大小
        const originalSize = buffer.length;
        const originalMB = (originalSize / (1024 * 1024)).toFixed(2);
        this.bot.logInfo(`原始视频大小: ${originalMB}MB`);

        let finalBuffer = buffer;

        // 如果视频大小超过限制，调用通用压缩函数
        if (originalSize > this.MAX_SIZE)
        {
            try
            {
                finalBuffer = Buffer.from(await compressVideo(this.bot, buffer, this.MAX_SIZE));
            } catch (error)
            {
                // 压缩失败，直接抛出错误
                throw new Error(`视频处理失败: ${error.message}`);
            }
        }

        // 最终大小验证
        if (finalBuffer.length > this.MAX_SIZE)
        {
            const sizeMB = (finalBuffer.length / (1024 * 1024)).toFixed(2);
            throw new Error(`视频大小${sizeMB}MB超过${this.MAX_SIZE / (1024 * 1024)}MB限制`);
        }

        // 创建表单并上传
        const form = new FormData();
        const blob = new Blob([finalBuffer], { type: type || 'video/mp4' });
        form.append('video', blob, filename || 'video.mp4');
        return this.sendFormData(form);
    }
}