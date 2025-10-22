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
  message: Yunhu.Message,
  Internal: Internal,
  session: Session,
  config
): Promise<Universal.Message> =>
{
  const elements: any[] = [];
  let textContent = message.content.text || '';

  // 移除文本中的零宽空格
  textContent = textContent.replace(/\u200b/g, '');

  // 判断是否为纯指令消息（文本内容就是斜杠加指令名）
  const isPureCommand = textContent === '/' + message.commandName;

  // 设置 session.content
  if (isPureCommand)
  {
    // 纯指令情况：session.content 只包含指令名
    session.content = message.commandName;
  } else if (message.commandName)
  {
    // 指令加参数情况：session.content 包含指令名和参数
    session.content = message.commandName + ' ' + textContent;
  } else
  {
    // 普通消息情况
    session.content = textContent;
  }

  // 处理引用回复

  if (message.parentId)
  {
    try
    {
      const res = await Internal.getMessageList(session.channelId, message.parentId, { before: 1 });
      if (res.data.list && res.data.list.length > 0)
      {
        const parentMessage = res.data.list[0];

        // 创建一个临时的 session 对象用于处理父消息
        // 创建一个临时的 session 对象用于处理父消息
        const tempSession = session.bot.session(session.event);
        tempSession.channelId = session.channelId;

        // 使用 decodeMessage 处理父消息，生成符合 Koishi 规范的 elements
        const parentUniversalMessage = await decodeMessage(parentMessage, Internal, tempSession, config);

        // 设置引用信息，直接使用处理后的 elements
        session.event.message['quote'] = {
          "id": message.parentId,
          "elements": parentUniversalMessage.elements,
          "content": parentUniversalMessage.content,
          "user": {
            "id": parentMessage.senderId,
            "name": parentMessage.senderNickname || '未知用户'
          },
          "channel": {
            "id": session.channelId,
            "name": '', // 云湖API未提供频道名称
            "type": Universal.Channel.Type.TEXT
          }
        };

        (session.bot as YunhuBot).logInfo('引用消息处理成功，elements:', session.quote);
      }
    } catch (error)
    {
      (session.bot as YunhuBot).loggerError('获取引用消息失败:', error);
      // 即使获取失败也设置基本的引用信息
      session.event.message.quote = {
        "id": message.parentId,
        "content": '[引用消息]',
        "elements": [h.text('[引用消息]')]
      };
    }
  }

  // 处理@用户
  if (message.content.at && message.content.at.length > 0)
  {
    // 获取所有@用户的昵称映射
    const userMap = new Map();
    await Promise.all(
      message.content.at.map(async (id) =>
      {
        try
        {
          const user = await Internal.getUser(id);
          userMap.set(id, user.data.user.nickname);
        } catch (error)
        {
          (session.bot as YunhuBot).loggerError(`获取用户信息失败: ${id}`, error);
        }
      })
    );

    // 按文本顺序处理@
    const atPositions: Array<{ index: number; id: string; name: string; }> = [];

    // 查找所有@位置
    for (const id of message.content.at)
    {
      const name = userMap.get(id);
      if (name)
      {
        const atText = `@${name}`;
        let startIndex = 0;

        while (startIndex < textContent.length)
        {
          const index = textContent.indexOf(atText, startIndex);
          if (index === -1) break;

          atPositions.push({ index, id, name });
          startIndex = index + atText.length;
        }
      }
    }

    // 按位置排序
    atPositions.sort((a, b) => a.index - b.index);

    // 分割文本并插入@元素
    let lastIndex = 0;
    for (const { index, id, name } of atPositions)
    {
      // 添加@前的文本
      if (index > lastIndex)
      {
        const prefix = !isPureCommand && message.commandName ? message.commandName + ' ' : '';
        const textBeforeAt = prefix + textContent.substring(lastIndex, index);
        // 移除零宽空格后再添加文本元素
        if (textBeforeAt.trim())
        {
          elements.push(h.text(textBeforeAt.replace(/\u200b/g, '')));
        }
      }

      // 添加@元素
      elements.push(h.at(id, { name }));

      // 更新最后索引位置（跳过@文本）
      lastIndex = index + name.length + 1; // +1 是为了跳过@符号
    }

    // 添加剩余文本
    if (lastIndex < textContent.length)
    {
      const prefix = !isPureCommand && message.commandName ? message.commandName + ' ' : '';
      const remainingText = prefix + textContent.substring(lastIndex);
      // 移除零宽空格后再添加文本元素
      if (remainingText.trim())
      {
        elements.push(h.text(remainingText.replace(/\u200b/g, '')));
      }
    }
  } else if (textContent)
  {
    // 如果没有@，根据是否为纯指令决定如何添加文本
    if (isPureCommand)
    {
      // 纯指令情况：显示斜杠加指令名
      elements.push(h.text('/' + message.commandName));
    } else if (message.commandName)
    {
      // 指令加参数情况：显示指令名加参数
      elements.push(h.text((message.commandName + ' ' + textContent).replace(/\u200b/g, '')));
    } else
    {
      // 普通消息情况
      elements.push(h.text(textContent.replace(/\u200b/g, '')));
    }
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
    elements.push(h.text('[文件]'));
  }

  // 处理视频内容
  if (message.content.videoKey)
  {
    elements.push(h.text('[视频]'));
  }

  return {
    id: message.msgId,
    content: textContent, // 保留原始文本内容
    elements,
  };
};

