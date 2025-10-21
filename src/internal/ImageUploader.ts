import { HTTP, Dict, Logger } from 'koishi';
import { FormData, File } from 'formdata-node';
import { fileTypeFromBuffer } from 'file-type';
import { createHash } from 'crypto';
import { BaseUploader } from './BaseUploader';
import { resolveResource, getExtension, updateFileExtension } from '../utils/utils';
import * as path from 'path';
import * as fs from 'fs';
import { URL } from 'url';
import axios from 'axios';

const logger = new Logger('yunhu-uploader');
const IMAGE_URL = "https://chat-img.jwznb.com/";

// 图片上传器
export class ImageUploader extends BaseUploader
{
    constructor(http: HTTP, token: string, apiendpoint: string, ffmpeg: any)
    {
        super(http, token, apiendpoint, 'image', ffmpeg);
    }

    async upload(image: string | Buffer | any): Promise<string>
    {
        return this.processUpload(image);
    }

    async uploadGetUrl(image: string | Buffer | any): Promise<Dict>
    {
        return this.processUpload(image, true);
    }

    // 私有方法，处理上传逻辑
    private async processUpload(image: string | Buffer | any, returnUrl: boolean = false): Promise<any>
    {
        logger.info(`开始处理图片上传，传入参数类型: ${typeof image}`);

        if (Buffer.isBuffer(image))
        {
            logger.info('传入参数是 Buffer 类型');
        } else if (typeof image === 'string')
        {
            logger.info(`传入参数是字符串类型，内容: ${image.substring(0, 100)}...`);

            if (image.startsWith('data:image/'))
            {
                logger.info('检测到 base64 编码的图片数据');
            } else if (image.startsWith('http://') || image.startsWith('https://'))
            {
                logger.info('检测到 HTTP/HTTPS URL');
            } else if (image.startsWith('file://'))
            {
                logger.info('检测到 file:// URL');
            } else if (this.isFilePath(image))
            {
                logger.info('检测到文件路径');
            }
        } else
        {
            logger.info(`传入参数是其他类型: ${image?.constructor?.name || '未知类型'}`);
        }

        const form = new FormData();

        // 解析资源
        const { buffer, fileName, mimeType } = await this.resolveImageResource(image);

        // 记录检测到的MIME类型
        logger.info(`检测到的MIME类型: ${mimeType}`);

        // 验证图片格式
        const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'image/bmp', 'image/tiff', 'image/svg+xml', 'image/x-icon', "image/jpg"];

        if (!validImageTypes.includes(mimeType))
        {
            logger.error(`不支持的图片格式: ${mimeType}`);
            throw new Error(`不支持的图片格式: ${mimeType}`);
        }

        // 记录图片信息
        const originalSize = buffer.length;
        const originalMB = (originalSize / (1024 * 1024)).toFixed(2);
        logger.info(`图片: 类型=${mimeType}, 大小=${originalMB}MB`);

        // 大小检查
        if (originalSize > this.MAX_SIZE)
        {
            const sizeMB = (originalSize / (1024 * 1024)).toFixed(2);
            logger.error(`图片大小${sizeMB}MB超过10MB限制，无法上传`);
            throw new Error(`图片大小${sizeMB}MB超过10MB限制，无法上传`);
        }

        // 更新文件扩展名
        const finalFileName = updateFileExtension(fileName, mimeType);
        logger.info(`最终文件名: ${finalFileName}`);

        // 创建文件对象并上传
        const file = new File([buffer], finalFileName, { type: mimeType });
        form.append('image', file);

