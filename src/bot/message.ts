import { Context, h, Dict, MessageEncoder, Fragment } from 'koishi';
import { YunhuBot } from './bot';

export async function fragmentToPayload(bot: YunhuBot, fragment: Fragment): Promise<{ contentType: string; content: any; }>
{
    const elements = h.normalize(fragment);
    if (!elements.length) return null;

    // 创建一个模拟的上下文，用于收集状态
    const context = {
        bot,
        sendType: undefined,
        text: '',
        markdown: '',
        html: '',
        atPayload: [],
        imageKey: undefined,
        fileKey: undefined,
        videoKey: undefined,
        // editMessage不支持分段发送，所以flush是空操作
        flush: async () => { },
        // render需要递归调用_visit
        render: async (children) =>
        {
            for (const child of children)
            {
                await _visit(context, child);
            }
        },
    };

    await context.render(elements);

    const { sendType, text, markdown, html, atPayload, imageKey, fileKey, videoKey } = context;

    if (!imageKey && !fileKey && !videoKey && !text.trim() && !markdown.trim() && !html.trim())
    {
        return null;
    }

    const finalContentType = sendType || 'text';
    const finalContent: any = {};

    if (finalContentType === 'text')
    {
        finalContent.text = text;
    } else if (finalContentType === 'markdown')
    {
        finalContent.text = markdown;
    } else if (finalContentType === 'html')
    {
        finalContent.text = html;
    }

    if (imageKey) finalContent.imageKey = imageKey;
    if (fileKey) finalContent.fileKey = fileKey;
    if (videoKey) finalContent.videoKey = videoKey;
    if (atPayload.length > 0) finalContent.at = atPayload;

    if (!finalContent.text)
    {
        finalContent.text = '';
    }

    return { contentType: finalContentType, content: finalContent };
}

export class YunhuMessageEncoder extends MessageEncoder<Context, YunhuBot>
{
    // 使用 payload 存储待发送的消息
    private payload: Dict;
    private sendType: 'text' | 'image' | 'video' | 'file' | 'markdown' | 'html' | undefined = undefined;
    private html = "";
    private text = "";
    private markdown = "";
    private atPayload: string[] = [];
    private message: Dict = [];
    private switch_message: boolean = true;
    private messageId: string;

    getMessageId(): string
    {
        return this.messageId;
    }

    async prepare()
    {
        let [type, id] = this.channelId.split(':');
        const recvId = id;
        const recvType = type === 'private' ? 'user' : type;

        // 初始化 payload
        this.payload = {
            recvId,
            recvType,
            contentType: 'text',
            content: {
                imageKey: undefined,
                fileKey: undefined,
                videoKey: undefined,
                text: ''
            },
            parentId: this.session.quote ? this.session.quote.id : undefined
        };
    }

    // 将发送好的消息添加到 results 中
    async addResult(data: any)
    {
        const message = data;
        //this.message.push(message)
        const session = this.bot.session();
        session.channelId = this.channelId;
        //session.event.message.id = message.msgId
        session.event.message = {
            id: message.msgId,
            elements: message,
            //等主播放假再改
        };
        //session.quote.id = message.parentId? message.parentId : undefined
        if (message.parentId)
        {
            session.event.message.quote.id = message.parentId;
        }
        session.app.emit(session, 'send', session);
    }

    // 发送缓冲区内的消息
    async flush()
    {
        async function reset()
        {
            this.payload.content.text = '';
            this.sendType = undefined;
            this.payload.content.imageKey = undefined;
            this.payload.content.fileKey = undefined;
            this.payload.content.videoKey = undefined;
            this.payload.contentType = 'text';
            this.html = "";
            this.text = "";
            this.markdown = "";
            this.message = [];
            this.atPayload = [];
            delete this.payload.content.at; // Remove at from content.
        }

        if (!this.payload.content.imageKey && !this.payload.content.fileKey && !this.payload.content.videoKey && !this.text && !this.markdown && !this.html)
        {
            return; // Nothing to send.
        }

        if (!this.sendType)
        {
            this.sendType = 'text';
        }
        this.payload.contentType = this.sendType;

        if (this.sendType === 'text')
        {
            this.payload.content.text = this.text;
        } else if (this.sendType === 'markdown')
        {
            this.payload.content.text = this.markdown;
        } else if (this.sendType === 'html')
        {
            this.payload.content.text = this.html;
        }

        if (this.atPayload.length > 0)
        {
            this.payload.content.at = this.atPayload;
        }

        this.bot.logInfo('将发送 payload：\n', JSON.stringify(this.payload, null, 2));
        const response = await this.bot.internal.sendMessage(this.payload);

        if (response.code === 1 && response.data?.messageInfo?.msgId)
        {
            this.messageId = response.data.messageInfo.msgId;
        }

        await reset.call(this);
    }

