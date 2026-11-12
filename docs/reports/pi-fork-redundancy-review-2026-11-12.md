# 上游与 fork 差异精简审查

2026-11-12。只读审查产品代码；本次仅新增此报告，没有实施清理。

## 基线与量级

已 fetch `upstream` 和 `origin`，固定比较对象：

- fork `dev`：`7b5926251d5e208a158f043c83fbf2c650f61eba`。
- 上游发布线 `upstream/main`：`096dbfca6af374ba23f6a5fe97e7c28566561a6c`。
- 上游开发线 `upstream/dev`：`64887cf5e12f3ff59388ceddd1da41dfbd176702`。

发布线已经是 fork 的祖先，没有缺失的 main 提交。上游 dev 比 main 多三个提交，主要涉及 Notes/Comms、JS Notebook 和 sandbox 使用指导，没有覆盖当前 fork 的 Shepherdr 定制。此次 fetch 显示上游 dev 经历过强制更新，不宜用旧的 dev 提交数量代替文件差异。

相对发布线，审查开始时的净差异：

| 内容 | 文件数 | 增加 / 删除行 |
| --- | ---: | ---: |
| 产品源码、构建、配置 | 32 | +482 / -143 |
| Changesets | 6 | +43 / -0 |
| lockfile | 1 | +53 / -53 |
| 既有同步报告、日志 | 17 | +543 / -0 |
| 合计 | 56 | +1121 / -196 |

因此不能把 Git 历史中 fork 一侧的 115 个独有提交都当作仍需维护的定制。部分历史是上游 dev 内容经 squash 发布后留下的不同提交身份。`apps/`、Ask、Imagegen、Web Run、Grok 当前均无相对 main 的文件差异。

## 建议清理的具体项

### 1. 回复记录保留了已无消费者的 observer 链

fork 的 `SettlementDelivery.replyingTo()` 现在只读取独立 `replies` map，但仍保留上游的 `claims.replyingTo` 写入和复制链。

- `packages/pi-shepherdr/src/settlement/delivery.ts:49`：实际读者只取 `replies`。
- 同文件 `:55` 的 `observeReply()` 写入 `claims.replyingTo`；`:78`、`:92` 只是继续复制该字段，没有实际使用其值进行过滤或投递。
- `agents-work.ts:163`、`monitor.ts:212`、`settlement/index.ts:114` 是这条旧链的调用和透传。

最小清理约 20 行：移除 `observeReply` 链及 `SettlementClaim` 中仅服务该链的元数据，保留 waiter 和独立 `replies`。这是合并后的死数据，不是已经确认的运行故障。

**不能把独立 map 一起删掉。** 显式 blocking reply 的等待可以被 Code 工具取消，monitor 仍继续运行；取消会删除 waiter 的 claim，但已回答的问题身份仍须保留，防止旧 blocked 状态重新报成待回答问题。真实入口包括 `pi-codex-conversion/src/tools/code-mode/delegate-runtime.ts:92`、`delegation/tool-executor.ts:130`；最终过滤在 Shepherdr `settlement/index.ts:160`、`:207`。

### 2. 重连退避已不再解决远程重试问题

- `packages/pi-shepherdr/src/fleet/monitor.ts:60` 设置 `reconnect: runtime.local`。
- `src/monitor-events.ts:209` 在 `reconnect === false` 时不启动自动重连计时器。
- fork 在 `:220` 把固定一秒改为指数退避，`:221` 的注释却仍说防止慢远程线路被重试淹没。

新架构下这项差异只降低本机重试频率，并可能让恢复等待达到 30 秒。建议恢复上游固定一秒；若确实需要本机长期故障降频，则应按这个真实用途保留。它不是完全无行为的死代码，但旧的远程优化理由已失效。

### 3. Shepherdr changeset 仍重复描述上游已发布行为

`.changeset/shepherdr-startup-bundle.md:6` 的远程 helper 复用，以及 `:15` 的 reply 默认送达即返回，已经在上游 1.0.0 中实现。后者可由上游 `agents-reply.ts` 固定传入 `false` 及 `CHANGELOG.md:18` 核实。

下一次整理 changeset 时，这两项不能继续作为 fork 相对发布版的新增功能。第 6 行若保留，应只描述实际剩余的重连差异；第 15 行真正的 fork 增量是显式 `blocking: true`，是否保留属于能力取舍。

旧远程 helper 的按版本安装缓存代码在上次同步中已经删除，被上游持久连接复用取代；当前没有另一套旧缓存实现需要再次删除。此前暂钉的 Pi SDK 1.5.0 / Conversion 4.0.9 也已对齐，不再是当前源码差异。

## 可以放弃，但不是上游已覆盖的定制

