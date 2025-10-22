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

// 将云湖消息转换为Koishi通用消息格式
export const decodeMessage = async (
  bot: YunhuBot,
  message: Yunhu.Message,
): Promise<Partial<Universal.Message>> =>
{
  const elements: h[] = [];
  const textContent = (message.content.text || '').replace(/\u200b/g, '');

  if (textContent)
  {
    elements.push(...h.parse(textContent));
  }

  // 处理图片内容
  if (message.content.imageUrl)
  {
    elements.push(h.image(message.content.imageUrl));
  } else if (message.content.imageName)
  {
    elements.push(h.image(URL + message.content.imageName));
  }

  // 处理文件内容
  if (message.content.fileKey)
  {
    elements.push(h('file', { src: message.content.fileKey }));
  }

  // 处理视频内容
  if (message.content.videoKey)
  {
    elements.push(h('video', { src: message.content.videoKey }));
  }

  const result: Partial<Universal.Message> = {
    id: message.msgId,
    elements,
    content: textContent,
  };

  if (message.parentId)
  {
    result.quote = { id: message.parentId };
    // 可以在这里添加获取被引用消息详情的逻辑
  }

  return result;
};

// 适配会话，将云湖事件转换为Koishi会话
export async function adaptSession(bot: YunhuBot, input: Yunhu.YunhuEvent)
{
  const session = bot.session();
  const Internal = bot.internal;
  session.setInternal(bot.platform, input);
  switch (input.header.eventType)
  {
    // 消息事件处理
    case 'message.receive.normal':
    case 'message.receive.instruction': {
      const { sender, message, chat } = input.event as Yunhu.MessageEvent;
      bot.loggerInfo('收到原始消息:', message);

      session.type = 'message';
      session.userId = sender.senderId;
      session.timestamp = message.sendTime;

      const UserInfo = await Internal.getUser(session.userId);
      const user = {
        id: sender.senderId,
        name: UserInfo.data.user.nickname,
        nick: UserInfo.data.user.nickname,
        avatar: UserInfo.data.user.avatarUrl,
        isBot: false,
      };
      session.event.user = user;

      if (message.chatType === 'bot')
      {
        session.isDirect = true;
        session.channelId = `${sender.senderId}:user`;
      } else
      {
        session.isDirect = false;
        session.guildId = message.chatId;
        session.channelId = `${message.chatId}:${message.chatType}`;

        // 关键修复：确保 member.user 被正确赋值
        session.event.member = {
          user,
          name: user.name,
          nick: user.nick,
          avatar: user.avatar,
        };

        const guildInfo = await Internal.getGuild(chat.chatId);
        session.event.guild = {
          id: chat.chatId,
          name: guildInfo.data.group.name,
          avatar: guildInfo.data.group.avatarUrl,
        };
        session.event.channel = {
          id: session.channelId,
          name: guildInfo.data.group.name,
          type: Universal.Channel.Type.TEXT,
        };
      }
      // session.quote.id = message.parentId? message.parentId : undefined

      // 转换消息内容为Koishi格式
      // 转换消息内容为Koishi格式
      const universalMessage = await decodeMessage(bot, message);
      session.content = universalMessage.content;
      session.elements = universalMessage.elements;
      session.messageId = universalMessage.id;
      if (universalMessage.quote)
      {
        session.quote = universalMessage.quote;
      }
      break;
    }

    // 好友添加事件
    case 'bot.followed': {
      session.type = 'friend-added';
      const { sender } = input.event as Yunhu.MessageEvent;
      session.userId = sender.senderId;
      session.event.user.name = sender.senderNickname;
      break;
    }

    // 加群事件处理
    case 'group.member.joined': {
      const { sender, chat, joinedMember } = input.event as Yunhu.GroupMemberJoinedEvent;
      session.type = 'guild-member-added';
      session.userId = joinedMember.memberId;
      session.event.user.name = joinedMember.memberNickname;
      session.guildId = chat.chatId;
      session.operatorId = sender.senderId;
      break;
    }

    // 退群事件处理
    case 'group.member.leaved': {
      const { sender, chat, leavedMember, leaveType } = input.event as Yunhu.GroupMemberLeavedEvent;
      session.type = 'guild-member-removed';
      session.userId = leavedMember.memberId;
      session.event.user.name = leavedMember.memberNickname;
      session.guildId = chat.chatId;
      session.operatorId = sender.senderId;
      // 区分自己退出还是被踢出
      session.subtype = leaveType === 'self' ? 'leave' : 'kick';
      break;
    }

    // 成员被邀请加入群聊事件
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

    // 成员被踢出群聊事件
    case 'group.member.kicked': {
      const { sender, chat, kickedMember, operator } = input.event as Yunhu.GroupMemberKickedEvent;
      session.type = 'guild-member-removed';
      session.userId = kickedMember.memberId;
      session.event.user.name = kickedMember.memberNickname;
      session.guildId = chat.chatId;
      session.operatorId = operator.operatorId;
      break;
    }

    // 群聊被解散事件
    case 'group.disbanded': {
      const { sender, chat, operator } = input.event as Yunhu.GroupDisbandedEvent;
      session.type = 'guild-deleted';
      session.guildId = chat.chatId;
      session.operatorId = operator.operatorId;
      break;
    }

    // 未知事件类型
    default:
      bot.loggerError(`未处理的事件类型: ${input.header.eventType}`, input);
      return; // 忽略未知事件
  }
  bot.loggerInfo('视检session ', session);

  return session;
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