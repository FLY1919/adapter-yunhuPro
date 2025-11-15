import { Context, h, Dict, MessageEncoder, Fragment } from 'koishi';
import { YunhuBot } from './bot';
import { Button, SizeLimitError } from '../utils/types';

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
    buttons: [],
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

  const { sendType, text, markdown, html, atPayload, imageKey, fileKey, videoKey, buttons } = context;

  if (!imageKey && !fileKey && !videoKey && !text.trim() && !markdown.trim() && !html.trim() && !buttons.length)
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
  if (buttons.length > 0) finalContent.buttons = [buttons];

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
  private buttons: Button[] = [];
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
      this.buttons = [];
      delete this.payload.content.at;
      delete this.payload.content.buttons;
    }

    if (!this.payload.content.imageKey && !this.payload.content.fileKey && !this.payload.content.videoKey && !this.text && !this.markdown && !this.html && !this.buttons.length)
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

    if (this.buttons.length > 0)
    {
      this.payload.content.buttons = [this.buttons];
    }

    this.bot.logInfo('将发送 payload：\n', JSON.stringify(this.payload, null, 2));
    const useStream = this.bot.config.enableStream && (this.payload.contentType === 'text' || this.payload.contentType === 'markdown');

    const response = useStream
      ? await this.bot.internal.sendStreamMessage(this.payload)
      : await this.bot.internal.sendMessage(this.payload);

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

