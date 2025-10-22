import { Bot, Context, h, Session, Universal, Logger, HTTP } from 'koishi';

import { YunhuBot } from '../bot/bot';
import * as Yunhu from './types';
import { logger, name } from '..';
export * from './types';

export const decodeUser = (user: Yunhu.Sender): Universal.User => ({
  id: user.senderId,
  name: user.senderNickname,
  isBot: false,
});

async function clearMsg(bot: YunhuBot, message: Yunhu.Message, sender: Yunhu.Sender): Promise<string>
{
  let textContent = (message.content.text || '').replace(/\u200b/g, '');

  if (message.content.at && message.content.at.length > 0)
  {
    // At all is a special case.
    if (message.content.at.includes('all'))
    {
      textContent = textContent.replace(/@全体成员/g, h('at', { type: 'all' }).toString());
    }
    // For other at mentions, we can use the sender info from the payload.
    const atText = `@${sender.senderNickname}`;
    textContent = textContent.replace(new RegExp(atText, 'g'), h.at(sender.senderId, { name: sender.senderNickname }).toString());
  }

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
  const Internal = bot.internal;

  switch (input.header.eventType)
  {
    case 'message.receive.normal':
    case 'message.receive.instruction': {
      const { sender, message, chat } = input.event as Yunhu.MessageEvent;
      bot.logInfo('收到原始input消息:', JSON.stringify(input));

      const content = await clearMsg(bot, message, sender);

      const sessionPayload = {
        type: 'message',
        platform: 'yunhu',
        selfId: bot.selfId,
        timestamp: message.sendTime,
        user: {
          id: sender.senderId,
          name: sender.senderNickname,
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
        default:
          bot.loggerError(`未处理的事件类型: ${input.header.eventType}`, input);
          return;
      }
      return session;
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