# 事件 (Events)

`adapter-yunhupro` 负责接收来自云湖平台的 Webhook 事件。

本页将详细说明云湖事件与 Koishi 事件之间的对应关系。

您可以在插件中通过 `ctx.on('EVENT_NAME', (session) => { ... })` 来监听这些事件。

例如：
```ts
  //  监听按钮事件
  ctx.on('interaction/button', async (session) => {
    ctx.logger.info(session)
  })
```

## 消息事件 (Message Events)

| 云湖事件类型                  | Koishi 事件 | 触发时机                                |
| :---------------------------- | :---------- | :-------------------------------------- |
| `message.receive.normal`      | `message`   | 收到普通消息（私聊或群聊）              |
| `message.receive.instruction` | `message`   | 收到指令消息（通常由斜杠指令 `/` 触发） |

## 成员变动事件 (Guild Member Events)

| 云湖事件类型      | Koishi 事件            | 触发时机                     |
| :---------------- | :--------------------- | :--------------------------- |
| `bot.followed`    | `friend-added`         | 机器人被用户关注（添加机器人） |
| `bot.unfollowed`  | `friend-deleted`       | 用户取消关注机器人（删除机器人） |
| `group.join`      | `guild-member-added`   | 新成员加入群组               |
| `group.leave`     | `guild-member-removed` | 成员退出群组                 |

## 交互事件 (Interaction Events)

| 云湖事件类型           | Koishi 事件          | 触发时机                   |
| :--------------------- | :------------------- | :------------------------- |
| `bot.shortcut.menu`    | `interaction/button` | 用户点击了机器人的快捷菜单 |
| `button.report.inline` | `interaction/button` | 用户点击了消息中的内联按钮 |

