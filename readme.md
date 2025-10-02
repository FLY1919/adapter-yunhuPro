# koishi-plugin-adapter-yunhuPro
# 适用于云湖koishi适配器
> **📢 项目来源声明**  
> 本项目基于 **[@WindyPear](https://github.com/WindyPear-Team/koishi-plugin-adapter-yunhu) 2次开发**。    
> ~~原作者没时间~~,我也没时间（
> 我是高中生（悲
本文档介绍了用于 Koishi 框架的云湖 (Yunhu) 官方适配器。此适配器允许您的 Koishi 机器人接收和发送云湖平台的消息。
[![Stylelint](https://img.shields.io/badge/stylelint-enabled-brightgreen.svg)]
(https://stylelint.io/)/

[![npm version](https://img.shields.io/npm/v/koishi-plugin-adapter-yunhupro)]/
(https://badge.fury.io/js/koishi-plugin-adapter-yunhupro)/

[![npm downloads](https://img.shields.io/npm/koishi-plugin-adapter-yunhupro)]
(https://github.com/username/project/README)

## 联系方式
| 平台 | ID | 状态 |
|------|---------|------|
| QQ   |3568242357|可能回复不及时|
| 云湖 |5546917 | 推荐 |
| 云湖(group) | 979377259| 推荐| 

## 特性

-   **基础通信**: 实现了与云湖平台的基础消息接收与发送。
-   **特有元素支持**: 支持云湖平台特有的消息元素，例如 Markdown 和 HTML 渲染。
-   **反向代理**: 通过反向代理获取图像资源，确保图片消息的正常发送。
–   **注意**: 你必须注册空白 和斜杠，由于云湖神秘特性（）
## 安装

您可以通过 npm 或 yarn 安装此适配器：



## 基本配置
```typescript
export const Config: Schema<Config> = Schema.object({
    token: Schema.string()
      .required()
      .description('机器人 Token'),
    
    endpoint: Schema.string()
      .default(YUNHU_ENDPOINT)
      .description('云湖 API 地址，默认无需修改'),
    endpointweb: Schema.string()
      .default(YUNHU_ENDPOINT_WEB)
      .description('云湖 API 地址，默认无需修改'),
    
    path: Schema.string()
      .default('/yunhu')
      .description('Webhook 接收路径'),
    
    cat: Schema.string()
      .default('猫娘')
      .description('她很可爱，你可以摸摸'),
    _host: Schema.string()
      .default('http://127.0.0.1:5140/pic')
      .description('图片反代'),
    path_host: Schema.string()
      .default('/pic')
      .description('图片反代'),
     
    ffmpegPath: Schema.string()
      .description('FFmpeg 可执行文件路径')
      .default('')
      .role('path')
  })
```

## 已实现的功能

-   [x] 基础消息接收与发送
-   [x] 用户上下线事件 (`session` 标准事件)
-   [x] 特有消息元素支持：
    -   [x] `<yunhu:markdown>`
-   [x] 通过反向代理处理图片资源
-   [x] **控制台设置指令** (`yh` 指令)

## 暂未实现的接口/功能

以下云湖平台特定的功能当前版本尚未支持：

-   **设置看板 (Set Kanban)** 相关接口
-   **快捷菜单** (`bot.shortcut.menu`)
-   **内联按钮** (`button.report.inline`)
-   **特定关注事件**:
    -   `bot.followed` (机器人被用户关注)
    -   `bot.unfollowed` (机器人被用户取消关注)
**如果你有能力欢迎pr，可能回复不及时**
## 注意事项

1.  **图像处理**: 所有云湖用户头像获取均通过反向代理进行，无需直接处理原始 URL。

## 获取帮助

如果您在使用过程中遇到问题，请：
1.  首先检查此文档和适配器的配置说明。
2.  查看 Koishi 官方文档：https://koishi.chat/
3.  到该适配器的 GitHub 仓库提交 Issue。

---

**注意**: 某些具体细节（如确切的配置项、元素标签的完整语法）可能需要参考适配器自身的详细文档或源码。


