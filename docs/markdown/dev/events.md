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

## 消息事件

| 云湖事件类型             | Koishi 事件 | 触发时机     |
| :----------------------- | :---------- | :----------- |
| `message.receive.normal` | `message`   | 收到普通消息 |

## 成员变动事件

| 云湖事件类型     | Koishi 事件            | 触发时机               |
| :--------------- | :--------------------- | :--------------------- |
| `bot.followed`   | `friend-added`         | 用户添加机器人到通讯录 |
| `bot.unfollowed` | `friend-deleted`       | 用户从通讯录删除机器人 |
| `group.join`     | `guild-member-added`   | 新成员加入群组         |
| `group.leave`    | `guild-member-removed` | 成员退出群组           |

:::tip
`friend-added` 、`friend-deleted`事件不存在于 [Satori 官方文档](https://koishi.chat/zh-CN/api/resources/user.html#%E4%BA%8B%E4%BB%B6) 中。

不过你可以在这里找到他们的实际应用 -> https://github.com/satorijs/satori/blob/main/adapters/qq/src/utils.ts#L186
:::

## 群组角色变动事件

| 云湖事件类型             | Koishi 事件          | 触发时机             |
| :----------------------- | :------------------- | :------------------- |
| `message.receive.normal` | `guild-role-updated` | 群成员被设置为管理员 |

## 交互事件

| 云湖事件类型                  | Koishi 事件                      | 触发时机                   |
| :---------------------------- | :------------------------------- | :------------------------- |
| `message.receive.instruction` | `message`、`interaction/command` | 用户触发了机器人的斜线指令 |
| `bot.shortcut.menu`           | `interaction/button`             | 用户点击了机器人的快捷菜单 |
| `button.report.inline`        | `interaction/button`             | 用户点击了消息中的内联按钮 |

:::warning
`message.receive.instruction` 是触发**斜线指令**时的特有事件。

在koishi中本应下发为单独的`interaction/command`事件。

但是为了兼容性（比如大部分插件不会单独监听`interaction/command`事件），本适配器会同时下发两个事件（`message`、`interaction/command`）。

如果插件有特殊需求，就单独处理interaction/command事件；没有特殊需求，就直接当普通输入处理。
:::