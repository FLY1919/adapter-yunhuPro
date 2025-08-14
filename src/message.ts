import YunhuBot from './'
import { decodeMessage } from './utils'
import * as Yunhu from './types'
import { Context, h, Dict, MessageEncoder } from 'koishi'

export class YunhuMessageEncoder<C extends Context> extends MessageEncoder<C, YunhuBot<C>> {
    // 使用 payload 存储待发送的消息
    private payload: Dict
    private lockType: string

    // 在 prepare 中初始化 payload
    async prepare() {
        let [recvId, recvType] = this.channelId.split(':');
        this.lockType = 'text';
        this.payload = {
            recvId,
            recvType,
            contentType: 'text',
            content: {
                text: ''
            },
            parentId: this.session.quote ? this.session.quote.id : undefined
        }
    }

    // 将发送好的消息添加到 results 中
    async addResult(data: any) {
        const message = data.data.messageInfo
        this.results.push(message)
        const session = this.bot.session()
        session.event.message = message
        session.channelId = this.channelId
        session.event.message.id = message.msgId
        // session.quote.id = message.parentId? message.parentId : undefined
        if(message.parentId) {
            session.event.message.quote.id = message.parentId
        }
        session.app.emit(session, 'send', session)
    }

    // 发送缓冲区内的消息
    async flush() {
        let message: Yunhu.Message
        
        // 根据contentType决定发送什么类型的消息
        if (this.payload.contentType === 'text' && this.payload.content.text) {
            message = await this.bot.internal.sendMessage(this.payload)
        } else if (this.payload.contentType === 'image' && this.payload.content.imageKey) {
            message = await this.bot.internal.sendMessage(this.payload)
        } else if (this.payload.contentType === 'file' && this.payload.content.fileKey) {
            message = await this.bot.internal.sendMessage(this.payload)
        } else if (this.payload.contentType === 'markdown' && this.payload.content.text) {
            message = await this.bot.internal.sendMessage(this.payload)
        } else {
            // 如果没有有效内容，则不发送
            this.bot.logger.warn('没有有效内容可发送')
            return
        }
        
        await this.addResult(message)
        
        // 重置payload内容，准备下一次发送
        this.payload.content.text = ''
        this.payload.content.imageKey = undefined
        this.payload.content.fileKey = undefined
        this.payload.contentType = 'text'
    }

    // 遍历消息元素
    async visit(element: h) {
        const { type, attrs, children } = element
        
        try {
            if (type === 'text') {
                // 处理文本元素
                this.payload.content.text += h.escape(attrs.content)
                this.payload.contentType = 'text'
            } 
            else if (type === 'img' || type === 'image') {
                // 处理图片元素
                try {
                    // 尝试上传图片获取imageKey
                    const imgkey = await this.bot.internal.uploadImage(attrs.src)
                    this.payload.content.imageKey = imgkey
                    this.payload.contentType = 'image'
                } catch (error) {
                    this.bot.logger.error(`图片上传失败: ${error}`)
                    // 降级为文本处理
                    this.payload.content.text += `[图片上传失败]`
                    this.payload.contentType = 'text'
                }
            }
            else if (type === 'at') {
                // 处理@用户元素
                this.payload.content.text += `@${attrs.name || attrs.id} `
                this.payload.contentType = 'text'
            }
            else if (type === 'br') {
                // 处理换行符
                this.payload.content.text += '\n'
                this.payload.contentType = 'text'
            }
            else if (type === 'p') {
                // 处理段落
                await this.render(children)
                this.payload.content.text += '\n\n'
                this.payload.contentType = 'text'
            }
            else if (type === 'a') {
                // 处理链接
                await this.render(children)
                if (attrs.href) {
                    this.payload.content.text += ` (${attrs.href})`
                }
                this.payload.contentType = 'text'
            }
            else if (type === 'file') {
                try {
                    // 尝试上传文件获取fileKey
                    const filekey = await this.bot.internal.uploadFile(attrs.src)
                    this.payload.content.fileKey = filekey
                    this.payload.contentType = 'image'
                } catch (error) {
                    this.bot.logger.error(`文件上传失败: ${error}`)
                    // 降级为文本处理
                    this.payload.content.text += `[文件上传失败]`
                    this.payload.contentType = 'text'
                }
            }
            else if (type === 'video') {
                // 处理视频
                try {
                    // 尝试上传视频获取videoKey
                    const videokey = await this.bot.internal.uploadVideo(attrs.src)
                    this.payload.content.videoKey = videokey
                    this.payload.contentType = 'video'
                } catch (error) {
                    this.bot.logger.error(`视频上传失败: ${error}`)
                    // 降级为文本处理
                    this.payload.content.text += `[视频上传失败]`
                    this.payload.contentType = 'text'
                }
            }
            else if (type === 'markdown') {
                this.payload.content.text += h.escape(attrs.content)
                this.payload.contentType = 'markdown'
            }
            else {
                // 处理其他元素的子元素
                await this.render(children)
            }
        } catch (error) {
            // this.bot.logger.error(`处理消息元素失败: ${error? error?.message : '未知错误'}`)
            // 出错时尝试降级处理
            this.payload.content.text += `[元素处理失败]`
            this.payload.contentType = 'text'
        }
    }
}