import { HTTP } from 'koishi';
import { FormData, File } from 'formdata-node';
import { BaseUploader } from './BaseUploader';
import { resolveResource } from '../utils/utils';
import { YunhuBot } from '../bot/bot';

// 文件上传器
export class FileUploader extends BaseUploader
{
    constructor(http: HTTP, token: string, apiendpoint: string, bot: YunhuBot)
    {
        super(http, token, apiendpoint, 'file', bot);
    }

    async upload(fileData: string | Buffer | any): Promise<string>
    {
        const form = new FormData();

        // 解析资源
        const { buffer, fileName, mimeType } = await resolveResource(
            fileData,
            'file.dat',
            'application/octet-stream',
            this.http
        );

        // 大小验证
        if (buffer.length > this.MAX_SIZE)
        {
            throw new Error(`文件大小超过${this.MAX_SIZE / (1024 * 1024)}MB限制`);
        }

        // 创建文件对象并上传
        const file = new File([buffer], fileName, { type: mimeType });
        form.append('file', file);
        return this.sendFormData(form);
    }
}