import { log } from 'console'
import YunhuBot from './'
//import { decodeMessage } from './utils'
import * as Yunhu from './types'
// Removed unused imports for 'marked' and 'DOMPurify'
import { JSDOM } from 'jsdom'
import { Context, h, Dict, MessageEncoder, Logger } from 'koishi'

const logger = new Logger('yunhu-message')

/*
namespace sendWay{
    const image = ["image", "markdown", "html"]
    const video = ["video", "markdown", "html"]
    const file = ["file", "markdown", "html"]
    const text = ["text", "markdown", "html"]
    
}
*/

const HTML = `
<!DOCTYPE html>s
<html> 
<body>
</body>
</html>

`

//我们需要明白text->markdown->html的转换关系
// 以及图片、视频、文件等资源的上传和引用方式
export class YunhuMessageEncoder<C extends Context> extends MessageEncoder<C, YunhuBot<C>> {
    // 使用 payload 存储待发送的消息
    private payload: Dict
    private memrize: Dict = []
    private sendType: 'text' | 'image' | 'video' | 'file' | 'markdown' | 'html' | undefined = undefined
    private html: any
    private message: Dict = []
    private childer: any = undefined
    private temp: Dict = {}

    // 辅助函数：递归提取所有HTML内容
    private escapeAttributeValue(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // 辅助函数：递归提取所有 HTML 内容，包括元素属性
    private extractHtmlContent(element: h): string {
        // 处理文本节点
        if (element.type === 'text') {
            return h.escape(element.attrs.content || '');
        }
        
        // 处理自闭合标签（没有子节点的标签）
        const voidElements = ['img', 'br', 'hr', 'input', 'meta', 'link'];
        const isVoid = voidElements.includes(element.type);
        
        // 构建开始标签
        let tagName = element.type;
        let startTag = `<${tagName}`;
        
        // 添加所有属性
        if (element.attrs) {
            for (const [key, value] of Object.entries(element.attrs)) {
                if (value !== undefined && value !== null && key !== 'content') {
                    const escapedValue = this.escapeAttributeValue(String(value));
                    startTag += ` ${key}="${escapedValue}"`;
                }
            }
        }
        
        startTag += isVoid ? ' />' : '>';
        
        // 如果是自闭合标签，直接返回
        if (isVoid) {
            return startTag;
        }
        
        // 处理子节点
        let content = '';
        if (element.children && element.children.length > 0) {
            for (const child of element.children) {
                content += this.extractHtmlContent(child);
            }
        }
        
        // 构建结束标签
        const endTag = `</${tagName}>`;
        
        return startTag + content + endTag;
    }

    // 辅助函数：递归提取所有纯文本内容
    private extractTextContent(element: h): string {
        if (element.type === 'text') {
            return element.attrs.content || '';
        }
        
        let content = '';
        if (element.children) {
            for (const child of element.children) {
                content += this.extractTextContent(child);
            }
        }
        
        return content;
    }
    // 在 prepare 中初始化 payload
    async changeType(type: 'text' | 'image' | 'video' | 'file' | 'markdown' | 'html') {
        this.payload.contentType = type
    }

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
    
    async deal(element: h, func: ()=> void | undefined) {
        const pElementText = async (context: string): Promise<Dict> => {
            return await this.Element((body: Element) => {
                const p = this.html.window.document.createElement('span')
                p.innerHTML = context
                return { p, body }
            })
        }
        if (element.type === 'text') {
            if (this.sendType === 'text') {
                this.payload.content.text += element.attrs.content
                this.payload.contentType = 'text'
            } else if (this.sendType === 'markdown') {
                this.payload.content.text += h.escape(element.attrs.content)
                this.payload.contentType = 'markdown'
            } else if (this.payload.contentType === 'html') {
                const result = await pElementText(h.escape(element.attrs.content))
                result.p.innerHTML = h.escape(element.attrs.content)
                result.body.appendChild(result.p)
                this.payload.contentType = 'html'
            }
        } else if (element.type === 'image' || element.type === 'img') {
            try {
                // 尝试上传图片获取imageKey
                const img = await this.bot.internal.uploadImageUrl(element.attrs.src)
                if (this.sendType === 'image') {
                    this.payload.content.imageKey = img.imagekey
                    this.payload.contentType = 'image'
                } else if (this.sendType === 'markdown') {
                    this.payload.content.text += `\n![美少女大失败](${img.imageurl})\n`
                    this.payload.contentType = 'markdown'
                } else if (this.sendType === 'html') {
                    await this.Element((body: any) => {
                        const image = this.html.window.document.createElement('img')
                        image.src = img.imageurl
                        body.appendChild(image)
                        this.payload.contentType = 'html'
                    })
                }


                //this.payload.content.text += await this.bot.internal.uploadImageUrl(attrs.src)
            } catch (error) {
                this.bot.logger.error(`图片上传失败: ${error}`)
                // 降级为文本处理
                if (this.sendType === 'image') {
                    this.payload.contentType = 'text'
                    this.payload.content.text += `[图片上传失败]`
                } else if (this.sendType === 'markdown') {
                    this.payload.contentType = 'markdown'
                    this.payload.content.text += ` ~~[图片上传失败]~~ `
                } else if (this.sendType === 'html') {
                    const result = await pElementText(`美少女大失败`)
                    result.p.style = 'color: red;'
                    result.body.appendChild(result.p)
                    this.payload.contentType = 'html'
                }

            }
        } else if (element.type === 'file') {
            try {
                // 尝试上传文件获取fileKey
                const filekey = await this.bot.internal.uploadFile(element.attrs.src)
                if (this.sendType === 'file') {
                    this.payload.content.fileKey = filekey
                    this.payload.contentType = 'file'
                }
            } catch (error) {
                this.bot.logger.error(`文件上传失败: ${error}`)
                // 降级为文本处理
                if (this.sendType === 'file') {
                    this.payload.content.text += `[文件上传失败]`
                    this.payload.contentType = 'text'
                } else if (this.sendType === 'markdown') {
                    this.payload.content.text += ` ~~[文件上传失败]~~ `
                    this.payload.contentType = 'markdown'
                } else if (this.sendType === 'html') {
                    const result = await pElementText(`美少女大失败`)
                    result.p.style = 'color: red;'
                    result.body.appendChild(result.p)
                    this.payload.contentType = 'html'
                }
            }
        } else if (element.type === 'video') {
            try {
                // 尝试上传视频获取videoKey
                const videokey = await this.bot.internal.uploadVideo(element.attrs.src)
                if (this.sendType === 'video') {
                    this.payload.content.videoKey = videokey
                    this.payload.contentType = 'video'
                }
            } catch (error) {
                this.bot.logger.error(`视频上传失败: ${error}`)
                // 降级为文本处理
                if (this.sendType === 'video') {
                    this.payload.content.text += `[视频上传失败]`
                    this.payload.contentType = 'text'
                } else if (this.sendType === 'markdown') {
                    this.payload.content.text += ` ~~[视频上传失败]~~ `
                    this.payload.contentType = 'markdown'
                } else if (this.sendType === 'html') {
                    const result = await pElementText(`美少女大失败`)
                    result.p.style = 'color: red;'
                    result.body.appendChild(result.p)
                    this.payload.contentType = 'html'
                }
            }
        } else if (element.type === 'yunhu:markdown') {
            let content = element.attrs.content;
            
            // 如果没有直接提供 content 属性，从子元素中提取内容
            if (!content && element.children && element.children.length > 0) {
                content = this.extractTextContent(element);
            }
            
            // 确保有内容
            if (content) {
                this.payload.contentType = 'markdown';
                this.payload.content.text = content;
            } else {
                this.bot.logger.warn('yunhu:markdown 元素没有内容');
                this.payload.contentType = 'text';
                this.payload.content.text = '[空的 markdown 内容]';
            }
        } else if (element.type === 'yunhu:html') {
            // 处理 yunhu:html 元素
            let content = element.attrs.content;
            
            // 如果没有直接提供 content 属性，从子元素中提取内容并转换为 HTML
            if (!content && element.children && element.children.length > 0) {
                content = this.extractHtmlContent(element);
            }
            
            // 确保有内容
            if (content) {
                this.payload.contentType = 'html';
                this.payload.content.text = content;
            } else {
                this.bot.logger.warn('yunhu:html 元素没有内容');
                this.payload.contentType = 'text';
                this.payload.content.text = '[空的 HTML 内容]';
            }
        } else if (element.type === 'at') {
            if (this.sendType === 'text'){
                this.payload.content.text += `@${element.attrs.name || element.attrs.id} `
                this.payload.contentType = 'text'
            }else if (this.sendType === 'markdown') {
                this.payload.content.text += `[@${element.attrs.name || element.attrs.id}](https://www.yhchat.com/user/homepage/${element.attrs.id}) ^^ `
                this.payload.contentType = 'markdown'
            } else if (this.sendType === 'html') {
                await this.Element((body: any) => {
                    const a = this.html.window.document.createElement('a')
                    a.href = `https://www.yhchat.com/user/homepage/${element.attrs.id}`
                    body.appendChild(a)
                    this.payload.contentType = 'html'
                })
            }
        } else if (element.type === 'br') {
            if (this.sendType === 'text' || this.sendType === 'markdown') {
                this.payload.content.text += '\n'
                this.payload.contentType = this.sendType
            } else if (this.sendType === 'html') {
                await this.Element((body: any) => {
                    const br = this.html.window.document.createElement('br')
                    body.appendChild(br)
                    this.payload.contentType = 'html'
                })
            }
        } else if (element.type === 'a') {
            if (this.sendType === 'text') {
                this.payload.content.text += element.attrs.content || element.attrs.href || ''
            } else if (this.sendType === 'markdown') {
                this.payload.content.text += ` [${element.attrs.content || element.attrs.href || ''}](${element.attrs.href || ''}) `
            } else if (this.sendType === 'html') {
                await this.Element((body: any) => {
                    const a = this.html.window.document.createElement('a')
                    a.href = element.attrs.href || ''
                    a.innerHTML = element.attrs.content || element.attrs.href || ''
                    body.appendChild(a)
                    this.payload.contentType = 'html'
                })
            }
            // 处理链接元素
            if (element.attrs.href) {
                this.payload.content.text += ` (${element.attrs.href})`
            }
            this.payload.contentType = 'text'
        } else if (element.type === 'p') {
            if (this.sendType === 'text') {
                this.payload.content.text += '\n\n'
                this.payload.contentType = 'text'
                
            }
            else if (this.sendType === 'markdown') {
                this.payload.content.text += '\n\n'
                this.payload.contentType = 'markdown'
            }
            else if (this.sendType === 'html') {
                await this.Element((body: any) => {
                    const p = this.html.window.document.createElement('br')
                    body.appendChild(p)
                    this.payload.contentType = 'html'
                })
            }
        }
        else if( element.type === 'h1' || element.type === 'h2' || element.type === 'h3' || element.type === 'h4' || element.type === 'h5' || element.type === 'h6'){
            //注意子元素处理
            const content = this.extractTextContent(element);
            if (this.sendType === 'markdown'){
                this.payload.content.text += '\n'
                const num = Number(this.sendType.charAt(1))
                var i:number
                for ( i=num ; i>=1 ;i--){
                  this.payload.content.text += '#'  
                }
                this.payload.content.text += content + '\n'
                this.payload.contentType = 'markdown'
            }else if (this.sendType=== 'html') {
                await this.Element((body: any) => {
                    const p = this.html.window.document.createElement(element.type)
                    body.appendChild(p)
                    this.payload.contentType = 'html'
                })
            }
            
        
        }
        else if(element.type === 'strong' || element.type === 'b'){
            if (this.sendType === 'markdown'){
                this.payload.content.text += `**${this.extractTextContent(element)}**`
                this.payload.contentType = 'markdown'
            }else if (this.sendType === 'html') {
                await this.Element((body: any) => {
                    const p = this.html.window.document.createElement('strong')
                    p.innerHTML = this.extractTextContent(element)
                    body.appendChild(p)
                    this.payload.contentType = 'html'
                })
            }
        }else if(element.type === 'i'){
            if (this.sendType === 'markdown'){
                this.payload.content.text += `*${this.extractTextContent(element)}*`
                this.payload.contentType = 'markdown'
            }else if (this.sendType === 'html') {
                await this.Element((body: any) => {
                    const p = this.html.window.document.createElement('i')
                    p.innerHTML = this.extractTextContent(element)
                    body.appendChild(p)
                    this.payload.contentType = 'html'
                })
            }
        }else if(element.type === 's'){
            if (this.sendType === 'markdown'){
                this.payload.content.text += `~~${this.extractTextContent(element)}~~`
                this.payload.contentType = 'markdown'
            }else if (this.sendType === 'html') {
                await this.Element((body: any) => {
                    const p = this.html.window.document.createElement('s')
                    p.innerHTML = this.extractTextContent(element)
                    body.appendChild(p)
                    this.payload.contentType = 'html'
                })
            }
        }else if(element.type === 'code'){
            if (this.sendType === 'markdown'){
                this.payload.content.text += '\n'
                this.payload.content.text += `\`${this.extractTextContent(element)}\``
                this.payload.content.text += '\n'
                this.payload.contentType = 'markdown'
            }else if (this.sendType === 'html') {
                await this.Element((body: any) => {
                    const p = this.html.window.document.createElement('code')
                    p.innerHTML = this.extractTextContent(element)
                    body.appendChild(p)
                    this.payload.contentType = 'html'
                })
            }

        }else if(element.type === 'u'){
            if (this.sendType === 'html') {
                await this.Element((body: any) => {
                    const p = this.html.window.document.createElement('u')
                    p.innerHTML = this.extractTextContent(element)
                    body.appendChild(p)
                    this.payload.contentType = 'html'
                })
            }
        }else if(element.type === 'sup'){
            if (this.sendType === 'html') {
                await this.Element((body: any) => {
                    const p = this.html.window.document.createElement('sup')
                    p.innerHTML = this.extractTextContent(element)
                    body.appendChild(p)
                    this.payload.contentType = 'html'
                })
            }
        }else{
            // 处理未知元素
            this.bot.logger.warn(`未知消息元素类型: ${element.type}`)
            if (this.sendType === 'text') {
                this.payload.content.text += `[未知元素: ${element.type}] `
                this.payload.contentType = 'text'
            } else if (this.sendType === 'markdown') {
                this.payload.content.text += ` ~~[未知元素: ${element.type}]~~  `
                this.payload.contentType = 'markdown'
            } else if (this.sendType === 'html') {
                const result = await pElementText(`未知元素: ${element.type}`)
                result.p.style = 'color: red;'
                result.body.appendChild(result.p)
                this.payload.contentType = 'html'
            }
            await this.render(element.children)
        }
        if (func) func.call(this)()
    }
    // 发送缓冲区内的消息
    async flush() {
        if (this.sendType === "html") {
            if (this.html == undefined) {
                this.html = new JSDOM(HTML)
            }
        }
        /*    private payload: Dict
    private memrize: Dict = []
    private sendType: 'text' | 'image' | 'video' | 'file' | 'markdown' | 'html' | undefined = undefined
    private html: any
    private message: Dict = []
    private childer: any = undefined
    */
        async function reset() {
            this.payload.content.text = ''
            this.sendType = undefined
            this.message = []
            this.childer = undefined
            this.memrize = []
            this.payload.content.imageKey = undefined
            this.payload.content.fileKey = undefined
            this.payload.content.videoKey = undefined
            this.payload.contentType = 'text'
            this.html = undefined
        }
        let message: Yunhu.Message
        if (this.message.length === 0 ) {
            await reset.call(this)
            return
        }
        for (let i = 0; i < this.message.length; i++) {
            const element = this.message[i][0]
            const func = this.message[i][1]
            await this.deal(element, func)
        }
        if (this.sendType === 'html') {
            this.payload.content.text = this.html.window.document.body.innerHTML

        }


        message = await this.bot.internal.sendMessage(this.payload)

        await this.addResult(message)
        await reset.call(this)
        return
    }
    async Element(callback: (arg0: any) => any) {
        const body = this.html.window.document.body
        /*
       const bodyChildren = Array.from(body.children)
       const lastChild = bodyChildren[bodyChildren.length - 1]
       if (lastChild && (lastChild as Element).nodeName === 'P') {
           (lastChild as Element).innerHTML += context
       } else {
           const p = this.html.window.document.createElement('p')
           p.innerHTML = context
           body.appendChild(p)
       }
       */
        return callback(body)
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
                this.message.push([element,this.childer])
                // 处理文本元素


            }
            else if (type === 'img' || type === 'image') {
                if (this.sendType == undefined) {
                    this.sendType = 'image'
                } else if (this.sendType === 'text') {
                    this.sendType = 'markdown'
                }else if (this.sendType === 'image') {
                    this.sendType = 'markdown'
                }
                this.message.push([element,this.childer])
                // 暂时如此处理图片
                // 处理图片元素

            }
            else if (type === 'at') {
                this.message.push([element,this.childer])
                // 处理@用户元素
                if (this.sendType == undefined) {
                    this.sendType = 'text'
                } else if (this.sendType === 'image') {
                    this.sendType = 'markdown'
                }
            }
            else if (type === 'br') {
                this.message.push([element,this.childer])
                // 处理换行符
                if (this.sendType == undefined) {
                    this.sendType = 'text'
                }else if (this.sendType === 'image') {
                    this.sendType = 'markdown'
                }
            }
            else if (type === 'p') {
                this.message.push([element,this.childer])
                // 处理段落
                if (this.sendType == undefined) {
                    this.sendType = 'text'
                } else if (this.sendType === 'image') {
                    this.sendType = 'markdown'
                }
                await this.render(children)
            }
            else if (type === 'a') {
                this.message.push([element,this.childer])
                // 处理链接
                if (this.sendType == undefined) {
                    this.sendType = 'text'
                } else if (this.sendType === 'image') {
                    this.sendType = 'markdown'
                }
            }
            else if (type === 'file') {
                await this.flush()
                if (this.sendType == undefined) {
                    this.sendType = 'file'
                }
                this.message.push([element,this.childer])
                await this.flush()
            }
            else if (type === 'video') {
                await this.flush()
                if (this.sendType == undefined) {
                    this.sendType = 'video'
                }
                this.message.push([element,this.childer])
                // 处理视频
                /*
                try {
                    // 尝试上传视频获取videoKey

                    const videokey = await this.bot.internal.uploadVideo(attrs.src)
                    this.payload.content.videoKey = videokey
                    this.payload.contentType = 'video'
                    await this.flush()
                } catch (error) {
                    this.bot.logger.error(`视频上传失败: ${error}`)
                    // 降级为文本处理
                    this.payload.content.text += `[视频上传失败]`
                    this.payload.contentType = 'text'
                }*/

            }
                
            else if (type === 'yunhu:markdown') {
                if (this.message.length > 0) {
                    await this.flush()
                }
                this.message.push([element,this.childer])
                this.payload.contentType = 'markdown'
                await this.flush()
            }
            else if (type === 'yunhu:html') {
                if (this.message.length > 0) {
                    await this.flush()
                }
                this.message.push([element,this.childer])
                this.payload.contentType = 'html'
                await this.flush()
            }
            else if (type === 'message') {
                if (this.message.length > 0) {
                    await this.flush()
                }
                await this.render(children)
                await this.flush()
            }
            else if (type === 'quote'){
                if (this.childer != undefined) {
                    this.memrize.push(this.childer)
                }
                this.childer = () =>{
                    this.payload.parentId = attrs.id
                
                }
                await this.childer()
                await this.render(children)
                if (this.memrize.length === 0) {
                    this.childer = undefined
                } else {
                    this.childer = this.memrize.pop()
                }
            }
            else if (type === 'h1' || type === 'h2' || type === 'h3'
                 || type === 'h4' || type === 'h5' || type === 'h6'
                  || type === 'strong' || type === 'b' || type === 'i'
                  || type === 's' || type === 'code' 
            ) {
                if (this.sendType == undefined) {
                    this.sendType = 'markdown'
                } else if (this.sendType === 'image') {
                    this.sendType = 'markdown'
                } else if (this.sendType === 'text') {
                    this.sendType = 'markdown'
                } 
                this.message.push([element,this.childer])


            }
            else if (type === 'u' || type === 'sup' || type === 'sub' 
                
            ){
                this.sendType = 'html'
            }
            else {
                this.bot.logger.warn(`未知消息元素类型: ${type}`)
                await this.render(children)
            }
 
        } catch (error) {
            // this.bot.logger.error(`处理消息元素失败: ${error? error?.message : '未知错误'}`)
            // 出错时尝试降级处理
            if (this.sendType == undefined) {
                this.sendType = 'text'
            } else if (this.sendType === 'image') {
                this.sendType = 'markdown'
            }
            const _element: Dict = {'type':'text', 'attrs':{'content': `[元素处理失败]`} }
            this.message.push(_element)

        }

    }
}