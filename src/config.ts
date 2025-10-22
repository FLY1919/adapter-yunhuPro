import { Schema } from 'koishi';

export interface BotTableItem
{
    enable: boolean;
    botName: string;
    botId: string;
    token: string;
    path: string;
}

export interface Config
{
    endpoint?: string;
    endpointweb?: string;
    resourceEndpoint?: string;
    loggerinfo: boolean;
    botTable: BotTableItem[];
}

export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
        botTable: Schema.array(
            Schema.object({
                enable: Schema.boolean()
                    .default(true)
                    .description('启用'),
                botName: Schema.string()
                    .description('标识名称'),
                botId: Schema.string()
                    .description('账号ID'),
                token: Schema.string()
                    .description('Token')
                    .role('secret'),
                path: Schema.string()
                    .default('/yunhu')
                    .description('监听路径'),
            }))
            .role('table')
            .default([{
                "enable": false,
                "botName": "方便识别的名称，无实际作用。记得勾选左侧的开关。",
                "botId": "填入你的机器人ID",
                "token": "填入你的机器人Token",
                "path": "/yunhu"
            }])
            .description('机器人配置列表。<br>需填写机器人的ID、Token、监听路径。<br>**注意**：不同机器人 需要设置 **不同的接收路径**'),
    }).description('基础设置'),

    Schema.object({
        endpoint: Schema.string()
            .default('https://chat-go.jwzhd.com/open-apis/v1')
            .description('云湖 API 地址，请勿修改')
            .role('link'),
        endpointweb: Schema.string()
            .default('https://chat-web-go.jwzhd.com/v1')
            .description('云湖 web API 地址，请勿修改')
            .role('link'),
        resourceEndpoint: Schema.string()
            .default('https://chat-img.jwznb.com/')
            .description('资源服务器地址，请勿修改')
            .role('link'),
    }).description('连接设置'),

    Schema.object({
        loggerinfo: Schema.boolean()
            .default(false)
            .description("日志调试模式")
            .experimental(),
    }).description('调试设置'),
]);