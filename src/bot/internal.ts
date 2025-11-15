import { HTTP, Dict, Universal } from 'koishi';

import { Readable } from 'node:stream';

import { FormatType, clearMsg, getImageAsBase64 } from '../utils/utils';
import * as Types from '../utils/types';
import { YunhuBot } from './bot';

import { ImageUploader } from '../internal/ImageUploader';
import { VideoUploader } from '../internal/VideoUploader';
import { FileUploader } from '../internal/FileUploader';
import { AudioUploader } from '../internal/AudioUploader';

export class Internal
{
  private imageUploader: ImageUploader;
  private videoUploader: VideoUploader;
  private fileUploader: FileUploader;
  private audioUploader: AudioUploader;
  private bot: YunhuBot;

  constructor(
    private http: HTTP,
    private httpWeb: HTTP,
    private token: string,
    private apiendpoint: string,
    bot: YunhuBot
  )
  {
    this.bot = bot;
    this.imageUploader = new ImageUploader(http, token, apiendpoint, bot);
    this.videoUploader = new VideoUploader(http, token, apiendpoint, bot);
    this.fileUploader = new FileUploader(http, token, apiendpoint, bot);
    this.audioUploader = new AudioUploader(http, token, apiendpoint, bot);
  }

  async sendMessage(payload: Dict): Promise<Types.YunhuResponse>
  {
    return this.http.post(`/bot/send?token=${this.token}`, payload);
  }

  // 发送流式消息
  async sendStreamMessage(payload: Dict): Promise<Types.YunhuResponse>
  {
    const { recvId, recvType, contentType, content } = payload;
    const textContent = content.text;

    const url = new URL(`${this.apiendpoint}/bot/send-stream`);
    url.searchParams.set('token', this.token);
    url.searchParams.set('recvId', recvId);
    url.searchParams.set('recvType', recvType);
    url.searchParams.set('contentType', contentType);

    const body = new Readable({ read() { } });

    // 使用异步 IIFE 来处理逐字推送和延迟
    (async () =>
    {
      const totalDuration = (this.bot.config.streamDuration || 3) * 1000;
      const textLength = textContent.length;
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      if (textLength === 0)
      {
        body.push(null);
        return;
      }

      const delay = totalDuration / textLength;
      for (const char of textContent)
      {
        body.push(char, 'utf-8');
        await sleep(delay);
      }
      // null 表示流结束
      body.push(null);
    })();

    try
    {
      const response = await fetch(url.toString(), {  //  此处不适用 ctx.http
        method: 'POST',
        headers: {
          'Content-Type': contentType === 'markdown' ? 'text/markdown' : 'text/plain',
        },
        body: body as any,
        // @ts-ignore
        duplex: 'half',
      });

      if (!response.ok)
      {
        const errorText = await response.text();
        this.bot.loggerError(`流式消息发送失败，状态码: ${response.status}: ${errorText}`);
        return { code: -response.status, msg: `HTTP Error: ${errorText}`, data: null };
      }

      return await response.json() as Types.YunhuResponse;

    } catch (error)
    {
      this.bot.loggerError('流式消息发送时发生异常:', error);
      return { code: -1, msg: error.message, data: null };
    }
  }

  async editMessage(payload: Dict): Promise<Types.YunhuResponse>
  {
    if (!payload || !payload.content || Object.keys(payload.content).length === 0)
    {
      this.bot.loggerError('editMessage 接口调用失败，content 内容不能为空', payload);
      throw new Error('editMessage: content 内容不能为空');
    }

    return this.http.post(`/bot/edit?token=${this.token}`, payload);
  }

  // 获取图片的URL和key，供其他插件使用
  async uploadImageUrl(image: string | Buffer | any): Promise<{ url: string; key: string; }>
  {
    return this.imageUploader.uploadGetUrl(image);
  }

  // 获取视频的URL和key，供其他插件使用
  async uploadVideoUrl(video: string | Buffer | any): Promise<{ url: string; key: string; }>
  {
    return this.videoUploader.uploadGetUrl(video);
  }

