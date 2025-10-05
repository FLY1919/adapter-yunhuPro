import YunhuBot from './'
//import { decodeMessage } from './utils'
import * as Yunhu from './types'
import { Context, h, Dict, MessageEncoder, Logger } from 'koishi'

const logger = new Logger('yunhu-message')



//我们需要明白text->markdown->html的转换关系
// 以及图片、视频、文件等资源的上传和引用方式
export class YunhuMessageEncoder<C extends Context> extends MessageEncoder<C, YunhuBot<C>> {
    // 使用 payload 存储待发送的消息
    private payload: Dict
    private sendType: 'text' | 'image' | 'video' | 'file' | 'markdown' | 'html' | undefined = undefined
    private html = ""
    private text = ""
    private markdown = ""
    private message: Dict = []


    async prepare() {
    let [recvId, recvType] = this.channelId.split(':');
    // 初始化 payload
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
    if (message.parentId) {
        session.event.message.quote.id = message.parentId
    }
    session.app.emit(session, 'send', session)
}
    // 发送缓冲区内的消息
    async flush() {
    async function reset() {
        this.payload.content.text = ''
        this.sendType = undefined
        this.message = []
        this.payload.content.imageKey = undefined
        this.payload.content.fileKey = undefined
        this.payload.content.videoKey = undefined
        this.payload.contentType = 'text'
        this.html = ""
        this.text = ""
        this.markdown = ""
    }
    let message: Yunhu.Message

    this.payload.contentType = this.sendType
    if (this.sendType === 'text'){
        this.payload.content.text = this.text
    } else if (this.sendType === 'markdown'){
        this.payload.content.text = this.markdown
    } else if (this.sendType === 'html'){
        this.payload.content.text = this.html
    }
    message = await this.bot.internal.sendMessage(this.payload)

    await this.addResult(message)
    await reset.call(this)
}


