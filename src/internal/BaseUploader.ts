import { HTTP } from 'koishi';

import { ResourceType } from '../utils/utils';
import { YunhuBot } from '../bot/bot';
import { SizeLimitError } from '../utils/types';

// 上传基类
export abstract class BaseUploader
{
    protected MAX_SIZE: number;

    constructor(
        protected http: HTTP,
        protected token: string,
        protected apiendpoint: string,
        protected resourceType: ResourceType,
        protected bot: YunhuBot
    )
    {
        // 设置不同资源类型的最大大小限制
        this.MAX_SIZE = resourceType === 'image'
            ? 10 * 1024 * 1024
            : resourceType === 'video'
                ? 20 * 1024 * 1024
                : 100 * 1024 * 1024;
    }

    protected async sendFormData(form: FormData): Promise<string>
    {
        const uploadUrl = `${this.apiendpoint}/${this.resourceType}/upload?token=${this.token}`;

        try
        {
            const res = await this.http.post(uploadUrl, form, { timeout: this.bot.config.uploadTimeout * 1000 });

            if (res.code !== 1)
            {
                // 检查是否是文件大小超限的特定错误
                if (res.msg && (res.msg.includes('大小') || res.msg.toLowerCase().includes('size')))
                {
                    throw new SizeLimitError(`${this.resourceType}上传失败：${res.msg}`);
                }
                throw new Error(`${this.resourceType}上传失败：${res.msg}，响应码${res.code}`);
            }

            this.bot.logInfo(`${this.resourceType}上传成功: key=${res.data[this.resourceType + 'Key']}`);
            return res.data[this.resourceType + 'Key'];
        } catch (error: any)
        {
            this.bot.loggerError(`${this.resourceType}上传请求失败:`, error.message);
            if (HTTP.Error.is(error) && error.response)
            {
                this.bot.loggerError(`响应状态: ${error.response.status}`);
                this.bot.loggerError(`响应体:`, error.response.data);
            }
            throw new Error(`${this.resourceType}上传失败：${error.message}`);
        }
    }

    abstract upload(url: string): Promise<string>;
}