  // 获取音频的URL和key，供其他插件使用
  async uploadAudioUrl(audio: string | Buffer | any): Promise<{ url: string; key: string; }>
  {
    return this.audioUploader.uploadGetUrl(audio);
  }

  // 上传图片，仅返回URL，供其他插件使用
  async uploadImage(image: string | Buffer | any): Promise<string>
  {
    return this.imageUploader.upload(image);
  }

  // 上传视频，仅返回URL，供其他插件使用
  async uploadVideo(video: string | Buffer | any): Promise<string>
  {
    return this.videoUploader.upload(video);
  }

  // 上传音频，仅返回URL，供其他插件使用
  async uploadAudio(audio: string | Buffer | any): Promise<string>
  {
    return this.audioUploader.upload(audio);
  }

  // 上传文件，返回key，保持不变
  async uploadFile(fileData: string | Buffer | any): Promise<string>
  {
    return this.fileUploader.upload(fileData);
  }

  async deleteMessage(chatId: string, msgId: string | string[])
  {
    const [type, id] = chatId.split(':');
    const chatType = type === 'private' ? 'user' : type;

    if (Array.isArray(msgId))
    {
      const promises = msgId.map(messageId =>
      {
        const payload = { msgId: messageId, chatId: id, chatType };
        this.bot.logInfo(`批量撤回消息: ${JSON.stringify(payload)}`);
        return this.http.post(`/bot/recall?token=${this.token}`, payload);
      });
      return Promise.all(promises);
    } else
    {
      const payload = { msgId, chatId: id, chatType };
      this.bot.logInfo(`撤回消息: ${JSON.stringify(payload)}`);
      return this.http.post(`/bot/recall?token=${this.token}`, payload);
    }
  }

  async _getGuild(guildId: string): Promise<Types.GroupInfo>
  {
    const payload = { "groupId": guildId };
    return this.httpWeb.post(`/group/group-info`, payload);
  }

  async getGuild(guildId: string): Promise<Universal.Guild>
  {
    try
    {
      const _payload = await this._getGuild(guildId);
      return {
        id: _payload.data.group.groupId,
        name: _payload.data.group.name,
        avatar: await getImageAsBase64(_payload.data.group.avatarUrl, this.bot.ctx.http)
      };
    } catch (error)
    {
      this.bot.loggerError('获取群组信息失败:', error);
      throw error;
    }
  }

  async _getUser(userId: string): Promise<Types.UserInfoResponse>
  {
    return this.httpWeb.get(`/user/homepage?userId=${userId}`);
  }

  async getUser(userId: string): Promise<Universal.User>
  {
    try
    {
      const userPayload = await this._getUser(userId);

      if (userPayload.data?.user?.userId)
      {
        return {
          id: userPayload.data.user.userId,
          name: userPayload.data.user.nickname,
          avatar: await getImageAsBase64(userPayload.data.user.avatarUrl, this.bot.ctx.http),
          isBot: false, // 这是一个普通用户
        };
      }

      try
      {
        const botPayload = await this.getBotInfo(userId);
        if (botPayload.data?.bot?.botId)
        {
          return {
            id: botPayload.data.bot.botId,
            name: botPayload.data.bot.nickname,
            avatar: await getImageAsBase64(botPayload.data.bot.avatarUrl, this.bot.ctx.http),
            isBot: true, // 这是一个机器人
          };
        }
      } catch (botError)
      {
        this.bot.loggerError(`作为机器人获取信息失败 (ID: ${userId})，这可能是个无效ID`, botError);
      }

      throw new Error(`无法获取ID为 ${userId} 的用户或机器人信息`);

    } catch (error)
    {
      this.bot.loggerError(`获取用户信息失败 (ID: ${userId}):`, error);
      throw error;
    }
  }

