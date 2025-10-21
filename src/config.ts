import { Schema } from 'koishi';

export const YUNHU_ENDPOINT = 'https://chat-go.jwzhd.com';
export const YUNHU_ENDPOINT_WEB = 'https://chat-web-go.jwzhd.com';

export interface Config
{
    token: string;
    endpoint?: string;
    endpointweb?: string;
    _host: string;
    path_host: string;
    path?: string;
    cat?: string;
    ffmpegPath?: string;
    ffmpeg?: boolean;
    loggerinfo: boolean;
}

export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
        cat: Schema.string()
            .default('猫娘')
            .description('她很可爱，你可以摸摸').hidden(),
    }).description('基础设置'),

    Schema.object({
        endpoint: Schema.string()
            .default(YUNHU_ENDPOINT)
            .description('云湖 API 地址，默认无需修改'),
        endpointweb: Schema.string()
            .default(YUNHU_ENDPOINT_WEB)
            .description('云湖 API 地址，默认无需修改'),
        path: Schema.string()
            .default('/yunhu')
            .description('Webhook 接收路径'),
        token: Schema.string()
            .required()
            .description('机器人 Token'),
    }).description('连接设置'),

    Schema.object({
        ffmpeg: Schema.boolean()
            .default(false)
            .role('boolean')
            .description('FFmpeg 是否启用视频压缩功能，启用后可发送视频消息，默认关闭'),
        _host: Schema.string()
            .default('http://127.0.0.1:5140/pic')
            .description('图片反代'),
        path_host: Schema.string()
            .default('/pic')
            .description('图片反代'),
        ffmpegPath: Schema.string()
            .description('FFmpeg 可执行文件路径')
            .default('')
            .role('path')
    }).description('进阶设置'),

    Schema.object({
        loggerinfo: Schema.boolean().default(false).description("日志调试模式").experimental(),
    }).description('调试设置'),
]);