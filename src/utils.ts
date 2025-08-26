import { Bot, Context, h, Session, Universal, Logger, HTTP } from 'koishi'
import * as Yunhu from './types'
import YunhuBot, { name } from './'
import * as mime from 'mime-types'
import path from 'path'
import { fileFromPath } from 'formdata-node/file-from-path'
import { CompressResult, ImageMetadata, ResourceResult } from './types'
import sharp, { cache } from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import { PassThrough } from 'stream'
import Internal from './internal'
import { config } from 'process'

export * from './types' 

const logger = new Logger('yunhu-utils')
const URL = "https://chat-img.jwznb.com/"
 
// 将云湖用户信息转换为Koishi通用用户格式
export const decodeUser = (user: Yunhu.Sender): Universal.User => ({
  id: user.senderId,
  name: user.senderNickname,
  isBot: false,
})

// 将云湖消息转换为Koishi通用消息格式
export const decodeMessage = async (
  message: Yunhu.Message,
  Internal: Internal,
  session: Session,
  config
): Promise<Universal.Message> => {
  const elements: any[] = [];
  let textContent = message.content.text || '';

  if (message.content.text ==="/" + message.commandName) {
    textContent = '';
  }
  session.content =  (message.commandName ? message.commandName + ' ' : '') + textContent
  // 处理引用回复
  if (message.parentId) {
    const send: h[] = [];
    if (message.content.parentImgName) {
      send.push(h('img', {
        src: config._host + "?url=" + URL + message.content.parentImgName
      }));
    } else if (message.content.parent && message.content.parent.split(':')[1]) {
      send.push(h.text(message.content.parent.substring(message.content.parent.indexOf(':') + 1)));
    }
    elements.push(h('quote', { id: message.parentId }, send));
  }
  // 处理@用户
  if (message.content.at && message.content.at.length > 0) {
    // 获取所有@用户的昵称映射
    const userMap = new Map();
    await Promise.all(
      message.content.at.map(async (id) => {
        try {
          const user = await Internal.getUser(id);
          userMap.set(id, user.data.user.nickname);
        } catch (error) {
          logger.error(`获取用户信息失败: ${id}`, error);
        }
      })
    );

    // 按文本顺序处理@
    const atPositions: Array<{ index: number; id: string; name: string }> = [];
    
    // 查找所有@位置
    for (const id of message.content.at) {
      const name = userMap.get(id);
      if (name) {
        const atText = `@${name}`;
        let startIndex = 0;
        
        while (startIndex < textContent.length) {
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
    for (const { index, id, name } of atPositions) {
      // 添加@前的文本
      if (index > lastIndex) { 
        elements.push(h.text((message.commandName ? message.commandName + ' ' : '') + textContent.substring(lastIndex, index)));
      }
      
      // 添加@元素
      elements.push(h.at(id, { name }));
      
      // 更新最后索引位置（跳过@文本）
      lastIndex = index + name.length + 1; // +1 是为了跳过@符号
    }
    
    // 添加剩余文本
    if (lastIndex < textContent.length) {
      elements.push(h.text(textContent.substring(lastIndex)));
    }
  } else if (textContent) {
    // 如果没有@，直接添加文本
    elements.push(h.text((message.commandName ? message.commandName + ' ' : '') + (textContent)));
  }

  // 处理图片内容
  if (message.content.imageUrl) {
    // 这里可以构造一个图片URL
    elements.push(h.image(message.content.imageUrl));
  }

  // 处理文件内容
  if (message.content.fileKey) {
    elements.push(h.text('[文件]'));
  }

  // 处理视频内容
  if (message.content.videoKey) {
    elements.push(h.text('[视频]'));
  }

 

  return {
    id: message.msgId,
    content: textContent, // 保留原始文本内容
    elements,
  };
};

// 将消息内容转换为Koishi消息元素
function transformElements(elements: any[]) {
  return elements.map(element => {
    if (typeof element === 'string') {
      return h.text(element);
    } else if (Buffer.isBuffer(element)) {
      return h.image(element, 'image/png', {
        filename: 'image.png',
        cache: false
      });
    } else if (typeof element === 'object' && element.type === 'image') {
      if (element.url) {
        return h('image', {
          src: element.url,
          filename: element.filename || 'image.png',
          cache: false,
          weight: element.weight || 0,
          height: element.height || 0
        });
      } else if (element.data) {
        return h.image(element.data, 'image/png');
      }
    }
    return h.text(String(element));
  });
}

// 适配会话，将云湖事件转换为Koishi会话
export async function adaptSession<C extends Context = Context>(bot: YunhuBot<C>, input: Yunhu.YunhuEvent) {
  const session = bot.session()
  const Internal = bot.internal
  session.setInternal(bot.platform, input)

  switch (input.header.eventType) {
    // 消息事件处理
    case 'message.receive.normal':
    case 'message.receive.instruction': {
      const { sender, message, chat } = input.event as Yunhu.MessageEvent;
      session.type = 'message'
      session.userId = sender.senderId
      session.event.user.name = sender.senderNickname
      session.event.user.nick = sender.senderNickname
      session.event.user.id = sender.senderId
      const level = ()=>{ 
        if (sender.senderUserLevel === 'owner') {
          return 0x1FFFFFFFFF
        }else if (sender.senderUserLevel === 'administrator'){
          return 0x8
        }else if (sender.senderUserLevel === 'member'){
          return 2048
        }else{
          return 0
        }
      }
      const UserInfo = await Internal.getUser(session.userId)
      session.event.role = {
        "id": chat.chatId,
        "name": UserInfo.data.user.nickname, 
        "permissions": BigInt(level()), 
        "color": null, 
        "position": null, 
        "hoist": false,
        "mentionable": false
      }
      session.author.user = {
        "id": session.userId,
        "name": UserInfo.data.user.nickname,
        "nick": UserInfo.data.user.nickname,
        "avatar": bot.config._host+ "?url=" + UserInfo.data.user.avatarUrl,
        "isBot": false // 云湖目前没有提供isBot字段，暂时设为false
      }
      session.event.member = {
        "user": session.author.user,
        "name": UserInfo.data.user.nickname,
        "nick": UserInfo.data.user.nickname,
        "avatar":bot.config._host + "?url=" + UserInfo.data.user.avatarUrl
      }

      session.author.name = UserInfo.data.user.nickname
      session.author.nick = UserInfo.data.user.nickname
      // session.author.isBot = UserInfo.data.user.isBot
      session.author.isBot = false // 云湖目前没有提供isBot字段，暂时设为false
      // 设置频道ID，区分私聊和群聊
      if (message.chatType === 'bot') {
        session.channelId = `${sender.senderId}:user`
        session.isDirect = true
      } else {
        session.channelId = `${message.chatId}:${message.chatType}`
        session.guildId = message.chatId
        session.isDirect = false
      }

      // 设置消息内容和元数据
      
      session.messageId = message.msgId
      session.timestamp = message.sendTime
      // session.quote.id = message.parentId? message.parentId : undefined

      
      // logger.info(message)
      

      // 转换消息内容为Koishi格式
      session.event.message =await decodeMessage(message, Internal, session, bot.config)
      logger.info(`已转换为koishi消息格式:`)
      logger.info(session)
      
      break;
    }

    // 好友添加事件
    case 'bot.followed': {
      session.type = 'friend-added'
      const { sender } = input.event as Yunhu.MessageEvent;
      session.userId = sender.senderId
      session.event.user.name = sender.senderNickname
      break;
    }

    // 加群事件处理
    case 'group.member.joined': {
      const { sender, chat, joinedMember } = input.event as Yunhu.GroupMemberJoinedEvent;
      session.type = 'guild-member-added'
      session.userId = joinedMember.memberId
      session.event.user.name = joinedMember.memberNickname
      session.guildId = chat.chatId
      session.operatorId = sender.senderId
      break;
    }

    // 退群事件处理
    case 'group.member.leaved': {
      const { sender, chat, leavedMember, leaveType } = input.event as Yunhu.GroupMemberLeavedEvent;
      session.type = 'guild-member-removed'
      session.userId = leavedMember.memberId
      session.event.user.name = leavedMember.memberNickname
      session.guildId = chat.chatId
      session.operatorId = sender.senderId
      // 区分自己退出还是被踢出
      session.subtype = leaveType === 'self' ? 'leave' : 'kick'
      break;
    }

    // 成员被邀请加入群聊事件
    case 'group.member.invited': {
      const { sender, chat, invitedMember, inviter } = input.event as Yunhu.GroupMemberInvitedEvent;
      session.type = 'guild-member-added'
      session.userId = invitedMember.memberId
      session.event.user.name = invitedMember.memberNickname
      session.guildId = chat.chatId
      session.operatorId = inviter.inviterId
      session.subtype = 'invite'
      break;
    }

    // 成员被踢出群聊事件
    case 'group.member.kicked': {
      const { sender, chat, kickedMember, operator } = input.event as Yunhu.GroupMemberKickedEvent;
      session.type = 'guild-member-removed'
      session.userId = kickedMember.memberId
      session.event.user.name = kickedMember.memberNickname
      session.guildId = chat.chatId
      session.operatorId = operator.operatorId
      session.subtype = 'kick'
      break;
    }

    // 群聊被解散事件
    case 'group.disbanded': {
      const { sender, chat, operator } = input.event as Yunhu.GroupDisbandedEvent;
      session.type = 'guild-deleted'
      session.guildId = chat.chatId
      session.operatorId = operator.operatorId
      break;
    }

    // 未知事件类型
    default:
      bot.logger.debug(`未处理的事件类型: ${input.header.eventType}`)
      return // 忽略未知事件
  }

  return session
}


// 支持的图片MIME类型
const VALID_IMAGE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/bmp', 'image/tiff', 'image/svg+xml', 'image/x-icon'
]

/**
 * 将各种资源类型转换为标准格式
 * @param resource 资源 (URL, 路径, Buffer, base64, h.Element)
 * @param defaultFileName 默认文件名
 * @param defaultMimeType 默认MIME类型
 * @param http HTTP实例用于获取URL资源
 * @returns 标准化的资源结果
 */
// ... 文件开头部分保持不变 ...


export async function resolveResource(
  resource: string | Buffer | any,
  defaultFileName: string,
  defaultMimeType: string,
  http: HTTP
): Promise<ResourceResult> {
  let fileName = defaultFileName;
  let mimeType = defaultMimeType;
  let dataBuffer: Buffer | null = null; // 修复：重命名变量避免冲突

  if (resource && typeof resource === 'object' && resource.type === 'image') {
    fileName = resource.attrs?.filename || fileName;
    if (resource.attrs?.url) {
      const response = await http.get(resource.attrs.url, { responseType: 'arraybuffer' });
      dataBuffer = Buffer.from(response);
    } else if (resource.attrs?.data) {
      dataBuffer = resource.attrs.data;
    } else {
      throw new Error('资源元素缺少 url 或 data 属性');
    }
  } else if (Buffer.isBuffer(resource)) {
    dataBuffer = resource;
  } else if (typeof resource === 'string') {
    if (resource.startsWith('data:')) {
      const parts = resource.split(',');
      const base64Data = parts[1];
      const inferredMime = parts[0].match(/data:(.*?);base64/)?.[1];
      if (inferredMime) {
        mimeType = inferredMime;
        fileName = `resource.${mime.extension(inferredMime) || 'dat'}`;
      }
      dataBuffer = Buffer.from(base64Data, 'base64');
    } else if (resource.startsWith('http://') || resource.startsWith('https://')) {
      const response = await http.get(resource, { responseType: 'arraybuffer' });
      dataBuffer = Buffer.from(new Uint8Array(response));
      const urlParts = resource.split('/');
      fileName = urlParts[urlParts.length - 1].split('?')[0];
      const ext = path.extname(fileName);
      if (ext) {
        const inferredMime = mime.lookup(ext);
        if (inferredMime) mimeType = inferredMime;
      }
    } else { // 本地文件路径
      const resolvedPath = path.resolve(resource);
      fileName = path.basename(resolvedPath);
      const inferredMime = mime.lookup(resolvedPath);
      if (inferredMime) mimeType = inferredMime;
      const file = await fileFromPath(resolvedPath);
      dataBuffer = Buffer.from(await file.arrayBuffer());
    }
  } else {
    throw new Error('资源类型不支持');
  }

  // 修复：使用重命名后的变量
  if (!dataBuffer) throw new Error('无法获取资源数据');
  
  // 添加大小验证
  if (dataBuffer.length === 0) {
    throw new Error('资源内容为空');
  }
  
  // 添加最大大小限制
  const MAX_RESOURCE_SIZE = 500 * 1024 * 1024; // 500MB
  if (dataBuffer.length > MAX_RESOURCE_SIZE) {
    const sizeMB = (dataBuffer.length / (1024 * 1024)).toFixed(2);
    throw new Error(`资源过大 (${sizeMB}MB)，超过${MAX_RESOURCE_SIZE / (1024 * 1024)}MB限制`);
  }

  // 修复：使用重命名后的变量
  return { buffer: dataBuffer, fileName, mimeType };
}

/**
 * 验证图片并获取元数据
 * @param buffer 图片Buffer
 * @returns 图片元数据
 */
export async function validateImage(buffer: Buffer): Promise<ImageMetadata> {
  try {
    const metadata = await sharp(buffer).metadata()
    
    if (!metadata.format) {
      throw new Error('无法识别图片格式')
    }
    
    const formatMap: Record<string, string> = {
      'jpeg': 'image/jpeg',
      'jpg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'tiff': 'image/tiff',
      'svg': 'image/svg+xml',
      'ico': 'image/x-icon',
      'bmp': 'image/bmp'
    }
    
    const mimeType = formatMap[metadata.format]
    if (!mimeType) {
      throw new Error(`不支持的图片格式: ${metadata.format}`)
    }
    
    return { format: metadata.format, mimeType }
  } catch (error: any) {
    logger.error('图片验证失败:', error.message)
    throw new Error('上传的文件不是有效的图片')
  }
}

/**
 * 压缩图片
 * @param buffer 图片Buffer
 * @param originalMime 原始MIME类型
 * @param maxSize 最大尺寸限制 (字节)
 * @returns 压缩结果
 */
export async function compressImage(
  buffer: Buffer,
  originalMime: string,
  maxSize: number
): Promise<CompressResult> {
  const originalSize = buffer.length
  const originalMB = (originalSize / (1024 * 1024)).toFixed(2)
  logger.info(`原始图片大小: ${originalMB}MB`)
  
  try {
    let compressBuffer = buffer
    let compressMime = originalMime
    let sharpInstance = sharp(buffer)

    // 动图保持原格式压缩
    const isAnimated = originalMime.includes('gif') || originalMime.includes('webp')
    if (!isAnimated) {
      compressMime = 'image/jpeg'
      sharpInstance = sharpInstance.jpeg({ 
        quality: 80, 
        progressive: true,
        mozjpeg: true
      })
    }

    // 计算缩放比例
    const targetRatio = Math.sqrt(maxSize / originalSize) * 0.95
    
    // 获取原始尺寸
    const metadata = await sharp(buffer).metadata()
    const originalWidth = metadata.width || 1920
    const originalHeight = metadata.height || 1080
    
    // 计算新尺寸
    const newWidth = Math.floor(originalWidth * targetRatio)
    const newHeight = Math.floor(originalHeight * targetRatio)
    
    logger.info(`压缩尺寸: ${originalWidth}x${originalHeight} -> ${newWidth}x${newHeight}`)

    // 执行压缩
    compressBuffer = await sharpInstance
      .resize(newWidth, newHeight)
      .toBuffer()

    // 检查压缩结果
    const compressedSize = compressBuffer.length
    const compressedMB = (compressedSize / (1024 * 1024)).toFixed(2)
    
    if (compressedSize <= maxSize) {
      logger.info(`压缩成功! 大小: ${compressedMB}MB`)
      return { buffer: compressBuffer, mimeType: compressMime }
    }
    
    throw new Error(`无法将图片压缩至${maxSize / (1024 * 1024)}MB以下`)
  } catch (error: any) {
    logger.error('图片压缩失败:', error)
    throw new Error('图片压缩失败，无法上传')
  }
}

/**
 * 压缩视频至指定大小
 * @param buffer 视频Buffer
 * @param maxSize 最大尺寸限制 (字节)
 * @returns 压缩结果
 */

/**
 * 压缩视频至指定大小
 * @param buffer 视频Buffer
 * @param maxSize 最大尺寸限制 (字节)
 * @param ffmpegPath FFmpeg可执行文件路径
 * @returns 压缩结果
 */
export async function compressVideo(
  buffer: Buffer,
  maxSize: number,
  ffmpegPath: string
): Promise<CompressResult> {
  const originalSize = buffer.length
  const originalMB = (originalSize / (1024 * 1024)).toFixed(2)
  logger.info(`原始视频大小: ${originalMB}MB`)
  
  try {
    // 设置 FFmpeg 路径
    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath)
      logger.info(`使用 FFmpeg 路径: ${ffmpegPath}`)
    }
    
    // 计算目标比特率 (kbps)
    const targetBitrate = Math.floor((maxSize * 8) / (1024 * 60)) // 假设视频时长约60秒
    
    return new Promise((resolve, reject) => {
      const outputChunks: any[] = []
      const outputStream = new PassThrough()
      
      // 收集压缩后的数据
      outputStream.on('data', (chunk) => outputChunks.push(chunk))
      outputStream.on('end', () => {
        const compressedBuffer = Buffer.concat(outputChunks)
        const compressedSize = compressedBuffer.length
        const compressedMB = (compressedSize / (1024 * 1024)).toFixed(2)
        
        if (compressedSize <= maxSize) {
          logger.info(`视频压缩成功! 大小: ${compressedMB}MB`)
          resolve({ buffer: compressedBuffer, mimeType: 'video/mp4' })
        } else {
          logger.warn(`压缩后视频仍过大: ${compressedMB}MB > ${maxSize / (1024 * 1024)}MB`)
          reject(new Error(`无法将视频压缩至${maxSize / (1024 * 1024)}MB以下`))
        }
      })
      
      // 创建FFmpeg进程
      ffmpeg()
        .input(new PassThrough().end(buffer))
        .inputFormat('mp4')
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset fast', // 快速压缩预设
          '-crf 28',      // 高压缩率
          `-b:v ${targetBitrate}k`,
          '-maxrate 1000k',
          '-bufsize 2000k',
          '-movflags +faststart'
        ])
        .on('start', (commandLine) => {
          logger.info(`启动FFmpeg压缩: ${commandLine}`)
        })
        .on('progress', (progress) => {
          logger.info(`压缩进度: ${progress.percent}%`)
        })
        .on('error', (err) => {
          logger.error('视频压缩失败:', err.message)
          reject(new Error('视频压缩失败'))
        })
        .on('end', () => {
          logger.info('视频压缩完成')
        })
        .output(outputStream, { end: true })
        .run()
    })
  } catch (error: any) {
    logger.error('视频压缩失败:', error)
    throw new Error('视频压缩失败，无法上传')
  }
}



/**
 * 获取文件扩展名
 * @param mimeType MIME类型
 * @returns 文件扩展名
 */
export function getExtension(mimeType: string): string {
  return mime.extension(mimeType) || 'dat'
}


/**
 * 更新文件名扩展
 * @param fileName 原始文件名
 * @param mimeType MIME类型
 * @returns 更新后的文件名
 */
export function updateFileExtension(fileName: string, mimeType: string): string {
  const ext = getExtension(mimeType)
  return fileName.replace(/\.[^.]+$/, '') + '.' + ext
}