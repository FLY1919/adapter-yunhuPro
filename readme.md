# koishi-plugin-adapter-yunhupro

## 适用于 Koishi 框架的云湖 (Yunhu) 适配器

> **📢 项目来源声明**
> 
> 本项目基于 **[@WindyPear](https://github.com/WindyPear-Team/koishi-plugin-adapter-yunhu) 的 `koishi-plugin-adapter-yunhu` 进行二次开发与维护**。
>
> **开发者寄语：**
> 原作者没时间维护，我也没时间（我是高中生，悲）。但仍会尽力维护，欢迎大家使用和反馈！

---

云湖 (Yunhu) 适配器

此适配器可以让 Koishi 机器人接收和发送云湖平台的消息。

[![npm version](https://img.shields.io/npm/v/koishi-plugin-adapter-yunhupro)](https://www.npmjs.com/package/koishi-plugin-adapter-yunhupro)
[![npm downloads](https://img.shields.io/npm/dt/koishi-plugin-adapter-yunhupro)](https://www.npmjs.com/package/koishi-plugin-adapter-yunhupro)

## 联系方式

如果您在使用过程中遇到问题或有任何建议，可以通过以下方式联系我：

| 平台      | ID         | 状态           |
| --------- | ---------- | -------------- |
| QQ        | 3568242357 | 可能回复不及时 |
| 云湖      | 5546917    | 推荐           |
| 云湖 (群) | 979377259  | 推荐           |


## 特性

-   **基础通信**: 实现了与云湖平台的基础消息接收与发送。
-   **特有元素支持**: 支持云湖平台特有的消息元素，例如 Markdown 和 HTML 渲染。
-   **反向代理**: 通过反向代理获取图像资源，确保图片消息的正常发送。
-   **注意**: 你必须注册空白 和斜杠，由于云湖神秘特性（）

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


---

TODO

- 优化配置项和说明，减少固定参数，尽可能全部配置项化
- status输出有问题，待检测，可能是回复解析的问题
- 完善ffmpeg压缩，或者直接移除。