  async getGuildMember(guildId: string, userId: string): Promise<Universal.GuildMember>
  {
    try
    {
      const user = await this.getUser(userId);
      return {
        ...user,
      };
    } catch (error)
    {
      this.bot.loggerError('获取群成员信息失败:', error);
      throw error;
    }
  }

  async getBotInfo(botId: string): Promise<Types.BotInfoResponse>
  {
    return this.httpWeb.post(`/bot/bot-info`, { botId });
  }

  async getMessageList(channelId: string, messageId: string, options: { before?: number; after?: number; } = {}): Promise<Types.ApiResponse>
  {
    const [type, id] = channelId.split(':');
    const chatType = type === 'private' ? 'user' : type;
    const { before, after } = options;
    this.bot.logInfo(`获取消息列表，channelId: ${channelId}`);
    const url = `/bot/messages?token=${this.token}&chat-id=${id}&chat-type=${chatType}&message-id=${messageId}&before=${before || 1}&after=${after || 1}`;
    return this.http.get(url);
  }

  async _getMessage(channelId: string, messageId: string): Promise<Types.ApiResponse>
  {
    const response = await this.getMessageList(channelId, messageId);
    this.bot.logInfo(`_getMessage response `, JSON.stringify(response));
    if (response.code === 1 && response.data?.list)
    {
      response.data.list = response.data.list.filter(item => item.msgId === messageId);
    }
    return response;
  }

  async getMessage(channelId: string, messageId: string): Promise<Universal.Message>
  {
    const res = await this._getMessage(channelId, messageId);
    if (res.code === 1 && res.data.list.length > 0)
    {
      const msg = res.data.list[0];
      const sender: Types.Sender = {
        senderId: msg.senderId,
        senderNickname: msg.senderNickname,
        //  下面两个属性无实际作用，仅用于内部处理。
        senderType: msg.senderType as 'user',
        senderUserLevel: 'unknown',
      };
      const content = await clearMsg(this.bot, msg, sender);
      return {
        id: msg.msgId,
        content: content,
        user: {
          id: msg.senderId,
          name: msg.senderNickname,
        },
        timestamp: msg.sendTime,
      };
    }
  }

  async setBoard(
    chatId: string,
    contentType: FormatType,
    content: string,
    options: { memberId?: string; expireTime?: number; } = {}
  )
  {
    const chatType = chatId.split(':')[1];
    const Id = chatId.split(':')[0];
    const payload = {
      Id,
      chatType,
      contentType,
      content,
      ...options
    };

    return this.http.post(`/bot/board?token=${this.token}`, payload);
  }

  async setAllBoard(
    chatId: string,
    contentType: FormatType,
    content: string,
    options: { expireTime?: number; } = {}
  )
  {
    const chatType = chatId.split(':')[1];
    const Id = chatId.split(':')[0];
    const payload = {
      Id,
      chatType,
      contentType,
      content,
      ...options
    };
    return this.http.post(`/bot/board-all?token=${this.token}`, payload);
  }

  async getChannel(channelId: string, guildId?: string): Promise<Universal.Channel>
  {
    try
    {
      const [id, type] = channelId.split(':');
      if (type === 'group')
      {
        const guild = await this.getGuild(guildId || id);
        return {
          id: channelId,
          name: guild.name,
          type: 0 // 文本频道
        };
      }
    } catch (error)
    {
      this.bot.loggerError('获取频道信息失败:', error);
      throw error;
    }
  }

  async dismissBoard(chatId: string, chatType: 'user' | 'group', memberId?: string): Promise<Types.YunhuResponse>
  {
    const payload: any = {
      chatId,
      chatType,
    };
    if (memberId && chatType === 'group')
    {
      payload.memberId = memberId;
    }
    return this.http.post('/bot/board-dismiss', payload, {
      params: { token: this.token },
    });
  }

  async dismissAllBoard(): Promise<Types.YunhuResponse>
  {
    return this.http.post('/bot/board-all-dismiss', {}, {
      params: { token: this.token },
    });
  }
}
