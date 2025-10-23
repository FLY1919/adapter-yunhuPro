# 事件 (Events)

`adapter-yunhupro` 负责接收来自云湖平台的 Webhook 事件。

本页将详细说明云湖事件与 Koishi 事件之间的对应关系。

您可以在插件中通过 `ctx.on('EVENT_NAME', (session) => { ... })` 来监听这些事件。

## 消息事件 (Message Events)

| 云湖事件类型                  | Koishi 事件 | 触发时机                                | Session 字段               |
| :---------------------------- | :---------- | :-------------------------------------- | :------------------------- |
| `message.receive.normal`      | `message`   | 收到普通消息（私聊或群聊）              | `session.type = 'message'` |
| `message.receive.instruction` | `message`   | 收到指令消息（通常由斜杠指令 `/` 触发） | `session.type = 'message'` |

## 成员变动事件 (Guild Member Events)

| 云湖事件类型           | Koishi 事件            | 触发时机                     | Session 字段                                                                                     |
| :--------------------- | :--------------------- | :--------------------------- | :----------------------------------------------------------------------------------------------- |
| `bot.followed`         | `friend-added`         | 机器人被用户关注（添加好友） | `session.userId`                                                                                 |
| `group.member.joined`  | `guild-member-added`   | 新成员通过链接或搜索加入群组 | `session.userId`, `session.guildId`, `session.operatorId` (通常是自己)                           |
| `group.member.invited` | `guild-member-added`   | 成员被邀请加入群组           | `session.userId`, `session.guildId`, `session.operatorId` (邀请者), `session.subtype = 'invite'` |
| `group.member.leaved`  | `guild-member-removed` | 成员主动退出群组             | `session.userId`, `session.guildId`, `session.operatorId` (自己), `session.subtype = 'leave'`    |
| `group.member.kicked`  | `guild-member-removed` | 成员被管理员踢出群组         | `session.userId`, `session.guildId`, `session.operatorId` (操作者), `session.subtype = 'kick'`   |

## 群组变动事件 (Guild Events)

| 云湖事件类型      | Koishi 事件     | 触发时机   | Session 字段                                     |
| :---------------- | :-------------- | :--------- | :----------------------------------------------- |
| `group.disbanded` | `guild-deleted` | 群组被解散 | `session.guildId`, `session.operatorId` (操作者) |

## 交互事件 (Interaction Events)

| 云湖事件类型           | Koishi 事件          | 触发时机                   | Session 字段                                                                                   |
| :--------------------- | :------------------- | :------------------------- | :--------------------------------------------------------------------------------------------- |
| `bot.shortcut.menu`    | `interaction/button` | 用户点击了机器人的快捷菜单 | `session.userId`, `session.channelId`, `session.event.button.id` (菜单ID)                      |
| `button.report.inline` | `interaction/button` | 用户点击了消息中的内联按钮 | `session.userId`, `session.channelId`, `session.messageId`, `session.event.button.id` (按钮ID) |

