import { Context, h, Dict, MessageEncoder } from 'koishi';
import { YunhuBot } from './bot';

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

    // 遍历消息元素
    async visit(element: h)
    {
        const { type, attrs, children } = element;
        this.message.push(element);

        try
        {
            if (type === 'text')
            {
                if (this.sendType == undefined)
                {
                    this.sendType = 'text';
                } else if (this.sendType === 'image')
                {
                    this.sendType = 'markdown';
                }
                // 处理文本元素
                this.text += this.sendType === "text" ? element.attrs.content : '';
                this.markdown += this.sendType != "html" ? element.attrs.content : '';
                this.html += element.attrs.content;
            }
            else if (type === 'img' || type === 'image')
            {
                if (this.sendType == undefined)
                {
                    this.sendType = 'image';
                } else if (this.sendType === 'text')
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'image')
                {
                    this.sendType = 'markdown';
                }
                try
                {
                    // 尝试上传图片获取imageKey
                    const img = await this.bot.internal.uploadImageUrl(element.attrs.src ? element.attrs.src : element.attrs.url);
                    this.markdown += this.sendType != "html" ? `\n![美少女大失败](${img.imageurl})\n` : '';
                    this.html += `<img src="${img.url}" alt="FLY可爱~[图片]">`;
                    if (this.sendType === 'image')
                    {
                        this.payload.content.imageKey = img.imagekey;
                        this.payload.contentType = 'image';
                    }

                    //this.payload.content.text += await this.bot.internal.uploadImageUrl(attrs.src)
                } catch (error)
                {
                    this.bot.loggerError(`图片上传失败: ${error}`);
                    // 降级为文本处理
                    this.markdown += this.sendType != "html" ? '~~[图片上传失败]~~ ' : '';
                    this.html += `<span style ="color: red;">美少女大失败</span>`;
                    if (this.sendType === 'image')
                    {
                        this.sendType = 'text';
                        this.text += `[图片上传失败]`;
                    }
                }
            }
            else if (type === 'at')
            {
                if (this.sendType === 'image')
                {
                    // 如果缓冲区中已有图片，先发送
                    await this.flush();
                }
                // 将sendType设置为基于文本的
                if (this.sendType === undefined)
                {
                    this.sendType = 'text';
                }

                const userId = attrs.id;
                if (!userId)
                {
                    await this.render(children);
                    return;
                }

                this.atPayload.push(userId);

                // 获取要显示的用户名
                let userName = attrs.name;
                if (!userName)
                {
                    try
                    {
                        const user = await this.bot.getUser(userId);
                        userName = user.name;
                    } catch (error)
                    {
                        this.bot.logger.warn(`获取用户ID ${userId} 的信息失败，将回退到ID`, error);
                        userName = userId; // 如果获取名称失败，则回退到id
                    }
                }

                // 附加文本表示形式：@username，后跟一个空格和一个零宽度空格以确保安全
                const atText = `@${userName}​ `;
                this.text += atText;
                this.markdown += atText;
                this.html += `<span>${atText}</span>`;
            }
            else if (type === 'br')
            {
                // 处理换行符
                if (this.sendType == undefined)
                {
                    this.sendType = 'text';
                } else if (this.sendType === 'image')
                {
                    this.sendType = 'markdown';
                }
                this.text += this.sendType === "text" ? "\n" : '';
                this.markdown += this.sendType != "html" ? "\n" : '';
                this.html += `<br>`;
            }
            else if (type === 'i18n')
            {
                // i18n 元素只渲染子元素
                await this.render(children);
            }
            else if (type === 'p')
            {
                // 处理段落
                if (this.sendType == undefined)
                {
                    this.sendType = 'text';
                } else if (this.sendType === 'image')
                {
                    this.sendType = 'markdown';
                }
                this.html += '<p>';
                await this.render(children);
                this.html += '</p>';
                this.text += this.sendType === "text" ? "\n" : '';
                this.markdown += this.sendType != "html" ? "\n" : '';
            }
            else if (type === 'a')
            {
                // 处理链接
                if (this.sendType == undefined)
                {
                    this.sendType = 'text';
                } else if (this.sendType === 'image')
                {
                    this.sendType = 'markdown';
                }
                this.text += this.sendType === "markdown" ? element.attrs.href + " " : '';
                this.markdown += this.sendType != "html" ? `**[链接](${element.attrs.href})** ` : '';
                this.html += `<a href="${element.attrs.href}">`;
                await this.render(children);
                this.html += '</a>';
            }
            else if (type === 'file')
            {
                await this.flush();
                if (this.sendType == undefined)
                {
                    this.sendType = 'file';
                }
                try
                {
                    // 尝试上传文件获取fileKey
                    const filekey = await this.bot.internal.uploadFile(element.attrs.src);
                    if (this.sendType === 'file')
                    {
                        this.payload.content.fileKey = filekey;
                    }
                } catch (error)
                {
                    this.bot.loggerError(`文件上传失败: ${error}`);
                    this.sendType = 'text';
                    this.text += `[文件上传失败]`;
                }
                await this.flush();
            }
            else if (type === 'video')
            {
                await this.flush();
                this.sendType = 'video';
                // 处理视频
                try
                {
                    // 尝试上传视频获取videoKey
                    const videokey = await this.bot.internal.uploadVideo(element.attrs.src);
                    this.payload.content.videoKey = videokey;
                    await this.flush();
                } catch (error)
                {
                    this.bot.loggerError(`视频上传失败: ${error}`);
                    this.sendType = 'text';
                    this.text += `[视频上传失败]`;
                    await this.flush();
                }

            }
            else if (type === 'audio')
            {
                await this.flush();
                this.sendType = 'video'; // 最终发送的是视频
                try
                {
                    // 尝试上传音频（它会被转换为视频）获取videoKey
                    const videokey = await this.bot.internal.uploadAudio(element.attrs.src);
                    this.payload.content.videoKey = videokey;
                    await this.flush();
                } catch (error)
                {
                    this.bot.loggerError(`音频上传失败: ${error}`);
                    this.sendType = 'text';
                    this.text += `[音频上传失败]`;
                    await this.flush();
                }
            }
            else if (type === 'yunhu:markdown')
            {
                await this.flush();
                this.sendType = 'markdown';
                await this.render(children);
                await this.flush();
            }
            else if (type === 'message')
            {
                if (attrs.forward)
                {
                    if (this.message.length > 0)
                    {
                        await this.flush();
                    }
                    this.switch_message = false;
                    await this.render(children);
                    this.switch_message = true;
                } else if (!this.switch_message)
                {
                    await this.render(children);

                }
                else
                {

                    await this.flush();
                    await this.render(children);
                    await this.flush();
                }

            }
            else if (type === 'quote')
            {
                this.payload.parentId = attrs.id;
                await this.render(children);
            }
            else if (type === 'author')
            {
                if (this.sendType == undefined)
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'image')
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'text')
                {
                    this.sendType = 'markdown';
                }
                this.markdown += this.sendType != "html" ? `\n**${attrs.name}(${attrs.id})**\n` : '';
                this.html += `\n<strong>${attrs.name}</strong><sub>${attrs.id}</sub><br>`;
                await this.render(children);
            }
            else if (type === 'h1')
            {
                if (this.sendType == undefined)
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'image')
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'text')
                {
                    this.sendType = 'markdown';
                }
                this.markdown += this.sendType != "html" ? '# ' : '';
                this.html += '<h1>';
                await this.render(children);
                this.html += '</h1>';
            }
            else if (type === 'h2')
            {
                if (this.sendType == undefined)
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'image')
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'text')
                {
                    this.sendType = 'markdown';
                }
                this.markdown += this.sendType != "html" ? '## ' : '';
                this.html += '<h2>';
                await this.render(children);
                this.html += '</h2>';
            }
            else if (type === 'h3')
            {
                if (this.sendType == undefined)
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'image')
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'text')
                {
                    this.sendType = 'markdown';
                }
                this.markdown += this.sendType != "html" ? '### ' : '';
                this.html += '<h3>';
                await this.render(children);
                this.html += '</h3>';
            }
            else if (type === 'h5')
            {
                if (this.sendType == undefined)
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'image')
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'text')
                {
                    this.sendType = 'markdown';
                }
                this.markdown += this.sendType != "html" ? '##### ' : '';
                this.html += '<h5>';
                await this.render(children);
                this.html += '</h5>';
            }
            else if (type === 'h6')
            {
                if (this.sendType == undefined)
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'image')
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'text')
                {
                    this.sendType = 'markdown';
                }
                this.markdown += this.sendType != "html" ? '###### ' : '';
                this.html += '<h6>';
                await this.render(children);
                this.html += '</h6>';
            }
            else if (type === 'b')
            {
                if (this.sendType == undefined)
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'image')
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'text')
                {
                    this.sendType = 'markdown';
                }
                this.markdown += this.sendType != "html" ? '**' : '';
                this.html += '<b>';
                await this.render(children);
                this.markdown += this.sendType != "html" ? '**' : '';
                this.html += '</b>';
            }
            else if (type === 'i')
            {
                if (this.sendType == undefined)
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'image')
                {
                    this.sendType = 'markdown';
                } else if (this.sendType === 'text')
                {
                    this.sendType = 'markdown';
                }
                this.markdown += this.sendType != "html" ? '*' : '';
                this.html += '<em>';
                await this.render(children);
                this.markdown += this.sendType != "html" ? '*' : '';
                this.html += '</em>';
            }
            else if (type === 'u' || type === 'sup' || type === 'sub')
            {
                this.sendType = 'html';
                this.sendType = 'html';
                this.html += `</${type}>`;
                await this.render(children);
                this.html += `</${type}>`;
            }
            else
            {
                this.bot.loggerError(`未知消息元素类型: ${type}`);
                await this.render(children);
            }

        } catch (error)
        {
            this.bot.loggerError(error);
        }
    }
}