        if (returnUrl)
        {
            // 计算图片哈希用于生成URL
            const hash = createHash('md5');
            hash.update(buffer);
            const imageHash = hash.digest('hex');
            const extension = getExtension(mimeType);
            logger.info(`图片哈希: ${imageHash}, 扩展名: ${extension}`);

            const imagekey = await this.sendFormData(form);
            const imageUrl = `${IMAGE_URL}${imageHash}.${extension}`;
            logger.info(`生成的图片URL: ${imageUrl}`);

            return {
                imageurl: imageUrl,
                imagekey
            };
        } else
        {
            return this.sendFormData(form);
        }
    }

    // 解析图片资源
    private async resolveImageResource(image: string | Buffer | any): Promise<{ buffer: Buffer, fileName: string, mimeType: string; }>
    {
        logger.info(`开始解析图片资源，类型: ${typeof image}`);

        // 如果是Buffer直接返回
        if (Buffer.isBuffer(image))
        {
            logger.info('资源是 Buffer 类型，开始检测MIME类型');
            // 验证Buffer内容是否为有效图片
            const mimeType = await this.detectMimeType(image);
            logger.info(`Buffer 检测到的MIME类型: ${mimeType}`);

            if (!mimeType.startsWith('image/'))
            {
                logger.error('提供的Buffer不是有效的图片数据');
                throw new Error('提供的Buffer不是有效的图片数据');
            }

            return {
                buffer: image,
                fileName: `image.${getExtension(mimeType)}`,
                mimeType
            };
        }

        // 如果是字符串
        if (typeof image === 'string')
        {
            logger.info(`资源是字符串类型: ${image.substring(0, 50)}...`);

            // 检查是否是base64编码
            if (image.startsWith('data:image/'))
            {
                logger.info('检测到 base64 编码的图片数据');
                const matches = image.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
                if (matches && matches.length === 3)
                {
                    const buffer = Buffer.from(matches[2], 'base64');
                    logger.info(`Base64 数据解码成功，长度: ${buffer.length} 字节`);

                    // 验证base64数据是否为有效图片
                    const mimeType = await this.detectMimeType(buffer);
                    logger.info(`Base64 数据检测到的MIME类型: ${mimeType}`);

                    if (!mimeType.startsWith('image/'))
                    {
                        logger.error('提供的base64数据不是有效的图片');
                        throw new Error('提供的base64数据不是有效的图片');
                    }

                    return {
                        buffer,
                        fileName: `image.${matches[1]}`,
                        mimeType: `image/${matches[1]}`
                    };
                }
            }

            // 检查是否是HTTP/HTTPS URL
            if (image.startsWith('http://') || image.startsWith('https://'))
            {
                logger.info('检测到 HTTP/HTTPS URL，开始下载图片');
                try
                {
                    // 使用HTTP客户端下载图片
                    const response = await axios.get(image, {
                        responseType: 'arraybuffer',
                        timeout: 30000 // 30秒超时
                    });

                    const buffer = Buffer.from(response.data);
                    logger.info(`URL 下载成功，长度: ${buffer.length} 字节`);

                    // 验证下载的数据是否为有效图片
                    const mimeType = await this.detectMimeType(buffer);
                    logger.info(`URL 下载内容检测到的MIME类型: ${mimeType}`);

                    if (!mimeType.startsWith('image/'))
                    {
                        logger.error('从URL下载的内容不是有效的图片');
                        throw new Error('从URL下载的内容不是有效的图片');
                    }

                    // 尝试从URL中提取文件名
                    let fileName = 'image';
                    try
                    {
                        const url = new URL(image);
                        const pathname = url.pathname;
                        if (pathname)
                        {
                            const ext = path.extname(pathname);
                            fileName = path.basename(pathname, ext) || 'image';
                        }
                    } catch (e)
                    {
                        logger.warn('URL解析失败，使用默认文件名');
                    }

                    return {
                        buffer,
                        fileName: `${fileName}.${getExtension(mimeType)}`,
                        mimeType
                    };
                } catch (error)
                {
                    logger.error(`无法下载或验证URL图片: ${error.message}`);
                    throw new Error(`无法下载或验证URL图片: ${error.message}`);
                }
            }

            // 检查是否是文件路径
            if (image.startsWith('file://') || this.isFilePath(image))
            {
                logger.info('检测到文件路径，开始读取文件');
                // 处理file://协议
                let filePath = image;
                if (image.startsWith('file://'))
                {
                    try
                    {
                        // 使用URL类解析file://路径，兼容所有操作系统
                        const urlObj = new URL(image);
                        filePath = urlObj.pathname;

                        // 在Windows上，URL路径会以/开头，如/C:/path/to/file
                        // 需要移除开头的斜杠
                        if (process.platform === 'win32' && filePath.match(/^\/[a-zA-Z]:\//))
                        {
                            filePath = filePath.substring(1);
                        }
                    } catch (e)
                    {
                        logger.warn('file:// URL解析失败，回退到简单处理');
                        filePath = image.substring(7);
                    }
                }

                // 使用path模块解析路径，确保跨平台兼容性
                const normalizedPath = path.normalize(filePath);
                logger.info(`规范化后的文件路径: ${normalizedPath}`);

                // 检查文件是否存在
                if (!fs.existsSync(normalizedPath))
                {
                    logger.error(`文件不存在: ${normalizedPath}`);
                    throw new Error(`文件不存在: ${normalizedPath}`);
                }

                // 读取文件
                const buffer = await fs.promises.readFile(normalizedPath);
                logger.info(`文件读取成功，长度: ${buffer.length} 字节`);

                // 验证文件内容是否为有效图片
                const mimeType = await this.detectMimeType(buffer);
                logger.info(`文件内容检测到的MIME类型: ${mimeType}`);

                if (!mimeType.startsWith('image/'))
                {
                    logger.error(`文件不是有效的图片: ${normalizedPath}`);
                    throw new Error(`文件不是有效的图片: ${normalizedPath}`);
                }

                return {
                    buffer,
                    fileName: path.basename(normalizedPath),
                    mimeType
                };
            }

            logger.warn('无法识别的字符串格式，尝试使用默认解析方法');
        }

        logger.info('使用默认的 resolveResource 方法解析资源');
        // 如果是其他类型，使用原来的resolveResource方法
        const result = await resolveResource(
            image,
            'image.png',
            'image/png',
            this.http
        );

        // 验证resolveResource返回的内容是否为有效图片
        const mimeType = await this.detectMimeType(result.buffer);
        logger.info(`resolveResource 检测到的MIME类型: ${mimeType}`);

        if (!mimeType.startsWith('image/'))
        {
            logger.error('解析的资源不是有效的图片');
            throw new Error('解析的资源不是有效的图片');
        }

        return {
            buffer: result.buffer,
            fileName: result.fileName,
            mimeType
        };
    }

    // 检测Buffer的MIME类型
    private async detectMimeType(buffer: Buffer): Promise<string>
    {
        logger.info('开始检测 Buffer 的 MIME 类型');

        // 首先检查文件签名（magic numbers）
        const detectedType = this.detectMimeTypeBySignature(buffer);
        if (detectedType)
        {
            logger.info(`通过文件签名检测到的 MIME 类型: ${detectedType}`);
            return detectedType;
        }

        // 如果文件签名检测失败，使用 file-type 库
        logger.info('文件签名检测失败，尝试使用 file-type 库');
        const fileType = await fileTypeFromBuffer(buffer);

        if (fileType)
        {
            logger.info(`file-type 库检测到的 MIME 类型: ${fileType.mime}`);
            return fileType.mime;
        }

        logger.warn('file-type 库也无法检测到 MIME 类型');

        // 如果 file-type 也检测失败，尝试通过常见文件扩展名推断
        const extensionBasedType = this.guessMimeTypeByContent(buffer);
        if (extensionBasedType)
        {
            logger.info(`通过内容推断的 MIME 类型: ${extensionBasedType}`);
            return extensionBasedType;
        }

        logger.warn('所有检测方法都失败，返回默认类型');
        return 'application/octet-stream';
    }

    // 通过文件签名检测 MIME 类型
    private detectMimeTypeBySignature(buffer: Buffer): string | null
    {
        if (buffer.length < 4)
        {
            return null;
        }

        // PNG 文件签名
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47)
        {
            return 'image/png';
        }

        // JPEG 文件签名
        if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF)
        {
            return 'image/jpeg';
        }

        // GIF 文件签名
        if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46)
        {
            return 'image/gif';
        }

        // WebP 文件签名
        if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 &&
            buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 &&
            buffer[10] === 0x42 && buffer[11] === 0x50)
        {
            return 'image/webp';
        }

        // BMP 文件签名
        if (buffer[0] === 0x42 && buffer[1] === 0x4D)
        {
            return 'image/bmp';
        }

        return null;
    }

    // 通过内容特征猜测 MIME 类型
    private guessMimeTypeByContent(buffer: Buffer): string | null
    {
        // 如果 buffer 包含 PNG 特征字符串
        const pngString = buffer.toString('ascii', 1, 4);
        if (pngString === 'PNG')
        {
            return 'image/png';
        }

        // 如果 buffer 包含 JFIF 或 Exif（JPEG 特征）
        if (buffer.length > 20)
        {
            const jpegString = buffer.toString('ascii', 6, 10);
            if (jpegString === 'JFIF' || jpegString === 'Exif')
            {
                return 'image/jpeg';
            }
        }

        // 检查是否是 SVG（XML 格式）
        if (buffer.length > 100)
        {
            const startContent = buffer.toString('utf8', 0, 100);
            if (startContent.includes('<svg') || startContent.includes('<?xml'))
            {
                return 'image/svg+xml';
            }
        }

        return null;
    }

    // 检查字符串是否可能是文件路径
    private isFilePath(str: string): boolean
    {
        logger.info(`检查字符串是否为文件路径: ${str}`);

        // 检查是否包含路径分隔符
        if (str.includes(path.sep))
        {
            logger.info('字符串包含路径分隔符，可能是文件路径');
            return true;
        }

        // 检查Windows风格的路径 (C:\ or C:/)
        if (/^[a-zA-Z]:[\\/]/.test(str))
        {
            logger.info('字符串是 Windows 风格路径');
            return true;
        }

        // 检查Unix风格的绝对路径
        if (str.startsWith('/') || str.startsWith('~'))
        {
            logger.info('字符串是 Unix 风格绝对路径');
            return true;
        }

        // 检查相对路径
        if (str.startsWith('./') || str.startsWith('../'))
        {
            logger.info('字符串是相对路径');
            return true;
        }

        logger.info('字符串不是文件路径');
        return false;
    }
}