    async visit(element: h)
    {
        await _visit(this, element);
    }
}

async function _visit(ctx: any, element: h)
{
    const { type, attrs, children } = element;
    if (ctx.message)
    {
        ctx.message.push(element);
    }

    try
    {
        switch (type)
        {
            case 'text':
                if (ctx.sendType == undefined)
                {
                    ctx.sendType = 'text';
                } else if (ctx.sendType === 'image')
                {
                    ctx.sendType = 'markdown';
                }
                ctx.text += ctx.sendType === "text" ? element.attrs.content : '';
                ctx.markdown += ctx.sendType != "html" ? element.attrs.content : '';
                ctx.html += element.attrs.content;
                break;
            case 'img':
            case 'image':
                if (ctx.sendType == undefined)
                {
                    ctx.sendType = 'image';
                } else if (ctx.sendType === 'text' || ctx.sendType === 'image')
                {
                    ctx.sendType = 'markdown';
                }
                try
                {
                    const img = await ctx.bot.internal.uploadImageUrl(element.attrs.src ? element.attrs.src : element.attrs.url);
                    ctx.markdown += ctx.sendType != "html" ? `\n![美少女大失败](${img.imageurl})\n` : '';
                    ctx.html += `<img src="${img.url}" alt="FLY可爱~[图片]">`;
                    if (ctx.sendType === 'image')
                    {
                        // 区分YunhuMessageEncoder和fragmentToPayload的上下文
                        if (ctx.payload?.content)
                        {
                            ctx.payload.content.imageKey = img.imagekey;
                            ctx.payload.contentType = 'image';
                        } else
                        {
                            ctx.imageKey = img.imagekey;
                        }
                    }
                } catch (error)
                {
                    ctx.bot.loggerError(`图片上传失败: ${error}`);
                    ctx.markdown += ctx.sendType != "html" ? '~~[图片上传失败]~~ ' : '';
                    ctx.html += `<span style ="color: red;">美少女大失败</span>`;
                    if (ctx.sendType === 'image')
                    {
                        ctx.sendType = 'text';
                        ctx.text += `[图片上传失败]`;
                    }
                }
                break;
            case 'at':
                if (ctx.sendType === 'image')
                {
                    await ctx.flush();
                }
                if (ctx.sendType === undefined)
                {
                    ctx.sendType = 'text';
                }
                const userId = attrs.id;
                if (!userId)
                {
                    await ctx.render(children);
                    return;
                }
                ctx.atPayload.push(userId);
                let userName = attrs.name;
                if (!userName)
                {
                    try
                    {
                        const user = await ctx.bot.getUser(userId);
                        userName = user.name;
                    } catch (error)
                    {
                        ctx.bot.logger.warn(`获取用户ID ${userId} 的信息失败，将回退到ID`, error);
                        userName = userId;
                    }
                }
                const atText = `@${userName}​ `;
                ctx.text += atText;
                ctx.markdown += atText;
                ctx.html += `<span>${atText}</span>`;
                break;
            case 'br':
                if (ctx.sendType == undefined)
                {
                    ctx.sendType = 'text';
                } else if (ctx.sendType === 'image')
                {
                    ctx.sendType = 'markdown';
                }
                ctx.text += ctx.sendType === "text" ? "\n" : '';
                ctx.markdown += ctx.sendType != "html" ? "\n" : '';
                ctx.html += `<br>`;
                break;
            case 'p':
                if (ctx.sendType == undefined)
                {
                    ctx.sendType = 'text';
                } else if (ctx.sendType === 'image')
                {
                    ctx.sendType = 'markdown';
                }
                ctx.html += '<p>';
                await ctx.render(children);
                ctx.html += '</p>';
                ctx.text += ctx.sendType === "text" ? "\n" : '';
                ctx.markdown += ctx.sendType != "html" ? "\n" : '';
                break;
            case 'a':
                if (ctx.sendType == undefined)
                {
                    ctx.sendType = 'text';
                } else if (ctx.sendType === 'image')
                {
                    ctx.sendType = 'markdown';
                }
                ctx.text += ctx.sendType === "markdown" ? element.attrs.href + " " : '';
                ctx.markdown += ctx.sendType != "html" ? `**[链接](${element.attrs.href})** ` : '';
                ctx.html += `<a href="${element.attrs.href}">`;
                await ctx.render(children);
                ctx.html += '</a>';
                break;
            case 'file':
                await ctx.flush();
                ctx.sendType = 'file';
                try
                {
                    const filekey = await ctx.bot.internal.uploadFile(element.attrs.src);
                    if (ctx.payload?.content)
                    {
                        ctx.payload.content.fileKey = filekey;
                    } else
                    {
                        ctx.fileKey = filekey;
                    }
                } catch (error)
                {
                    ctx.bot.loggerError(`文件上传失败: ${error}`);
                    ctx.sendType = 'text';
                    ctx.text += `[文件上传失败]`;
                }
                await ctx.flush();
                break;
            case 'video':
                await ctx.flush();
                ctx.sendType = 'video';
                try
                {
                    const videokey = await ctx.bot.internal.uploadVideo(element.attrs.src);
                    if (ctx.payload?.content)
                    {
                        ctx.payload.content.videoKey = videokey;
                    } else
                    {
                        ctx.videoKey = videokey;
                    }
                    await ctx.flush();
                } catch (error)
                {
                    ctx.bot.loggerError(`视频上传失败: ${error}`);
                    ctx.sendType = 'text';
                    ctx.text += `[视频上传失败]`;
                    await ctx.flush();
                }
                break;
            case 'audio':
                await ctx.flush();
                ctx.sendType = 'video'; // 最终发送的是视频
                try
                {
                    const videokey = await ctx.bot.internal.uploadAudio(element.attrs.src);
                    if (ctx.payload?.content)
                    {
                        ctx.payload.content.videoKey = videokey;
                    } else
                    {
                        ctx.videoKey = videokey;
                    }
                    await ctx.flush();
                } catch (error)
                {
                    ctx.bot.loggerError(`音频上传失败: ${error}`);
                    ctx.sendType = 'text';
                    ctx.text += `[音频上传失败]`;
                    await ctx.flush();
                }
                break;
            case 'markdown':
            case 'yunhu:markdown':
                await ctx.flush();
                ctx.sendType = 'markdown';
                await ctx.render(children);
                await ctx.flush();
                break;
            case 'html':
            case 'yunhu:html':
                await ctx.flush();
                ctx.sendType = 'html';
                await ctx.render(children);
                await ctx.flush();
                break;
            case 'message':
                if (attrs.forward)
                {
                    if (ctx.message.length > 0)
                    {
                        await ctx.flush();
                    }
                    ctx.switch_message = false;
                    await ctx.render(children);
                    ctx.switch_message = true;
                } else if (!ctx.switch_message)
                {
                    await ctx.render(children);
                }
                else
                {
                    await ctx.flush();
                    await ctx.render(children);
                    await ctx.flush();
                }
                break;
            case 'quote':
                if (ctx.payload)
                {
                    ctx.payload.parentId = attrs.id;
                }
                await ctx.render(children);
                break;
            case 'author':
                if (ctx.sendType == undefined || ctx.sendType === 'image' || ctx.sendType === 'text')
                {
                    ctx.sendType = 'markdown';
                }
                ctx.markdown += ctx.sendType != "html" ? `\n**${attrs.name}(${attrs.id})**\n` : '';
                ctx.html += `\n<strong>${attrs.name}</strong><sub>${attrs.id}</sub><br>`;
                await ctx.render(children);
                break;
            case 'h1':
            case 'h2':
            case 'h3':
            case 'h4':
            case 'h5':
            case 'h6':
                if (ctx.sendType == undefined || ctx.sendType === 'image' || ctx.sendType === 'text')
                {
                    ctx.sendType = 'markdown';
                }
                const level = parseInt(type.substring(1));
                ctx.markdown += ctx.sendType != "html" ? `${'#'.repeat(level)} ` : '';
                ctx.html += `<${type}>`;
                await ctx.render(children);
                ctx.html += `</${type}>`;
                break;
            case 'b':
                if (ctx.sendType == undefined || ctx.sendType === 'image' || ctx.sendType === 'text')
                {
                    ctx.sendType = 'markdown';
                }
                ctx.markdown += ctx.sendType != "html" ? '**' : '';
                ctx.html += '<b>';
                await ctx.render(children);
                ctx.markdown += ctx.sendType != "html" ? '**' : '';
                ctx.html += '</b>';
                break;
            case 'i':
                if (ctx.sendType == undefined || ctx.sendType === 'image' || ctx.sendType === 'text')
                {
                    ctx.sendType = 'markdown';
                }
                ctx.markdown += ctx.sendType != "html" ? '*' : '';
                ctx.html += '<em>';
                await ctx.render(children);
                ctx.markdown += ctx.sendType != "html" ? '*' : '';
                ctx.html += '</em>';
                break;
            case 'pre':
            case 'i18n':
                await ctx.render(children);
                break;
            case 'u':
            case 'sup':
            case 'sub':
                ctx.sendType = 'html';
                ctx.html += `<${type}>`;
                await ctx.render(children);
                ctx.html += `</${type}>`;
                break;
            default:
                ctx.bot.loggerError(`未知消息元素类型: ${type}`, element);
                await ctx.render(children);
                break;
        }
    } catch (error)
    {
        ctx.bot.loggerError(error);
    }
}