import { Context, HTTP } from 'koishi';
import { BaseUploader } from './BaseUploader';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { YunhuBot } from '../bot/bot';
import { } from 'koishi-plugin-ffmpeg';

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
        this.bot.loggerInfo('检测到 HTTP/HTTPS URL，开始下载视频');
        const { data, filename, type } = await this.http.file(url, { timeout: 60000 });
        const buffer = Buffer.from(data);

        // 记录原始大小
        const originalSize = buffer.length;
        const originalMB = (originalSize / (1024 * 1024)).toFixed(2);
        this.bot.loggerInfo(`原始视频大小: ${originalMB}MB`);

        let finalBuffer = buffer;

        // 如果视频需要压缩且大小超过限制，使用 ffmpeg 服务进行压缩
        if (originalSize > this.MAX_SIZE)
        {
            this.bot.loggerInfo(`视频超过20MB限制，启动压缩...`);

            let tempInput: string | null = null;
            let tempOutput: string | null = null;

            try
            {
                // 创建临时文件
                tempInput = join(tmpdir(), `input_${Date.now()}.mp4`);
                tempOutput = join(tmpdir(), `output_${Date.now()}.mp4`);

                // 写入原始视频数据
                writeFileSync(tempInput, buffer);

                // 使用文件路径作为输入，输出到文件
                await (this.bot.ctx as Context).ffmpeg.builder()
                    .input(tempInput)
                    .outputOption('-c:v', 'libx264')
                    .outputOption('-crf', '28')
                    .outputOption('-preset', 'fast')
                    .outputOption('-c:a', 'aac')
                    .outputOption('-b:a', '64k')
                    .run('file', tempOutput); // 使用 'file' 类型并指定输出路径

                // 读取压缩后的视频
                finalBuffer = readFileSync(tempOutput);

                const compressedSize = finalBuffer.length;
                const compressedMB = (compressedSize / (1024 * 1024)).toFixed(2);
                this.bot.loggerInfo(`压缩后视频大小: ${compressedMB}MB`);

                // 检查压缩是否有效
                if (compressedSize === 0)
                {
                    throw new Error('压缩后的视频为空');
                }
            } catch (error)
            {
                this.bot.loggerError('视频压缩失败:', error);
                // 如果压缩失败，使用原始视频
                this.bot.loggerInfo('使用原始视频进行上传（可能超过大小限制）');
                finalBuffer = buffer;
            } finally
            {
                // 清理临时文件
                if (tempInput)
                {
                    try
                    {
                        unlinkSync(tempInput);
                    } catch (e)
                    {
                        this.bot.loggerInfo('删除临时输入文件失败:', e);
                    }
                }
                if (tempOutput)
                {
                    try
                    {
                        unlinkSync(tempOutput);
                    } catch (e)
                    {
                        this.bot.loggerInfo('删除临时输出文件失败:', e);
                    }
                }
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