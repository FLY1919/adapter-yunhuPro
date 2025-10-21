import { Dict, HTTP } from "koishi";

// types.ts
export interface YunhuConfig
{
  token: string;
  endpoint?: string; // 可选，如果不是默认 endpoint 的话
  path?: string;     // 可选，云湖平台推送回调的路径
}

interface CheckChatInfoRecord
{
  id: number;
  chatId: string;
  chatType: number;
  checkWay: string;
  reason: string;
  status: number;
  createTime: number;
  updateTime: number;
  delFlag: number;
}

interface Medal
{
  id: number;
  name: string;
  desc: string;
  imageUrl: string;
  sort: number;
}

interface User
{
  userId: string;
  nickname: string;
  avatarUrl: string;
  registerTime: number;
  registerTimeText: string;
  onLineDay: number;
  continuousOnLineDay: number;
  medals: Medal[];
  isVip: number;
}

export interface UserInfoResponse
{
  code: number;
  data: {
    user: User;
  };
  msg: string;
}

interface Bot
{
  id: number;
  botId: string;
  nickname: string;
  nicknameId: number;
  avatarId: number;
  avatarUrl: string;
  token: string;
  link: string;
  introduction: string;
  createBy: string;
  createTime: number;
  headcount: number;
  private: number;
  checkChatInfoRecord: CheckChatInfoRecord;
}

interface GroupBotRel
{
  id: number;
  groupId: string;
  botId: string;
  delFlag: number;
  createTime: number;
  updateTsime: number;
  bot: Bot;
}

interface Group
{
  id: number;
  groupId: string;
  name: string;
  introduction: string;
  createBy: string;
  createTime: number;
  avatarId: number;
  avatarUrl: string;
  headcount: number;
  readHistory: number;
  category: string;
  uri: string;
  groupBotRel: GroupBotRel;
  checkChatInfoRecord: CheckChatInfoRecord;
}

interface Data
{
  group: Group;
}

export interface GroupInfo
{
  code: number;
  data: Data;
  msg: string;
}
export interface YunhuMessage
{
  recvId: string;
  recvType: 'user' | 'group';
  contentType: 'text' | 'image' | 'video' | 'file' | 'markdown' | 'html';
  content: {
    text?: string;      // for text/markdown/html
    imageKey?: string;  // for image
    fileKey?: string;   // for file
    videoKey?: string;   // for video
    // 其他类型的 content 字段
  };
  parentId?: string; // 回复消息ID
}

export interface Message
{
  msgId: string;
  parentId?: string;
  sendTime: number; // 毫秒级时间戳
  chatId: string;
  chatType: 'group' | 'bot';
  contentType: 'text' | 'image' | 'markdown' | 'file';
  content: Content;
  commandId?: number;
  commandName?: string;
}

export interface Content
{
  text?: string;          // contentType 为 text 或 markdown 时使用
  imageUrl?: string;      // contentType 为 image 时使用（替换 imageKey）
  fileKey?: string;       // contentType 为 file 时使用
  videoKey?: string;      // contentType 为 video 时使用
  buttons?: Button[];     // 所有类型都可能有
  at?: string[];          // 所有类型都可能有
  parentId?: string;   // 回复消息的 ID
  parent?: string;   // 回复消息的 
  parentImgName?: string; // 回复消息的图片名称
  parentVideoUrl?: string; // 回复消息的视频链接
  parentFileName?: string; // 回复消息的文件名称
  // 以下为图像类型特有的可选属性
  imageName?: string;     // 对应 JSON 中的 imageName
  etag?: string;          // 对应 JSON 中的 etag
  imageWidth?: number;    // 对应 JSON 中的 imageWidth
  imageHeight?: number;   // 对应 JSON 中的 imageHeight
}

export interface Button
{
  text: string;
  actionType: 1 | 2 | 3;
  url?: string;
  value?: string;
}

export interface YunhuEvent
{
  version: string;
  header: {
    eventId: string;
    eventTime: number;
    eventType: string;
  };
  event: Event; // 根据事件类型定义更详细的结构
}

export interface Sender
{
  senderId: string;
  senderType: 'user';
  senderUserLevel: 'owner' | 'administrator' | 'member' | 'unknown';
  senderNickname: string;
}

// 基础消息事件
export interface MessageEvent
{
  sender: Sender;
  message: Message;
  chat: Chat;
}

// 加群事件
export interface GroupMemberJoinedEvent
{
  sender: Sender;
  chat: Chat;
  joinedMember: {
    memberId: string;
    memberNickname: string;
  };
}

// 退群事件
export interface GroupMemberLeavedEvent
{
  sender: Sender;
  chat: Chat;
  leavedMember: {
    memberId: string;
    memberNickname: string;
  };
  leaveType: 'self' | 'kicked'; // 自行退出或被踢出
}

// 成员被邀请加入群聊事件
export interface GroupMemberInvitedEvent
{
  sender: Sender;
  chat: Chat;
  invitedMember: {
    memberId: string;
    memberNickname: string;
  };
  inviter: {
    inviterId: string;
    inviterNickname: string;
  };
}

// 成员被踢出群聊事件
export interface GroupMemberKickedEvent
{
  sender: Sender;
  chat: Chat;
  kickedMember: {
    memberId: string;
    memberNickname: string;
  };
  operator: {
    operatorId: string;
    operatorNickname: string;
  };
}

// 群聊被解散事件
export interface GroupDisbandedEvent
{
  sender: Sender;
  chat: Chat;
  operator: {
    operatorId: string;
    operatorNickname: string;
  };
}

// 联合类型，表示所有可能的事件
export type Event = MessageEvent | GroupMemberJoinedEvent | GroupMemberLeavedEvent |
  GroupMemberInvitedEvent | GroupMemberKickedEvent | GroupDisbandedEvent;

export interface Chat
{
  chatId: string;
  chatType: 'bot' | 'group';
}

export interface YunhuResponse
{
  code: number;
  msg: string;
  data?: any;
}

export interface Internal
{
  token: string;
  endpoint: string;
}

// YunhuBot 接口定义类型
export type FormatType = 'text' | 'markdown' | 'html';

export type ResourceType = 'image' | 'video' | 'file';

export interface ResourceResult
{
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface UploaderOptions
{
  http: HTTP;
  token: string;
  apiendpoint: string;
  resourceType: ResourceType;
  maxSize: number;
}


export interface Message
{
  msgId: string;
  parentId?: string;
  senderId: string;
  senderType: string;
  senderNickname: string;
  contentType: Message['contentType'];
  content: Content;
  sendTime: number;
  commandName?: string;
  commandId?: number;
}

interface ResponseData
{
  list: Message[];
  total: number;
}

export interface ApiResponse
{
  code: number;
  data: ResponseData;
  msg: string;
}