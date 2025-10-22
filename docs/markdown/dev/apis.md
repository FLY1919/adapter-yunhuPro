# API 文档

## 获取 Bot 实例

以下所有 bot 均通过这样获取：

```typescript
const bot = Object.values(ctx.bots).find(b => b.selfId === "your_bot_uid" || b.user?.id === "your_bot_uid");
if (!bot || bot.status !== Universal.Status.ONLINE) {
  ctx.logger.error(`机器人离线或未找到。`);
  return;
}
if (bot == null) return;

// 在这里继续使用 bot.方法
```

## Bot 通用方法

### sendMessage

/// 继续完善