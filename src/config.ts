import { Schema } from 'koishi';

export interface BotTableItem
{
    enable: boolean;
    botId: string;
    token: string;
    path: string;
}

export interface Config
{
    endpoint?: string;
    endpointweb?: string;
    loggerinfo: boolean;
    botTable: BotTableItem[];
}

export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
        botTable: Schema.array(Schema.object({
            enable: Schema.boolean()
                .default(true)
                .description('启用'),
            botId: Schema.string()
                .required()
                .description('账号ID'),
            token: Schema.string()
                .required()
                .description('Token')
                .role('secret'),
            path: Schema.string()
                .default('/yunhu')
                .description('Webhook 接收路径'),
        })).role('table').description('机器人列表'),
    }).description('基础设置'),

    Schema.object({
        endpoint: Schema.string()
            .default('https://chat-go.jwzhd.com')
            .description('云湖 API 地址，默认无需修改')
            .role('link'),
        endpointweb: Schema.string()
            .default('https://chat-web-go.jwzhd.com')
            .description('云湖 API 地址，默认无需修改')
            .role('link'),
    }).description('连接设置'),

    Schema.object({
        loggerinfo: Schema.boolean()
            .default(false)
            .description("日志调试模式")
            .experimental(),
    }).description('调试设置'),
]);