| 定制 | 实际增量 | 取舍 |
| --- | --- | --- |
| Core 单行状态摘要 | `widget.ts:63`、`:128`；watched peers 也合并为一行 | 若原目标仅是避免重复显示 supervised workers，上游已经过滤它们；若仍希望 peers 不占多行，fork 效果仍独有 |
| 成功工具结果单行化 | `agents-tool.ts:321`、`:357` | 纯显示密度取舍，可退回上游，但不能连错误分支一起回退 |
| 事件卡片图标、标题、元数据及间距 | `messages/render.ts:70` | 可先放弃的外观定制 |
| 长响应默认折叠 16 行、直接显示问题 | `messages/render.ts:20`、`:95`、`:118` | 上游展开后仍能看到完整内容；fork 提供更省屏或更直接的阅读方式 |
| reply 显式 blocking | `agents-contract.ts:244`、`agents-reply.ts:43`、包根 `index.ts:93` | 上游默认非阻塞已满足，只有可选等待尚未覆盖；当前等待结束仍只返回 receipt，不返回 worker 最终正文 |
| 普通模式主动并行分工 | `messages/guidance.ts:4`、`agents-discovery.ts:120` | 上游策略不同，属于工作习惯偏好 |

三个 UI 文件 `agents-tool.ts`、`messages/render.ts`、`widget.ts` 的净增加为 156 行，其中混有应保留的错误修复，不能把整个差异都算作可删行数。上游 main/dev 的这些文件及 `core/spawn.ts` 内容一致。

## 仍有依据保留的差异

| 定制 | 当前证据 |
| --- | --- |
| 工具错误正文 | `agents-tool.ts:346`。上游自定义 renderer 对没有 details 的错误会默认显示 done；Pi 原生错误背景不替代自定义正文。Pi 1.5.2 `tool-execution.js:244` 仍优先使用自定义 renderer |
| 启动失败最后屏 | `core/spawn.ts:87`。上游在错误后直接 kill/rm 新终端；fork 在回滚前用两秒上限读取最后 20 行，保留诊断原因 |
| JSON-shaped message 归一化 | `agents-contract.ts:172`。公开 envelope 未约束 message 类型，Ask 的回复又可能是 JSON 数组，上游 main/dev 没有相应归一化 |
| 图片预览去重及显示开关 | `view-image/tool.ts:186`、`trace-rendering.ts:79`。下面的同输入渲染探针确认上游仍缺少这些处理 |
| Browser 后端懒加载 | `pi-browser/src/browser-registration.ts:32`。上游仍静态导入 runtime；帮助早返回仍避免载入执行后端 |
| Notes 错误附支持字段、Board 回复提醒 | Agent Comms canonical 源中的一行级定制，仍未上游化。已有 help 不等于这些来自工具误用反馈的提示失去作用，维护成本很低 |

Notes/Board 独立包里的同内容文件由上游同步脚本生成，不是需要新抽象消除的手写重复。`node scripts/sync-agent-comms-standalones.mjs` 本次确认一致；后续若修改，应在 canonical 源处理并同步。

## 启动打包需要新证据再取舍

`scripts/build-startup-bundle.mjs` 的 65 行及两包 manifest/根 install 配套，是目前较集中的构建定制。上游仍没有等价的两包预打包路径，发布版 Pi 1.5.2 仍用 jiti 加载扩展。

历史提交 `32b7b21b:docs/startup-optimization-research.md` 记录：Pi 1.4.0 下，Shepherdr/Notes 打包与 Browser 懒加载整组补丁，使交错五次样本的启动中位数从 4537.6 ms 降到 2467.4 ms，约 46%。该文件随后在 `328c4370` 删除，记录仍可从 Git 读取。

这不是当前版本或单包收益的证据。上游 Notes 现在已有按需初始化，所以建议在当前 Pi 1.5.2 上重新对照测量，再决定是否撤掉打包链。不能仅因上游改了架构就宣布旧性能补丁无效，也不能把旧的整组收益全部归给打包。

## 本次验证与边界

完成 Git 文件/blob 对照、相关调用者检索和以下聚焦检查；没有执行全仓构建或 live TUI：

- 相同图片输入的真实自定义 renderer 对照：上游主调用 renderer 输出一个图片组件，fork 主调用 renderer 输出零个，由 Pi 顶层负责显示；fork 嵌套调用保留一个图片组件。隐藏图片时，上游 renderer 仍输出一个，fork 为零。五项 assert 通过。Pi 顶层始终另行处理 content 图片的路径已核对发布版源码。
- Code/Notebook 捕获结果去重对照：同一图片已在外层输出时，上游仍向自定义 renderer 传入一个图片，fork 为零。assert 通过，并核对 `delegation/tool-executor.ts:93`、`:103` 的实际 captureResult 入口。
- 分工审查的只读断言检查：reply 记录跨 waiter abort 保留、release 后清除，数组 message 归一化，默认非阻塞及显式 blocking 分类通过。生命周期差异不等于真实故障竞态复现。
- Agent Comms 独立包源一致性检查通过；审查前工作区干净，`git diff --check` 无错误。

探针在内存中加载上游单个模块，依赖使用当前相同实现，没有修改上游、已安装工具或用户配置，没有模型/网络工具请求。已有全量同步门禁见 [同步报告](pi-fork-all-extensions-update-2026-11-12.md)，本次不重复宣称其覆盖清理后的候选。

建议先处理 observer 死链、已失去远程用途的退避及重复发布说明；UI 取舍和启动打包分别决策。尚未实施任何建议，未删除产品代码或数据。两个分工审查代理已经关闭，未创建 worktree、辅助分支或持久探针。
