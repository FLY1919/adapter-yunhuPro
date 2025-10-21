import { HTTP, Dict } from 'koishi';
import axios from 'axios';
import * as Types from '../utils/types';
import { FormatType } from '../utils/utils';
import { ImageUploader } from '../internal/ImageUploader';
import { VideoUploader } from '../internal/VideoUploader';
import { FileUploader } from '../internal/FileUploader';
import { YunhuBot } from './bot';

// 主类
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

  sendMessage(payload: Dict)
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

  async deleteMessage(chatId: string, msgId: string)
  {
    const chatType = chatId.split(':')[1];
    const id = chatId.split(':')[0];
    const payload = { msgId, id, chatType };
    this.bot.logInfo(`撤回消息: ${JSON.stringify(payload)}`);
    return this.http.post(`/bot/recall?token=${this.token}`, payload);
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

  async getMessageList(chatId: string, messageId: string, options: { before?: number; after?: number; } = {}): Promise<Types.ApiResponse>
  {
    const chatType = chatId.split(':')[1];
    const Id = chatId.split(':')[0];
    const { before, after } = options;
    this.bot.logInfo(`获取消息列表，chatId: ${chatId}`);
    const url = `/bot/messages?token=${this.token}&chat-id=${Id}&chat-type=${chatType}&message-id=${messageId}&before=${before || 0}&after=${after || 0}`;
    return this.http.get(url);
  }

  // 获取图片并转换为Base64
  async getImageAsBase64(url: string): Promise<string>
  {
    try
    {
      // 设置请求头，包括Referer
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'Referer': 'www.yhchat.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      // 获取图片MIME类型
      const contentType = response.headers['content-type'];
      if (!contentType || !contentType.startsWith('image/'))
      {
        throw new Error('响应不是有效的图片类型');
      }

      // 将ArrayBuffer转换为Base64
      const base64 = Buffer.from(response.data, 'binary').toString('base64');

      // 返回Data URL格式
      return `data:${contentType};base64,${base64}`;
    } catch (error)
    {
      this.bot.loggerError('获取图片失败:', error);
      throw new Error(`无法获取图片: ${error.message}`);
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

}