    // 遍历消息元素
    async visit(element: h) {
    const { type, attrs, children } = element

    try {
        if (type === 'text') {
            if (this.sendType == undefined) {
                this.sendType = 'text'
            } else if (this.sendType === 'image') {
                this.sendType = 'markdown'
            }
            // 处理文本元素
            this.text += this.sendType === "text" ? element.attrs.content : ''
            this.markdown += this.sendType != "html" ? element.attrs.content : ''
            this.html +=  element.attrs.content
        }
        else if (type === 'img' || type === 'image') {
            if (this.sendType == undefined) {
                this.sendType = 'image'
            } else if (this.sendType === 'text') {
                this.sendType = 'markdown'
            } else if (this.sendType === 'image') {
                this.sendType = 'markdown'
            }
            try {
            // 尝试上传图片获取imageKey
            const img = await this.bot.internal.uploadImageUrl(element.attrs.src)
            this.markdown += this.sendType != "html" ?  `\n![美少女大失败](${img.imageurl})\n` : ''
            this.html += `<img src="${img.url}" alt="FLY可爱~[图片]">`
            if (this.sendType === 'image') {
                this.payload.content.imageKey = img.imagekey
                this.payload.contentType = 'image'
            }
        


            //this.payload.content.text += await this.bot.internal.uploadImageUrl(attrs.src)
        } catch (error) {
            this.bot.logger.error(`图片上传失败: ${error}`)
            // 降级为文本处理
            this.markdown += this.sendType != "html" ? '~~[图片上传失败]~~ ' : ''
            this.html +=  `<span style ="color: red;">美少女大失败</span>`
            if (this.sendType === 'image') {
                this.sendType = 'text'
                this.text += `[图片上传失败]`
            } 
        }
        }
        else if (type === 'at') {
            // 处理@用户元素
            if (this.sendType == undefined) {
                this.sendType = 'markdown'
            } else if (this.sendType === 'image') {
                this.sendType = 'markdown'
            }
            this.markdown += this.sendType != 'html' ? `[@${element.attrs.name || element.attrs.id}](https://www.yhchat.com/user/homepage/${element.attrs.id}) ` : ''
            this.html += `<a href="https://www.yhchat.com/user/homepage/${element.attrs.id}}">@${element.attrs.name || element.attrs.id}</a>`
        }
        else if (type === 'br') {
            // 处理换行符
            if (this.sendType == undefined) {
                this.sendType = 'text'
            } else if (this.sendType === 'image') {
                this.sendType = 'markdown'
            }
            this.text += this.sendType === "text" ? "\n" : ''
            this.markdown += this.sendType != "html" ? "\n" : ''
            this.html += `<br>`
        }
        else if (type === 'p') {
            // 处理段落
            if (this.sendType == undefined) {
                this.sendType = 'text'
            } else if (this.sendType === 'image') {
                this.sendType = 'markdown'
            }
            this.text += this.sendType === "text" ? "\n" : ''
            this.markdown += this.sendType != "html" ? "\n" : ''
            this.html += '<p>'
            await this.render(children)
            this.html += '</p>'
        }
        else if (type === 'a') {
            // 处理链接
            if (this.sendType == undefined) {
                this.sendType = 'text'
            } else if (this.sendType === 'image') {
                this.sendType = 'markdown'
            }
            this.text += this.sendType === "markdown" ? element.attrs.href + " " : ''
            this.markdown += this.sendType != "html" ? `**[链接](${element.attrs.href})** ` : ''
            this.html += `<a href="${element.attrs.href}">`
            await this.render(children)
            this.html += '</a>'
        }
        else if (type === 'file') {
            await this.flush()
            if (this.sendType == undefined) {
                this.sendType = 'file'
            }
            try {
                // 尝试上传文件获取fileKey
                const filekey = await this.bot.internal.uploadFile(element.attrs.src)
                if (this.sendType === 'file') {
                    this.payload.content.fileKey = filekey
                }
            } catch (error) {
                this.bot.logger.error(`文件上传失败: ${error}`)
                this.sendType = 'text'
                this.text += `[文件上传失败]`
            }
            await this.flush()
        }
        else if (type === 'video') {
            await this.flush()
            this.sendType = 'video'
            // 处理视频
            try {
                // 尝试上传视频获取videoKey
                const videokey = await this.bot.internal.uploadVideo(attrs.src)
                this.payload.content.videoKey = videokey
                await this.flush()
            } catch (error) {
                this.bot.logger.error(`视频上传失败: ${error}`)
                this.sendType = 'text'
                this.text += `[视频上传失败]`
                await this.flush()
            }

        }

        else if (type === 'yunhu:markdown') {
            if (this.message.length > 0) {
                await this.flush()
            }
            this.sendType = 'markdown' 
            await this.render(children)
            await this.flush()
        }
        else if (type === 'message') {
            if (this.message.length > 0) {
                await this.flush()
            }
            await this.render(children)
            await this.flush()
        }
        else if (type === 'quote') {
            await this.flush()
            this.payload.parentId = attrs.id
            await this.render(children)
            this.payload.parentId = ''
            await this.flush()
        }
        else if (type === 'author'){
            if (this.sendType == undefined) {
                this.sendType = 'markdown'
            } else if (this.sendType === 'image') {
                this.sendType = 'markdown'
            } else if (this.sendType === 'text') {
                this.sendType = 'markdown'
            }
            this.markdown += this.sendType != "html" ? `**${attrs.name}**\n` : ''
            this.html += `<strong>${attrs.name}</strong><br>`
            await this.render(children)
        }
        else if (type === 'h1'){
            if (this.sendType == undefined) {
                this.sendType = 'markdown'
            } else if (this.sendType === 'image') {
                this.sendType = 'markdown'
            } else if (this.sendType === 'text') {
                this.sendType = 'markdown'
            }
            this.markdown += this.sendType != "html" ? '# ' : ''
            this.html += '<h1>'
            await this.render(children)
            this.html += '</h1>'
        }
        else if (type === 'h2'){
            if (this.sendType == undefined) {
                this.sendType = 'markdown'
            } else if (this.sendType === 'image') {
                this.sendType = 'markdown'
            } else if (this.sendType === 'text') {
                this.sendType = 'markdown'
            }
            this.markdown += this.sendType != "html" ? '## ' : ''
            this.html += '<h2>'
            await this.render(children)
            this.html += '</h2>'
        }
        else if (type === 'h3'){
            if (this.sendType == undefined) {
                this.sendType = 'markdown'
            } else if (this.sendType === 'image') {
                this.sendType = 'markdown'
            } else if (this.sendType === 'text') {
                this.sendType = 'markdown'
            }
            this.markdown += this.sendType != "html" ? '### ' : ''
            this.html += '<h3>'
            await this.render(children)
            this.html += '</h3>'
        }
        else if (type === 'h5'){
            if (this.sendType == undefined) {
                this.sendType = 'markdown'
            } else if (this.sendType === 'image') {
                this.sendType = 'markdown'
            } else if (this.sendType === 'text') {
                this.sendType = 'markdown'
            }
            this.markdown += this.sendType != "html" ? '##### ' : ''
            this.html += '<h5>'
            await this.render(children)
            this.html += '</h5>'
        }
        else if (type === 'h6'){
            if (this.sendType == undefined) {
                this.sendType = 'markdown'
            } else if (this.sendType === 'image') {
                this.sendType = 'markdown'
            } else if (this.sendType === 'text') {
                this.sendType = 'markdown'
            }
            this.markdown += this.sendType != "html" ? '###### ' : ''
            this.html += '<h6>'
            await this.render(children)
            this.html += '</h6>'
        }
        else if (type === 'b'){
            if (this.sendType == undefined) {
                this.sendType = 'markdown'
            } else if (this.sendType === 'image') {
                this.sendType = 'markdown'
            } else if (this.sendType === 'text') {
                this.sendType = 'markdown'
            }
            this.markdown += this.sendType != "html" ? '**' : ''
            this.html += '<b>'
            await this.render(children)
            this.markdown += this.sendType != "html" ? '**' : ''
            this.html += '</b>'
        }
        else if (type === 'i'){
            if (this.sendType == undefined) {
                this.sendType = 'markdown'
            } else if (this.sendType === 'image') {
                this.sendType = 'markdown'
            } else if (this.sendType === 'text') {
                this.sendType = 'markdown'
            }
            this.markdown += this.sendType != "html" ? '*' : ''
            this.html += '<em>'
            await this.render(children)
            this.markdown += this.sendType != "html" ? '*' : ''
            this.html += '</em>'
        }
        else if (type === 'u' || type === 'sup' || type === 'sub'
        ) {
            this.sendType = 'html'
            this.sendType = 'html'
            this.html += `</${type}>`
            await this.render(children)
            this.html += `</${type}>`
        }
        else {
            this.bot.logger.warn(`未知消息元素类型: ${type}`)
            await this.render(children)
        }

    } catch (error) {

    }

}
}