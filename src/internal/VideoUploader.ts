import { HTTP } from 'koishi';
import { FormData, File } from 'formdata-node';
import { BaseUploader } from './BaseUploader';
import { resolveResource } from '../utils/utils';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { YunhuBot } from '../bot/bot';

// 视频上传器
export class VideoUploader extends BaseUploader
{
    constructor(http: HTTP, token: string, apiendpoint: string, ffmpeg: any, bot: YunhuBot)
    {
        super(http, token, apiendpoint, 'video', ffmpeg, bot);
    }

    async upload(video: string | Buffer | any): Promise<string>
    {
        const form = new FormData();

        // 解析资源
        const { buffer, fileName, mimeType } = await resolveResource(
            video,
            'video.mp4',
            'video/mp4',
            this.http
        );

        // 记录原始大小
        const originalSize = buffer.length;
        const originalMB = (originalSize / (1024 * 1024)).toFixed(2);
        this.bot.logInfo(`原始视频大小: ${originalMB}MB`);

        let finalBuffer = buffer;

        // 如果视频需要压缩且大小超过限制，使用 ffmpeg 服务进行压缩
        if (originalSize > this.MAX_SIZE)
        {
            this.bot.logInfo(`视频超过20MB限制，启动压缩...`);

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
                await this.ffmpeg.builder()
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
                this.bot.logInfo(`压缩后视频大小: ${compressedMB}MB`);

                // 检查压缩是否有效
                if (compressedSize === 0)
                {
                    throw new Error('压缩后的视频为空');
                }
            } catch (error)
            {
                this.bot.loggerError('视频压缩失败:', error);
                // 如果压缩失败，使用原始视频
                this.bot.logInfo('使用原始视频进行上传（可能超过大小限制）');
                finalBuffer = buffer;
            } finally
            {
                // 清理临时文件
                if (tempInput)
                {
                    try { unlinkSync(tempInput); } catch (e) { this.bot.logInfo('删除临时输入文件失败:', e); }
                }
                if (tempOutput)
                {
                    try { unlinkSync(tempOutput); } catch (e) { this.bot.logInfo('删除临时输出文件失败:', e); }
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
        const file = new File([finalBuffer], fileName, { type: mimeType });
        form.append('video', file);
        return this.sendFormData(form);
    }
}