// 将消息内容转换为Koishi消息元素
function transformElements(elements: any[])
{
  return elements.map(element =>
  {
    if (typeof element === 'string')
    {
      return h.text(element);
    } else if (Buffer.isBuffer(element))
    {
      return h.image(element, 'image/png', {
        filename: 'image.png',
        cache: false
      });
    } else if (typeof element === 'object' && element.type === 'image')
    {
      if (element.url)
      {
        return h('image', {
          src: element.url,
          filename: element.filename || 'image.png',
          cache: false,
          weight: element.weight || 0,
          height: element.height || 0
        });
      } else if (element.data)
      {
        return h.image(element.data, 'image/png');
      }
    }
    return h.text(String(element));
  });
}

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
      bot.logInfo('收到原始消息:', message);

      session.type = 'message';
      session.userId = sender.senderId;
      session.event.user.name = sender.senderNickname;
      session.event.user.nick = sender.senderNickname;
      session.event.user.id = sender.senderId;
      const level = () =>
      {
        if (sender.senderUserLevel === 'owner')
        {
          return 0x1FFFFFFFFF;
        } else if (sender.senderUserLevel === 'administrator')
        {
          return 0x8;
        } else if (sender.senderUserLevel === 'member')
        {
          return 2048;
        } else
        {
          return 0;
        }
      };
      const UserInfo = await Internal.getUser(session.userId);
      session.event.role = {
        "id": chat.chatId,
        "name": UserInfo.data.user.nickname,
        "permissions": BigInt(level()),
        "color": null,
        "position": null,
        "hoist": false,
        "mentionable": false
      };
      session.author.user = {
        "id": session.userId,
        "name": UserInfo.data.user.nickname,
        "nick": UserInfo.data.user.nickname,
        "avatar": UserInfo.data.user.avatarUrl,
        "isBot": false // 云湖目前没有提供isBot字段，暂时设为false
      };
      session.event.member = {
        "user": session.author.user,
        "name": UserInfo.data.user.nickname,
        "nick": UserInfo.data.user.nickname,
        "avatar": UserInfo.data.user.avatarUrl
      };

      session.author.name = UserInfo.data.user.nickname;
      session.author.nick = UserInfo.data.user.nickname;
      session.author.isBot = false; // 云湖目前没有提供isBot字段，暂时设为false
      // 设置频道ID，区分私聊和群聊
      if (message.chatType === 'bot')
      {
        session.channelId = `${sender.senderId}:user`;
        session.isDirect = true;
      } else
      {
        session.channelId = `${message.chatId}:${message.chatType}`;
        session.guildId = message.chatId;
        session.isDirect = false;
        const guildInfo = await Internal.getGuild(chat.chatId);
        session.event.guild = {
          "id": chat.chatId,
          "name": guildInfo.data.group.name,
          "avatar": guildInfo.data.group.avatarUrl,
        };
        session.event.channel = {
          "id": session.channelId,
          "name": guildInfo.data.group.name,
          "type": Universal.Channel.Type.TEXT,
        };
      }

      // 设置消息内容和元数据

      session.messageId = message.msgId;
      session.timestamp = message.sendTime;
      // session.quote.id = message.parentId? message.parentId : undefined

      // 转换消息内容为Koishi格式
      const demessage = await decodeMessage(message, Internal, session, bot.config);
      session.event.message.id = demessage.id;
      session.event.message.content = demessage.content;
      session.event.message.elements = demessage.elements;
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
  bot.logInfo('视检session ', session);

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