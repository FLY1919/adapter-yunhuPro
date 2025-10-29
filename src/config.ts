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
    audioBackgroundColor?: string;
    showConsole?: boolean;
    uploadTimeout: number;
    enableStream: boolean;
    streamDuration?: number;
}

export const Config: Schema<Config> =
    Schema.intersect([
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
                    "botName": "方便识别的名称，无实际作用。记得勾选左侧的开关",
                    "botId": "填入你的机器人ID",
                    "token": "填入你的机器人Token",
                    "path": "/yunhu"
                }])
                .description('机器人配置列表。<br>需填写机器人的ID、Token、监听路径。<br>**注意**：不同机器人 需要设置 **不同的接收路径**，否则视为无效'),
        }).description('基础设置'),

        Schema.object({
            uploadTimeout: Schema.number()
                .default(120)
                .min(30)
                .max(3600)
                .step(1)
                .description('下载/上传文件的超时时间（秒）'),
            audioBackgroundColor: Schema.string()
                .role('color')
                .default("rgba(0, 0, 0, 1)")
                .description('音频转为视频时使用的背景颜色。<br>仅RGB通道生效，A通道（透明度）不生效'),
        }).description('进阶设置'),

        Schema.object({
            enableStream: Schema.boolean()
                .default(false)
                .description('是否开启流式消息。<br>开启后，文本、Markdown消息 将以流式消息方式发送'),
        }).description('流式消息设置'),
        Schema.union([
            Schema.object({
                enableStream: Schema.const(false),
            }),
            Schema.object({
                enableStream: Schema.const(true)
                    .required(),
                streamDuration: Schema.number()
                    .role('slider')
                    .min(1)
                    .max(10)
                    .step(1)
                    .default(2)
                    .description("流式消息总时长（秒）。数值越小 发消息越快。<br>流式消息将被标记为`本内容为AI生成，仅供参考`"),
            }),
        ]),

        Schema.object({
            showConsole: Schema.boolean()
                .default(false)
                .description('是否在侧边栏显示云湖控制台入口'),
        }).description('界面设置'),

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