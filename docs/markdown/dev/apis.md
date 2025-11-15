# APIs

## 获取 Bot 实例

以下所有 bot 均通过这样获取：

```typescript
//  import { Universal, Bot } from "koishi";
const bot = (Object.values(ctx.bots) as Bot[]).find(b => b.selfId === "botId" || b.user?.id === "botId");
if (!bot || bot.status !== Universal.Status.ONLINE) {
  ctx.logger.error(`机器人离线或未找到。`);
  return;
}
if (bot == null) return;

// 在这里继续使用 bot.方法
```

## Bot 方法

### sendMessage()

发送消息到指定的频道。这是 Koishi 的标准方法，适配器实现了其具体逻辑。

```typescript
bot.sendMessage(channelId: string, content: Fragment, guildId?: string, options?: SendOptions): Promise<string[]>
```

*   **`channelId`**: 频道 ID。对于私聊，格式为 `private:USER_ID`；对于群聊，格式为 `group:GROUP_ID`。
*   **`content`**: 要发送的消息内容，可以是字符串或使用 `h()` 创建的消息元素。
*   **`guildId`**: (可选) 群组 ID。
*   **`options`**: (可选) 发送选项。
*   **返回值**: `Promise<string[]>`，包含已发送消息的 ID 列表。

### deleteMessage()

撤回（删除）一条已发送的消息。

```typescript
bot.deleteMessage(channelId: string, messageId: string): Promise<void>
```

*   **`channelId`**: 消息所在的频道 ID。
*   **`messageId`**: 要删除的消息 ID。
*   **返回值**: `Promise<void>`。

### editMessage()

编辑已发送的消息。

```typescript
bot.editMessage(channelId: string, messageId: string, content: Fragment): Promise<void>
```

*   **`channelId`**: 消息所在的频道 ID。
*   **`messageId`**: 要编辑的消息 ID。
*   **`content`**: 新的消息内容，可以是字符串或使用 `h()` 创建的消息元素。
*   **返回值**: `Promise<void>`。

### getMessage()

获取单条消息的详细信息。

```typescript
bot.getMessage(channelId: string, messageId: string): Promise<Universal.Message>
```

*   **`channelId`**: 消息所在的频道 ID。
*   **`messageId`**: 要获取的消息 ID。
*   **返回值**: `Promise<Universal.Message>`，一个符合 Koishi 规范的消息对象。

### getUser()

获取用户的详细信息。

```typescript
bot.getUser(userId: string): Promise<Universal.User>
```

*   **`userId`**: 要查询的用户 ID。
*   **返回值**: `Promise<Universal.User>`，一个符合 Koishi 规范的用户对象。

### getGuild()

获取群组（服务器）的详细信息。

```typescript
bot.getGuild(guildId: string): Promise<Universal.Guild>
```

*   **`guildId`**: 要查询的群组 ID。
*   **返回值**: `Promise<Universal.Guild>`，一个符合 Koishi 规范的群组对象。

### getGuildMember()

获取群组成员的详细信息。

```typescript
bot.getGuildMember(guildId: string, userId: string): Promise<Universal.GuildMember>
```

*   **`guildId`**: 成员所在的群组 ID。
*   **`userId`**: 要查询的成员的用户 ID。
*   **返回值**: `Promise<Universal.GuildMember>`，一个符合 Koishi 规范的群组成员对象。

### getChannel()

获取频道（子频道）的详细信息。在云湖中，一个群组就是一个频道。

```typescript
bot.getChannel(channelId: string, guildId?: string): Promise<Universal.Channel>
```

*   **`channelId`**: 要查询的频道 ID。
*   **`guildId`**: (可选) 频道所在的群组 ID。
*   **返回值**: `Promise<Universal.Channel>`，一个符合 Koishi 规范的频道对象。

### start()

启动机人。

```typescript
bot.start(): Promise<void>
```

*   **返回值**: `Promise<void>`。

### stop()

停止机器人。

```typescript
bot.stop(): Promise<void>
```

*   **返回值**: `Promise<void>`。

### setDisposing()

设置机器人状态。

```typescript
bot.setDisposing(disposing: boolean): void
```

*   **`disposing`**: 是否正在处理中。
*   **返回值**: `void`。

### logInfo()

记录信息日志（仅在配置开启时记录）。

```typescript
bot.logInfo(...args: any[]): void
```

*   **`args`**: 日志参数。
*   **返回值**: `void`。

### loggerInfo()

记录信息日志。

```typescript
bot.loggerInfo(...args: any[]): void
```

*   **`args`**: 日志参数。
*   **返回值**: `void`。

### loggerError()

记录错误日志。

```typescript
bot.loggerError(...args: any[]): void
```

*   **`args`**: 日志参数。
*   **返回值**: `void`。

## Bot.Internal 方法

### getYunhuMessageList()

获取云湖原始的消息列表。

```typescript
bot.internal.getYunhuMessageList(channelId: string, messageId: string, options?: { before?: number; after?: number }): Promise<any>
```

*   **`channelId`**: 消息所在的频道 ID。
*   **`messageId`**: 作为基准点的消息 ID。
*   **`options`**: 可选参数。
    *   `before`: 获取 `messageId` 之前的消息数量。
    *   `after`: 获取 `messageId` 之后的消息数量。
