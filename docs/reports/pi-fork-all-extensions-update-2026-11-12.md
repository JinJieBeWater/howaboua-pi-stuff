# 全部 fork 相关扩展更新（2026-11-12）

## 范围与版本

用户授权更新整个 howaboua fork 相关扩展。源码基线为 `833cd1967cb5c80f5795349ec18a3975a680517f`，更新源为 `upstream/main` 的 `096dbfca6af374ba23f6a5fe97e7c28566561a6c`。在独立工作区三方合并后保留本地定制；通过检查后将现有 dev 快进到合并结果。不发布，不 push，不改变 Pi 的来源及工具加载策略。

| 本地来源 | 原版本 | 更新后 | 入口 |
| --- | --- | --- | --- |
| pi-codex-conversion | 4.0.9 | 4.0.10 | 重建 dist |
| pi-browser | 0.0.13 | 0.0.13，上游最新源码 | 保留 TypeScript 入口及懒加载 |
| pi-agent-board | 0.0.5 | 0.0.6 | 保留独立包来源 |
| pi-notes-compaction | 0.0.15 | 0.0.16 | 重建 fork 启动 bundle |
| pi-shepherdr | 0.2.27 | 1.0.0 | 重建 fork 启动 bundle |

整个仓库的其他扩展、skills、原生工具和依赖随同上游源码同步，未新增启用的扩展来源。相关 Pi SDK 依赖统一为 1.5.2，conversion 为 4.0.10，不再保留上轮为 4.0.9 暂钉的开发依赖。

对已声明的 10 个 `npm:@howaboua/*` 扩展逐个使用原生更新，均已为 registry latest。额外检查 npm root 的 4 个同仓直接依赖副本：conversion 4.0.7→4.0.10、agent-board 0.0.4→0.0.6、notes-compaction 0.0.13→0.0.16，browser 0.0.13 已最新。ask/imagegen 的五条实际可选 import 均解析到 npm conversion 4.0.10。主 settings 与 auth 未变；完整清单和安装日志位于 `/Users/jinjiebewater/my/research/pi-fork-installed-update-2026-11-12.md`。

## 合并决策

- 保留 browser 后端首次操作才载入、帮助直接返回、关闭取消的定制，按新 schema 构建器更新类型。
- 保留 view-image 图片可见性、嵌套预览和去重的定制。转换传输/provider 实现逐字采用上游，未加新请求或重试策略；已对照 Pi 1.5.2 stock provider 的请求、身份头、WebSocket/SSE 恢复、结束状态与现有适配边界。
- 上游将 notes/board 实现迁到 Agent Comms 并生成独立包。fork 的 supported-fields 错误和 board 回复指引保存在 canonical 源，再通过官方同步脚本同步独立包；一致性检查通过。原有独立包配置不换成 Agent Comms。
- notes 启动 bundle 入口更新为根 `index.ts` 与 `src/notes/context-sharing.ts`；saved-session 仍导出 Node 可读的 `.mjs` 源码。
- Shepherdr 保留 reply 默认收到语义送达后返回、显式 blocking:true 等待；JSON message 归一化、主动分工、错误/折叠卡片、单行 Core 摘要、worker 过滤、启动失败屏读、事件重连退避均保留。
- 旧远程 helper 每次请求部署路径由上游的持久连接 helper 替代；保留上游终端验证及回滚。删除旧模块，不留备用实现。探针验证并发请求共享一个 lazy helper，bootstrap 小于 30 KB。
- 回答旧 blocked 状态的抑制记录仍独立于 waiter；保留 fork 的回复记录，以免 waiter 被取消后旧问题再次出现。
- Shepherdr 两份重复 changeset 合为一份并改用新架构描述；Agent Comms 的两项继承定制补一份 changeset。无版本手工加号或重复发版。

定制保留审计与 Shepherdr 合并证据分别位于 `/Users/jinjiebewater/my/research/pi-fork-local-customizations-2026-11-12.md` 和 `/Users/jinjiebewater/my/research/pi-fork-shepherdr-merge-2026-11-12.md`。审计中 voice/state 属于其他仓库的描述已纠正，不作为本轮修改范围。

## 验证

| 检查 | 结果与日志 |
| --- | --- |
| lock 重算及原生 install:ci | 通过；包含 browser、conversion 准备、Shepherdr/Notes bundle 构建。[日志](pi-fork-all-extensions-update-2026-11-12-install.log) |
| conversion check | 类型检查和现有 3 个测试通过。[日志](pi-fork-all-extensions-update-2026-11-12-conversion.log) |
| browser、ask、imagegen、web-run、board check | lint/typecheck 通过，web-run 现有网络边界测试通过。[首轮日志](pi-fork-all-extensions-update-2026-11-12-related-initial.log) |
| notes、comms、auto-trees、smart-btw、cache-hit-predictor check | notes 首轮仅格式错误，修正后相同检查及剩余包通过。[最终日志](pi-fork-all-extensions-update-2026-11-12-related-final.log) |
| Shepherdr check/build 与聚焦探针 | 通过，见其合并报告；显式 blocking 恢复后重跑通过 |
| 原生 bundled 工具、6 平台 Code Mode host assets、conversion artifact | 全部通过，未使用 native helper override。[日志](pi-fork-all-extensions-update-2026-11-12-native-artifacts.log) |
| 根 knip | 上游及 fork TypeScript 拓扑检查通过。[日志](pi-fork-all-extensions-update-2026-11-12-knip.log) |
| 配置加载与兼容性 | 使用当前设置的隔离副本加载 27 个扩展，零错误；相关工具和延迟 Notes/Board 命令各注册一次；8 个已有 profile 及 Notes/Board 设置可解析。[日志](pi-fork-all-extensions-update-2026-11-12-configuration.log) |

隔离加载探针初次未映射 context-policy 的相对来源，修正测试目录映射后加载通过。Board/Notes 在 session_start 延迟注册工具，因此检查其初始化命令而非误要求 factory 阶段已注册工具。原始认证、任务与用户数据库未供探针写入，未发送模型/生图请求。

按照 ponytail-review 检查了冲突、调用方、构建入口、导出、依赖解析和本地定制；未发现仍需修复的具体本机加载问题。未做 live TUI、真实模型/图片请求或所有跨机生命周期场景。

## 主机依赖及删除

本机 `hc 0.1.20` 满足新 Shepherdr 的 Core >=0.1.18 要求。KVM 的 CLI 和运行中 Core 均为 0.1.17，不满足远程连接的 machineIdentity 版本检查；本次未擅自重启或升级它。需要独立完成 KVM Core 更新后才能把远程协作标为可用。原生 `hc update --version 0.1.20` 会更新并重启 Core，终端按工具说明保留。

删除项来自上游重构：旧 Shepherdr 15 个远程/legacy 模块、部分被移动或替代的 Notes/Board 文件，以及 fork 重复的 Shepherdr changeset。完整删除记录见 Git diff 与 Shepherdr 报告。没有删除用户任务、notes、board、数据库或日志；agents-cron 保持卸载状态。

## 本机安装收尾

已将原 dev 快进到整合结果，在真实 checkout 再次执行 `bun run install:ci`，退出 0；使用实际 checkout 和当前偏好的隔离副本重放加载检查，27 个扩展零加载错误、8 个既有 profile 与 Notes/Board 配置解析通过。不重跑已有效的同源码包级门禁。cron 包与定时入口仍不存在，任务 JSON 的原 SHA-256 保持不变。临时整合 worktree 和分支已清理；当前运行会话仍需空闲后 reload 或重开才能采用完整的新模块。KVM Core 的独立升级尚待授权。
