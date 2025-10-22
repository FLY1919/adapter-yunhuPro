import { HTTP, Dict, Universal } from 'koishi';

import { FormatType } from '../utils/utils';
import * as Types from '../utils/types';
import { YunhuBot } from './bot';

import { ImageUploader } from '../internal/ImageUploader';
import { VideoUploader } from '../internal/VideoUploader';
import { FileUploader } from '../internal/FileUploader';

export class Internal
{
  private imageUploader: ImageUploader;
  private videoUploader: VideoUploader;
  private fileUploader: FileUploader;
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
  }

  async sendMessage(payload: Dict): Promise<Types.YunhuResponse>
  {
    return this.http.post(`/bot/send?token=${this.token}`, payload);
  }

  async uploadImageUrl(image: string | Buffer | any): Promise<Dict>
  {
    return this.imageUploader.uploadGetUrl(image);
  }
  async uploadImage(image: string | Buffer | any): Promise<string | undefined>
  {
    return this.imageUploader.upload(image);
  }

  async uploadVideo(video: string | Buffer | any): Promise<string>
  {
    return this.videoUploader.upload(video);
  }

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
        avatar: _payload.data.group.avatarUrl
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
      const _payload = await this._getUser(userId);
      return {
        id: _payload.data.user.userId,
        name: _payload.data.user.nickname,
        avatar: _payload.data.user.avatarUrl,
        isBot: false
      };
    } catch (error)
    {
      this.bot.loggerError('获取用户信息失败:', error);
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
      return {
        id: msg.msgId,
        content: msg.content.text,
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
