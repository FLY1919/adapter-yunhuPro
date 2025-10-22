import { HTTP, Dict } from 'koishi';

import { FormatType } from '../utils/utils';
import * as Types from '../utils/types';
import { YunhuBot } from './bot';

import { ImageUploader } from '../internal/ImageUploader';
import { VideoUploader } from '../internal/VideoUploader';
import { FileUploader } from '../internal/FileUploader';

export default class Internal
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

  async getGuild(guildId: string): Promise<Types.GroupInfo>
  {
    const payload = { "groupId": guildId };
    return this.httpWeb.post(`/group/group-info`, payload);
  }

  async getUser(userId: string): Promise<Types.UserInfoResponse>
  {
    return this.httpWeb.get(`/user/homepage?userId=${userId}`);
  }

  async getBotInfo(botId: string): Promise<Types.BotInfoResponse>
  {
    return this.httpWeb.post(`/bot/bot-info`, { botId });
  }

  async getMessageList(chatId: string, messageId: string, options: { before?: number; after?: number; } = {}): Promise<Types.ApiResponse>
  {
    const chatType = chatId.split(':')[1];
    const Id = chatId.split(':')[0];
    const { before, after } = options;
    this.bot.logInfo(`获取消息列表，chatId: ${chatId}`);
    const url = `/bot/messages?token=${this.token}&chat-id=${Id}&chat-type=${chatType}&message-id=${messageId}&before=${before || 0}&after=${after || 0}`;
    return this.http.get(url);
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

}