*   **返回值**: `Promise<any>`，云湖 API 返回的原始消息列表数据。

### uploadImage()

上传一张图片，仅返回URL。

```typescript
bot.internal.uploadImage(image: string | Buffer): Promise<string>
```

*   **`image`**: 图片资源，可以是图片的 URL (字符串) 或 Buffer。
*   **返回值**: `Promise<string>`，上传成功后返回的图片URL。

### uploadImageKey()

上传一张图片，获取图片的URL和key。

:::tip
`key` 是用于发送云湖消息的重要参数，用于适配器发送消息使用。

一般情况下，其他插件上传文件时 无需获取key值，仅获取URL即可。

**即：一般调用 `uploadImage` 即可**

下面几个API接口也是同样的设计，不再赘述。
:::

```typescript
bot.internal.uploadImageKey(image: string | Buffer): Promise<{ url: string; key: string; }>
```

*   **`image`**: 图片资源，可以是图片的 URL (字符串) 或 Buffer。
*   **返回值**: `Promise<{ url: string; key: string; }>`，上传成功后返回的图片URL和key。

### uploadVideo()

上传一个视频，仅返回URL。

```typescript
bot.internal.uploadVideo(video: string | Buffer): Promise<string>
```

*   **`video`**: 视频资源，可以是视频的 URL (字符串) 或 Buffer。
*   **返回值**: `Promise<string>`，上传成功后返回的视频URL。

### uploadVideoKey()

上传一个视频，获取视频的URL和key。

```typescript
bot.internal.uploadVideoKey(video: string | Buffer): Promise<{ url: string; key: string; }>
```

*   **`video`**: 视频资源，可以是视频的 URL (字符串) 或 Buffer。
*   **返回值**: `Promise<{ url: string; key: string; }>`，上传成功后返回的视频URL和key。

### uploadAudio()

上传一个音频，仅返回URL。

```typescript
bot.internal.uploadAudio(audio: string | Buffer): Promise<string>
```

*   **`audio`**: 音频资源，可以是音频的 URL (字符串) 或 Buffer。
*   **返回值**: `Promise<string>`，上传成功后返回的音频URL。

### uploadAudioKey()

上传一个音频，获取音频的URL和key。

```typescript
bot.internal.uploadAudioKey(audio: string | Buffer): Promise<{ url: string; key: string; }>
```

*   **`audio`**: 音频资源，可以是音频的 URL (字符串) 或 Buffer。
*   **返回值**: `Promise<{ url: string; key: string; }>`，上传成功后返回的音频URL和key。

### uploadFile()

上传一个文件，仅返回URL。

```typescript
bot.internal.uploadFile(file: string | Buffer): Promise<string>
```

*   **`file`**: 文件资源，可以是文件的 URL (字符串) 或 Buffer。
*   **返回值**: `Promise<string>`，上传成功后返回的文件URL。

### uploadFileKey()

上传一个文件，获取文件的URL和key。

```typescript
bot.internal.uploadFileKey(file: string | Buffer): Promise<{ url: string; key: string; }>
```

*   **`file`**: 文件资源，可以是文件的 URL (字符串) 或 Buffer。
*   **返回值**: `Promise<{ url: string; key: string; }>`，上传成功后返回的文件URL和key。

### getBotInfo()

获取机器人的详细信息。

```typescript
bot.internal.getBotInfo(botId: string): Promise<any>
```

*   **`botId`**: 要查询的机器人 ID。
*   **返回值**: `Promise<any>`，API 返回的机器人信息数据。

### setBoard()

为指定用户设置看板（个人看板）。

```typescript
bot.internal.setBoard(chatId: string, contentType: 'text' | 'markdown' | 'html', content: string, options?: { memberId?: string; expireTime?: number }): Promise<any>
```

*   **`chatId`**: 对话 ID (私聊为用户 ID，群聊为群组 ID)。
*   **`contentType`**: 内容类型。
*   **`content`**: 看板内容。
*   **`options`**:
    *   `memberId`: 要设置看板的用户 ID。
    *   `expireTime`: (可选) 过期时间戳 (秒)。
*   **返回值**: `Promise<any>`，API 返回的原始数据。

### setAllBoard()

设置全局看板（对群内所有人生效）。

```typescript
bot.internal.setAllBoard(chatId: string, contentType: 'text' | 'markdown' | 'html', content: string, options?: { expireTime?: number }): Promise<any>
```

*   **`chatId`**: 群组 ID。
*   **`contentType`**: 内容类型。
*   **`content`**: 看板内容。
*   **`options`**:
    *   `expireTime`: (可选) 过期时间戳 (秒)。
*   **返回值**: `Promise<any>`，API 返回的原始数据。

### dismissBoard()

取消指定用户的看板。

```typescript
bot.internal.dismissBoard(chatId: string, chatType: 'user' | 'group', memberId?: string): Promise<any>
```

*   **`chatId`**: 对话 ID。
*   **`chatType`**: 对话类型。
*   **`memberId`**: (可选) 要取消看板的用户 ID。如果 `chatType` 为 `user`，则此项必填。
*   **返回值**: `Promise<any>`，API 返回的原始数据。

### dismissAllBoard()

取消全局看板。

```typescript
bot.internal.dismissAllBoard(): Promise<any>
```

*   **返回值**: `Promise<any>`，API 返回的原始数据。