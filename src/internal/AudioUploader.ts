import { Context, HTTP } from 'koishi';

import { } from 'koishi-plugin-ffmpeg';

import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compressVideo, parseRgbaToHex } from '../utils/utils';
import { BaseUploader } from './BaseUploader';
import { YunhuBot } from '../bot/bot';
import { SizeLimitError } from '../utils/types';

// 音频上传器
export class AudioUploader extends BaseUploader
{
    constructor(http: HTTP, token: string, apiendpoint: string, bot: YunhuBot)
    {
        // 最终上传的是视频文件
        super(http, token, apiendpoint, 'video', bot);
    }

    async upload(url: string): Promise<string>
    {
        // 下载音频文件
        if (url.length < 500)
        {
            this.bot.logInfo(url);
        }
        const { data, filename, type } = await this.http.file(url, { timeout: this.bot.config.uploadTimeout * 1000 });
        const audioBuffer = Buffer.from(data);
        const audioFilename = filename || 'audio.mp3';

        let tempAudioInput: string | null = null;
        let tempVideoOutput: string | null = null;
        let finalBuffer: Buffer;

        try
        {
            // 将音频数据写入临时文件
            tempAudioInput = join(tmpdir(), `audio_${Date.now()}_${audioFilename}`);
            writeFileSync(tempAudioInput, audioBuffer);

            // 使用 ffmpeg 将音频和背景合并为视频
            this.bot.logInfo('开始将音频转换为视频...');
            tempVideoOutput = join(tmpdir(), `video_from_audio_${Date.now()}.mp4`);

            // 从配置中获取背景颜色并转换为ffmpeg格式
            const hexColor = parseRgbaToHex(this.bot.config.audioBackgroundColor || 'rgba(128, 0, 128, 1)');

            await (this.bot.ctx as Context).ffmpeg.builder()
                .outputOption('-f', 'lavfi')
                .outputOption('-i', `color=c=${hexColor}:s=640x480:r=1`) // 使用配置的颜色
                .input(tempAudioInput) // 输入音频文件
                .outputOption('-shortest') // 以最短的输入（即音频）长度为准
                .outputOption('-c:v', 'libx264')
                .outputOption('-c:a', 'aac')
                .outputOption('-b:a', '128k')
                .outputOption('-preset', 'fast')
                .run('file', tempVideoOutput);

            let convertedVideoBuffer = readFileSync(tempVideoOutput);
            this.bot.logInfo(`音频成功转换为视频, 大小: ${(convertedVideoBuffer.length / (1024 * 1024)).toFixed(2)}MB`);

            // 如果转换后的视频大小超过限制，调用通用压缩函数
            if (convertedVideoBuffer.length > this.MAX_SIZE)
            {
                finalBuffer = await compressVideo(this.bot, convertedVideoBuffer, this.MAX_SIZE);
            } else
            {
                finalBuffer = convertedVideoBuffer;
            }

            // 最终大小验证
            if (finalBuffer.length > this.MAX_SIZE)
            {
                const sizeMB = (finalBuffer.length / (1024 * 1024)).toFixed(2);
                throw new SizeLimitError(`音频转换后的视频大小${sizeMB}MB超过${this.MAX_SIZE / (1024 * 1024)}MB限制`);
            }

            // 上传最终的视频文件
            const form = new FormData();
            const blob = new Blob([Buffer.from(finalBuffer)], { type: 'video/mp4' });
            // 保持原始音频文件名，但后缀改为.mp4
            const videoFilenameBase = audioFilename.includes('.') ? audioFilename.substring(0, audioFilename.lastIndexOf('.')) : audioFilename;
            const videoFilename = `${videoFilenameBase}.mp4`;
            form.append('video', blob, videoFilename);
            return this.sendFormData(form);

        } catch (error)
        {
            this.bot.loggerError('音频处理或上传失败:', error);
            throw new Error(`音频处理失败: ${error.message}`);
        } finally
        {
            // 清理所有临时文件
            if (tempAudioInput) { try { unlinkSync(tempAudioInput); } catch (e) { } }
            if (tempVideoOutput) { try { unlinkSync(tempVideoOutput); } catch (e) { } }
        }
    }
}