async function _visit(context: any, element: h)
{
  const { type, attrs, children } = element;
  if (context.message)
  {
    context.message.push(element);
  }

  try
  {
    switch (type)
    {
      case 'text':
        if (context.sendType == undefined)
        {
          context.sendType = 'text';
        } else if (context.sendType === 'image')
        {
          context.sendType = 'markdown';
        }
        // 将 <br> 替换为换行符
        const content = element.attrs.content.replace(/<br>/g, '\n');
        context.text += context.sendType === "text" ? content : '';
        context.markdown += context.sendType != "html" ? content : '';
        context.html += content;
        break;
      case 'img':
      case 'image':
        if (context.sendType == undefined)
        {
          context.sendType = 'image';
        } else if (context.sendType === 'text' || context.sendType === 'image')
        {
          context.sendType = 'markdown';
        }
        try
        {
          const img = await context.bot.internal.uploadImageUrl(element.attrs.src ? element.attrs.src : element.attrs.url);
          context.markdown += context.sendType != "html" ? `\n![美少女大失败](${img.url})\n` : '';
          context.html += `<img src="${img.url}" alt="FLY可爱~[图片]">`;
          if (context.sendType === 'image')
          {
            // 区分YunhuMessageEncoder和fragmentToPayload的上下文
            if (context.payload?.content)
            {
              context.payload.content.imageKey = img.key;
              context.payload.contentType = 'image';
            } else
            {
              context.imageKey = img.key;
            }
          }
        } catch (error)
        {
          const isSizeLimitError = error instanceof SizeLimitError;
          const errorMsg = isSizeLimitError ? '[图片大小超限]' : '[图片上传失败]';
          context.bot.loggerError(`${errorMsg}: ${error}`);
          context.markdown += context.sendType != "html" ? `~~${errorMsg}~~ ` : '';
          context.html += `<span style ="color: red;">${errorMsg}</span>`;
          if (context.sendType === 'image')
          {
            context.sendType = 'text';
            context.text += errorMsg;
          }
        }
        break;
      case 'at':
        if (context.sendType === 'image')
        {
          await context.flush();
        }
        if (context.sendType === undefined)
        {
          context.sendType = 'text';
        }
        const userId = attrs.id;
        if (!userId)
        {
          await context.render(children);
          return;
        }
        context.atPayload.push(userId);
        let userName = attrs.name;
        if (!userName)
        {
          try
          {
            const user = await context.bot.getUser(userId);
            userName = user.name;
          } catch (error)
          {
            context.bot.logger.warn(`获取用户ID ${userId} 的信息失败，将回退到ID`, error);
            userName = userId;
          }
        }
        const atText = `@${userName}​ `;
        context.text += atText;
        context.markdown += atText;
        context.html += `<span>${atText}</span>`;
        break;
      case 'p':
        if (context.sendType == undefined)
        {
          context.sendType = 'text';
        } else if (context.sendType === 'image')
        {
          context.sendType = 'markdown';
        }
        context.html += '<p>';
        await context.render(children);
        context.html += '</p>';
        context.text += context.sendType === "text" ? "\n" : '';
        context.markdown += context.sendType != "html" ? "\n" : '';
        break;
      case 'a':
        if (context.sendType == undefined)
        {
          context.sendType = 'text';
        } else if (context.sendType === 'image')
        {
          context.sendType = 'markdown';
        }
        context.text += context.sendType === "markdown" ? element.attrs.href + " " : '';
        context.markdown += context.sendType != "html" ? `**[链接](${element.attrs.href})** ` : '';
        context.html += `<a href="${element.attrs.href}">`;
        await context.render(children);
        context.html += '</a>';
        break;
      case 'file':
        await context.flush();
        context.sendType = 'file';
        try
        {
          const filekey = await context.bot.internal.uploadFile(element.attrs.src);
          if (context.payload?.content)
          {
            context.payload.content.fileKey = filekey;
          } else
          {
            context.fileKey = filekey;
          }
        } catch (error)
        {
          const isSizeLimitError = error instanceof SizeLimitError;
          const errorMsg = isSizeLimitError ? '[文件大小超限]' : '[文件上传失败]';
          context.bot.loggerError(`${errorMsg}: ${error}`);
          context.sendType = 'text';
          context.text += errorMsg;
        }
        await context.flush();
        break;
      case 'video':
        await context.flush();
        context.sendType = 'video';
        try
        {
          const videokey = await context.bot.internal.uploadVideo(element.attrs.src);
          if (context.payload?.content)
          {
            context.payload.content.videoKey = videokey;
          } else
          {
            context.videoKey = videokey;
          }
          await context.flush();
        } catch (error)
        {
          const isSizeLimitError = error instanceof SizeLimitError;
          const errorMsg = isSizeLimitError ? '[视频大小超限]' : '[视频上传失败]';
          context.bot.loggerError(`${errorMsg}: ${error}`);
          context.sendType = 'text';
          context.text += errorMsg;
          await context.flush();
        }
        break;
      case 'audio':
        await context.flush();
        context.sendType = 'video'; // 最终发送的是视频
        try
        {
          const videokey = await context.bot.internal.uploadAudio(element.attrs.src);
          if (context.payload?.content)
          {
            context.payload.content.videoKey = videokey;
          } else
          {
            context.videoKey = videokey;
          }
          await context.flush();
        } catch (error)
        {
          const isSizeLimitError = error instanceof SizeLimitError;
          const errorMsg = isSizeLimitError ? '[音频大小超限]' : '[音频上传失败]';
          context.bot.loggerError(`${errorMsg}: ${error}`);
          context.sendType = 'text';
          context.text += errorMsg;
          await context.flush();
        }
        break;
      case 'button': {
        let buttonLabel = '';
        const queue: h[] = [...children];
        while (queue.length > 0)
        {
          const element = queue.shift();
          if (element.type === 'text')
          {
            buttonLabel += element.attrs.content;
          } else if (element.children)
          {
            queue.unshift(...element.children);
          }
        }
        buttonLabel = buttonLabel.trim();

        if (!buttonLabel && typeof attrs.text === 'string')
        {
          buttonLabel = attrs.text;
        }

        const yunhuButton: Partial<Button> = {};
        switch (attrs.type)
        {
          case 'action':
            yunhuButton.actionType = 3; // 3: 点击汇报
            yunhuButton.value = attrs.text;
            if (!buttonLabel) buttonLabel = '确认点击';
            break;
          case 'link':
            yunhuButton.actionType = 1; // 1: 跳转URL
            yunhuButton.url = attrs.href;
            if (!buttonLabel) buttonLabel = '跳转链接';
            break;
          case 'input':
            yunhuButton.actionType = 2; // 2: 复制
            yunhuButton.value = attrs.text;
            if (!buttonLabel) buttonLabel = '复制';
            break;
          default:
            // Ignore unknown types
            break;
        }

        if (yunhuButton.actionType)
        {
          yunhuButton.text = buttonLabel;
          if (!context.buttons)
          {
            context.buttons = [];
          }
          context.buttons.push(yunhuButton as Button);
        }
        break;
      }
      case 'markdown':
      case 'yunhu:markdown':
        await context.flush();
        context.sendType = 'markdown';
        await context.render(children);
        await context.flush();
        break;
      case 'html':
      case 'yunhu:html':
        await context.flush();
        context.sendType = 'html';
        await context.render(children);
        await context.flush();
        break;
      case 'message':
        if (attrs.forward)
        {
          if (context.message.length > 0)
          {
            await context.flush();
          }
          context.switch_message = false;
          await context.render(children);
          context.switch_message = true;
        } else if (!context.switch_message)
        {
          await context.render(children);
        }
        else
        {
          await context.flush();
          await context.render(children);
          await context.flush();
        }
        break;
      case 'quote':
        if (context.payload)
        {
          context.payload.parentId = attrs.id;
        }
        await context.render(children);
        break;
      case 'author':
        if (context.sendType == undefined || context.sendType === 'image' || context.sendType === 'text')
        {
          context.sendType = 'markdown';
        }
        context.markdown += context.sendType != "html" ? `\n**${attrs.name}(${attrs.id})**\n` : '';
        context.html += `\n<strong>${attrs.name}</strong><sub>${attrs.id}</sub><br>`;
        await context.render(children);
        break;
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        if (context.sendType == undefined || context.sendType === 'image' || context.sendType === 'text')
        {
          context.sendType = 'markdown';
        }
        const level = parseInt(type.substring(1));
        context.markdown += context.sendType != "html" ? `${'#'.repeat(level)} ` : '';
        context.html += `<${type}>`;
        await context.render(children);
        context.html += `</${type}>`;
        break;
      case 'pre':
      case 'i18n':
        await context.render(children);
        break;
      case 'strong':
      case 'b':
        if (context.sendType == undefined || context.sendType === 'image' || context.sendType === 'text')
        {
          context.sendType = 'markdown';
        }
        context.markdown += context.sendType != "html" ? '**' : '';
        context.html += '<b>';
        await context.render(children);
        context.markdown += context.sendType != "html" ? '**' : '';
        context.html += '</b>';
        break;
      case 'i':
      case 'em':
        if (context.sendType == undefined || context.sendType === 'image' || context.sendType === 'text')
        {
          context.sendType = 'markdown';
        }
        context.markdown += context.sendType != "html" ? '*' : '';
        context.html += '<em>';
        await context.render(children);
        context.markdown += context.sendType != "html" ? '*' : '';
        context.html += '</em>';
        break;
      case 'u':
      case 'ins':
        if (context.sendType == undefined || context.sendType === 'image' || context.sendType === 'text')
        {
          context.sendType = 'html';
        }
        context.html += '<u>';
        await context.render(children);
        context.html += '</u>';
        break;
      case 's':
      case 'del':
        if (context.sendType == undefined || context.sendType === 'image' || context.sendType === 'text')
        {
          context.sendType = 'markdown';
        }
        context.markdown += context.sendType != "html" ? '~~' : '';
        context.html += '<del>';
        await context.render(children);
        context.markdown += context.sendType != "html" ? '~~' : '';
        context.html += '</del>';
        break;
      case 'spl':
        if (context.sendType == undefined || context.sendType === 'image' || context.sendType === 'text')
        {
          context.sendType = 'html';
        }
        context.html += '<details><summary>点击展开查看</summary>';
        await context.render(children);
        context.html += '</details>';
        break;
      case 'code':
        if (context.sendType == undefined || context.sendType === 'image' || context.sendType === 'text')
        {
          context.sendType = 'markdown';
        }
        context.markdown += context.sendType != "html" ? '`' : '';
        context.html += '<code>';
        await context.render(children);
        context.markdown += context.sendType != "html" ? '`' : '';
        context.html += '</code>';
        break;
      case 'sup':
        if (context.sendType == undefined || context.sendType === 'image' || context.sendType === 'text')
        {
          context.sendType = 'html';
        }
        context.html += '<sup>';
        await context.render(children);
        context.html += '</sup>';
        break;
      case 'sub':
        if (context.sendType == undefined || context.sendType === 'image' || context.sendType === 'text')
        {
          context.sendType = 'html';
        }
        context.html += '<sub>';
        await context.render(children);
        context.html += '</sub>';
        break;
      default:
        context.bot.loggerError(`未知消息元素类型: ${type}`, element);
        await context.render(children);
        break;
    }
  } catch (error)
  {
    context.bot.loggerError(error);
  }
}