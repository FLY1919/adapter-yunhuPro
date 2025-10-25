import { h, Universal, HTTP } from 'koishi';
import { yunhuEmojiMap } from './emoji';
import { YunhuBot } from '../bot/bot';
import * as Yunhu from './types';
import { logger } from '..';

export * from './types';

export const decodeUser = (user: Yunhu.Sender): Universal.User => ({
  id: user.senderId,
  name: user.senderNickname,
  isBot: false,
});

// 转义正则表达式特殊字符的函数
function escapeRegExp(string: string): string
{
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeYunhuEmoji(text: string): string
{
  if (!text) return '';
  return text.replace(/\[\..+?\]/g, (match) =>
  {
    return yunhuEmojiMap.get(match) || match;
  });
}

async function clearMsg(bot: YunhuBot, message: Yunhu.Message, sender: Yunhu.Sender): Promise<string>
{
  let textContent = message.content.text || '';
  const atUserIds = message.content.at;

  // 存在 at 信息，则进行处理
  if (atUserIds && Array.isArray(atUserIds) && atUserIds.length > 0)
  {
    // @全体成员
    if (atUserIds.includes('all'))
    {
      // 匹配 "@全体成员" 及其后的可选空格或零宽空格
      textContent = textContent.replace(/@全体成员[\s\u200b]?/g, h('at', { type: 'all' }).toString());
    }

    const validUserIds = atUserIds.filter(id => id !== 'all');
    if (validUserIds.length > 0)
    {
      // @用户名
      // 正则表达式匹配 @后跟非@、非空白、非零宽字符的用户名，直到遇到一个空格或零宽字符
      const mentionRegex = /@([^@\s\u200b\u2068\u2069\u2066\u2067]+)[\s\u200b\u2068\u2069\u2066\u2067]/g;
      let match;
      const mentionedNames: string[] = [];
      while ((match = mentionRegex.exec(textContent)) !== null)
      {
        mentionedNames.push(match[1]);
      }

      // 按首次出现顺序获取唯一的用户名
      const uniqueMentionedNames = [...new Set(mentionedNames)];

      // 创建从用户名到用户ID的映射
      const nameToIdMap = new Map<string, string>();
      uniqueMentionedNames.forEach((name, index) =>
      {
        if (index < validUserIds.length)
        {
          nameToIdMap.set(name, validUserIds[index]);
        }
      });

      nameToIdMap.forEach((id, name) =>
      {
        const escapedName = escapeRegExp(name);
        const replaceRegex = new RegExp(`@${escapedName}[\\s\\u200b\\u2068\\u2069\\u2066\\u2067]`, 'g');
        textContent = textContent.replace(replaceRegex, h.at(id, { name }).toString());
      });
    }
  }

  // 移除文本中残留的零宽字符并解码表情
  textContent = textContent.replace(/[\u200b\u2068\u2069\u2066\u2067]/g, '');
  textContent = decodeYunhuEmoji(textContent);

  // 处理其他媒体内容
  if (message.content.imageUrl)
  {
    textContent += h.image(message.content.imageUrl).toString();
  } else if (message.content.imageName)
  {
    textContent += h.image(bot.config.resourceEndpoint + message.content.imageName).toString();
  }

  if (message.content.fileKey)
  {
    textContent += h('file', { src: message.content.fileKey }).toString();
  }

  if (message.content.videoKey)
  {
    textContent += h('video', { src: message.content.videoKey }).toString();
  }

  return textContent;
}


export async function adaptSession(bot: YunhuBot, input: Yunhu.YunhuEvent)
{
  switch (input.header.eventType)
  {
    case 'message.receive.normal':
    case 'message.receive.instruction': {
      const { sender, message, chat } = input.event as Yunhu.MessageEvent;
      let content: string;

      // 指令
      if (message.commandName)
      {
        const commandName = message.commandName;
        if (message.contentType === 'form' && message.content.formJson)
        {
          // 自定义输入指令：将表单数据序列化为 JSON 字符串作为参数。
          const formJsonString = JSON.stringify(message.content.formJson);
          content = `/${commandName} '${formJsonString}'`;
        } else
        {
          const baseContent = await clearMsg(bot, message, sender);
          // 直接发送的指令：文本以 /指令名 开头
          if (baseContent.startsWith(`/${commandName}`))
          {
            content = baseContent;
          } else
          {
            // 普通指令：文本是参数，在前面加上指令
            content = `/${commandName} ${baseContent}`.trim();
          }
        }
      } else
      {
        // 普通消息
        content = await clearMsg(bot, message, sender);
      }

      const sessionPayload = {
        type: 'message',
        platform: 'yunhu',
        selfId: bot.selfId,
        timestamp: message.sendTime,
        user: {
          id: sender.senderId,
          type: sender.senderType,
          name: sender.senderNickname,
          role: sender.senderUserLevel
        },
        message: {
          id: message.msgId,
          content: content,
          elements: h.parse(content),
        },
      };

      const session = bot.session(sessionPayload);
      session.content = content;

      if (message.chatType === 'bot')
      {
        session.isDirect = true;
        session.channelId = `private:${sender.senderId}`;
      } else
      {
        session.isDirect = false;
        session.guildId = message.chatId;
        session.channelId = `group:${chat.chatId}`;
        session.event.guild = {
          id: chat.chatId
        };
        session.event.member = {
          user: sessionPayload.user,
          name: sessionPayload.user.name,
        };
      }

      if (message.parentId)
      {
        if (message.content.parentImgName)  //  图片引用
        {
          try
          {
            const imageUrl = bot.config.resourceEndpoint + message.content.parentImgName;
            const base64 = await getImageAsBase64(imageUrl, bot.ctx.http);
            const content = h.image(base64).toString();

            let quoteMessage: Universal.Message;
            try
            {
              quoteMessage = await bot.getMessage(session.channelId, message.parentId);
            } catch (e)
            {
              // ignore
            }

            if (quoteMessage)
            {
              session.quote = {
                ...quoteMessage,
                content,
                elements: h.parse(content),
              };
            }
          } catch (error)
          {
            bot.logger.warn(`Failed to process quoted image ${message.parentId}:`, error);
            session.quote = { id: message.parentId }; // Fallback
          }
        } else
        {
          // 普通引用
          try
          {
            const quoteMessage = await bot.getMessage(session.channelId, message.parentId);
            if (quoteMessage)
            {
              session.quote = quoteMessage;
            } else
            {
              session.quote = { id: message.parentId };
            }
          } catch (error)
          {
            bot.logger.warn(`Failed to get quote message ${message.parentId}:`, error);
            session.quote = { id: message.parentId };
          }
        }
      }

      //  分发session
      bot.logInfo('分发session内容：', session);
      bot.dispatch(session);
      return;
    }

    // 其他事件保持不变
    default: {
      const session = bot.session();
      session.setInternal(bot.platform, input);
      switch (input.header.eventType)
      {
        case 'bot.followed': {
          session.type = 'friend-added';
          const { sender } = input.event as Yunhu.MessageEvent;
          session.userId = sender.senderId;
          session.event.user.name = sender.senderNickname;
          break;
        }
        case 'group.member.joined': {
          const { sender, chat, joinedMember } = input.event as Yunhu.GroupMemberJoinedEvent;
          session.type = 'guild-member-added';
          session.userId = joinedMember.memberId;
          session.event.user.name = joinedMember.memberNickname;
          session.guildId = chat.chatId;
          session.operatorId = sender.senderId;
          break;
        }
        case 'group.member.leaved': {
          const { sender, chat, leavedMember, leaveType } = input.event as Yunhu.GroupMemberLeavedEvent;
          session.type = 'guild-member-removed';
          session.userId = leavedMember.memberId;
          session.event.user.name = leavedMember.memberNickname;
          session.guildId = chat.chatId;
          session.operatorId = sender.senderId;
          session.subtype = leaveType === 'self' ? 'leave' : 'kick';
          break;
        }
        case 'group.member.invited': {
          const { sender, chat, invitedMember, inviter } = input.event as Yunhu.GroupMemberInvitedEvent;
          session.type = 'guild-member-added';
          session.userId = invitedMember.memberId;
          session.event.user.name = invitedMember.memberNickname;
          session.guildId = chat.chatId;
          session.operatorId = inviter.inviterId;
          session.subtype = 'invite';
          break;
        }
        case 'group.member.kicked': {
          const { sender, chat, kickedMember, operator } = input.event as Yunhu.GroupMemberKickedEvent;
          session.type = 'guild-member-removed';
          session.userId = kickedMember.memberId;
          session.event.user.name = kickedMember.memberNickname;
          session.guildId = chat.chatId;
          session.operatorId = operator.operatorId;
          break;
        }
        case 'group.disbanded': {
          const { sender, chat, operator } = input.event as Yunhu.GroupDisbandedEvent;
          session.type = 'guild-deleted';
          session.guildId = chat.chatId;
          session.operatorId = operator.operatorId;
          break;
        }
        case 'bot.shortcut.menu': {
          session.type = 'interaction/button';
          const event = input.event as Yunhu.BotShortcutMenuEvent;
          session.userId = event.senderId;
          session.channelId = event.chatType === 'bot' ? `private:${event.senderId}` : `group:${event.chatId}`;
          session.guildId = event.chatType === 'group' ? event.chatId : undefined;
          session.event.button = { id: event.menuId };
          break;
        }
        case 'button.report.inline': {
          session.type = 'interaction/button';
          const event = input.event as Yunhu.ButtonReportInlineEvent;
          session.userId = event.senderId;
          session.messageId = event.msgId;
          session.channelId = event.chatType === 'bot' ? `private:${event.senderId}` : `group:${event.chatId}`;
          session.guildId = event.chatType === 'group' ? event.chatId : undefined;
          session.event.button = { id: event.buttonId };
          break;
        }
        default:
          bot.loggerError(`未处理的事件类型: ${input.header.eventType}`, input);
          return;
      }
      bot.dispatch(session);
      return;
    }
  }
}

/**
 * 获取图片并转换为Base64
 * @param url 图片URL
 * @param http Koishi HTTP 实例
 * @returns Base64 格式的图片
 */
export async function getImageAsBase64(url: string, http: HTTP): Promise<string>
{
  try
  {
    // 设置请求头，包括Referer
    const httpClient = http.extend({
      headers: {
        'Referer': 'www.yhchat.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const { data, type } = await httpClient.file(url);

    if (!type || !type.startsWith('image/'))
    {
      throw new Error('响应不是有效的图片类型');
    }

    // 将Buffer转换为Base64
    const base64 = Buffer.from(data).toString('base64');

    // 返回Data URL格式
    return `data:${type};base64,${base64}`;
  } catch (error)
  {
    logger.error(`无法获取图片: ${url}, 错误: ${error.message}`);
    return url;
  }
}