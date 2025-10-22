import { Bot, Context, h, Session, Universal, Logger, HTTP } from 'koishi';
import * as Yunhu from './types';
import { YunhuBot } from '../bot/bot';
import path from 'path';
import { ResourceResult } from './types';

import Internal from '../bot/internal';

export * from './types';

const URL = "https://chat-img.jwznb.com/";

// 将云湖用户信息转换为Koishi通用用户格式
export const decodeUser = (user: Yunhu.Sender): Universal.User => ({
  id: user.senderId,
  name: user.senderNickname,
  isBot: false,
});

async function clearMsg(bot: YunhuBot, message: Yunhu.Message): Promise<string>
{
  let textContent = (message.content.text || '').replace(/\u200b/g, '');

  if (message.content.at && message.content.at.length > 0)
  {
    const userMap = new Map<string, string>();
    await Promise.all(
      message.content.at.map(async (id) =>
      {
        try
        {
          const user = await bot.internal.getUser(id);
          userMap.set(id, user.data.user.nickname);
        } catch (error)
        {
          bot.loggerError(`获取用户信息失败: ${id}`, error);
        }
      })
    );

    for (const [id, name] of userMap.entries())
    {
      const atText = `@${name}`;
      textContent = textContent.replace(new RegExp(atText, 'g'), h.at(id, { name }).toString());
    }
  }

  if (message.content.imageUrl)
  {
    textContent += h.image(message.content.imageUrl).toString();
  } else if (message.content.imageName)
  {
    textContent += h.image(URL + message.content.imageName).toString();
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

// 适配会话，将云湖事件转换为Koishi会话
export async function adaptSession(bot: YunhuBot, input: Yunhu.YunhuEvent)
{
  const Internal = bot.internal;

  switch (input.header.eventType)
  {
    case 'message.receive.normal':
    case 'message.receive.instruction': {
      const { sender, message, chat } = input.event as Yunhu.MessageEvent;
      // bot.logInfo('收到原始消息:', message);

      const content = await clearMsg(bot, message);
      const UserInfo = await Internal.getUser(sender.senderId);

      const sessionPayload = {
        type: 'message',
        platform: 'yunhu',
        selfId: bot.selfId,
        timestamp: message.sendTime,
        user: {
          id: sender.senderId,
          name: UserInfo.data.user.nickname,
          nick: UserInfo.data.user.nickname,
          avatar: UserInfo.data.user.avatarUrl,
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
        session.channelId = `group:${message.chatId}`; // 统一格式
        const guildInfo = await bot.internal.getGuild(chat.chatId);
        session.event.guild = {
          id: chat.chatId,
          name: guildInfo.data.group.name,
        };
        session.event.member = {
          user: sessionPayload.user,
          name: sessionPayload.user.name,
          nick: sessionPayload.user.nick,
        };
      }

      if (message.parentId)
      {
        session.quote = { id: message.parentId };
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
    throw new Error(`无法获取图片: ${error.message}`);
  }
}