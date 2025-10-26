import { Context, HTTP } from 'koishi';

import { } from 'koishi-plugin-ffmpeg';

import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BaseUploader } from './BaseUploader';
import { YunhuBot } from '../bot/bot';

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
        this.bot.logInfo('检测到 HTTP/HTTPS URL，开始下载视频');
        const { data, filename, type } = await this.http.file(url, { timeout: 60000 });
        const buffer = Buffer.from(data);

        // 记录原始大小
        const originalSize = buffer.length;
        const originalMB = (originalSize / (1024 * 1024)).toFixed(2);
        this.bot.logInfo(`原始视频大小: ${originalMB}MB`);

        let finalBuffer = buffer;

        // 单次快速压缩
        if (originalSize > this.MAX_SIZE)
        {
            this.bot.logInfo(`视频超过20MB限制，启动快速压缩...`);

            let tempInput: string | null = null;
            let tempOutput: string | null = null;

            try
            {
                tempInput = join(tmpdir(), `input_${Date.now()}.mp4`);
                writeFileSync(tempInput, buffer);

                // CRF每增加6，码率大约减半
                const sizeRatio = originalSize / (this.MAX_SIZE * 0.9);
                // 根据大小比例增加CRF
                const crfIncrement = 6 * Math.log2(sizeRatio);
                // 目标CRF，向上取整
                // 设置一个上限(e.g., 45)防止质量过低
                const targetCrf = Math.min(Math.ceil(28 + crfIncrement), 45);

                this.bot.logInfo(`原始/目标大小比例: ${sizeRatio.toFixed(2)}x, 估算目标CRF: ${targetCrf}`);

                // 执行单次压缩
                tempOutput = join(tmpdir(), `output_${Date.now()}.mp4`);
                await (this.bot.ctx as Context).ffmpeg.builder()
                    .input(tempInput)
                    .outputOption('-c:v', 'libx264')
                    .outputOption('-crf', String(targetCrf))
                    .outputOption('-preset', 'fast') // 速度优先
                    .outputOption('-c:a', 'aac')
                    .outputOption('-b:a', '64k')
                    .run('file', tempOutput);

                // 读取压缩后的视频
                finalBuffer = readFileSync(tempOutput);
                const compressedSize = finalBuffer.length;
                const compressedMB = (compressedSize / (1024 * 1024)).toFixed(2);
                this.bot.logInfo(`压缩后视频大小: ${compressedMB}MB`);

                if (compressedSize === 0)
                {
                    throw new Error('压缩后的视频为空');
                }

                // 检查压缩后的大小
                if (compressedSize > this.MAX_SIZE)
                {
                    this.bot.logInfo(`单次压缩后文件仍然过大 (${compressedMB}MB)，将放弃上传。`);
                    throw new Error(`视频压缩后大小为 ${compressedMB}MB，仍然超过20MB限制`);
                }
            } catch (error)
            {
                this.bot.loggerError('视频压缩失败:', error);
                // 如果压缩失败，直接抛出错误
                throw new Error(`视频处理失败: ${error.message}`);
            } finally
            {
                // 清理临时文件
                if (tempInput) { try { unlinkSync(tempInput); } catch (e) { this.bot.logInfo('删除临时输入文件失败:', e); } }
                if (tempOutput) { try { unlinkSync(tempOutput); } catch (e) { this.bot.logInfo('删除临时输出文件失败:', e); } }
            }
        }

        // 最终大小验证
        if (finalBuffer.length > this.MAX_SIZE)
        {
            const sizeMB = (finalBuffer.length / (1024 * 1024)).toFixed(2);
            throw new Error(`视频大小${sizeMB}MB超过${this.MAX_SIZE / (1024 * 1024)}MB限制`);
        }

        // 创建文件对象并上传
        // 创建表单并上传
        const form = new FormData();
        const blob = new Blob([finalBuffer], { type: type || 'video/mp4' });
        form.append('video', blob, filename || 'video.mp4');
        return this.sendFormData(form);
    }
}