# 上游正式版同步（2026-11-13）

## 范围

用户要求整理当前仓库、跟进最新上游并更新本地加载的扩展。起点为 `dev` 的 `d4b4e071`，工作区干净；同步目标为上游正式发布标签 `@howaboua/pi-codex-conversion@5.0.0`，提交 `c3b422c60256907f5a4499cc44e4d055ac3cc28a`。该提交也是检查时的 `upstream/main`，npm 发布时间为 2026-11-13 00:56 UTC。

保留 fork 历史、现有扩展来源及定制，在现有 `dev` 整合正式发布标签，不重写历史或 push。`origin/dev` 停在 11 月 5 日；原先领先的 30 个提交包含 17 个上游提交和 13 个 fork 合并、同步、文档及定制提交。

## 整合

- conversion 更新至 5.0.0；Agent Comms、独立 Notes/Board、Shepherdr 等随正式发布线同步。
- 保留 conversion 的四文件图片显示、嵌套预览和去重定制。
- 保留 Browser 懒加载、Notes/Shepherdr 启动 bundle，以及既有 Notes/Board 参数错误与回复指引；此前已撤回的定制不恢复。
- 唯一文本冲突为 `bun.lock` 的发布版本信息，选择新发布版本后用 Bun 按合并后的 manifests 重算 lock。
- JS 模式采用上游 QuickJS Code：每次调用使用新 VM，最多四个并发 cell，`store/load` 仅保留会话内 JSON。旧 notebook 文件保持原样，不再加载；Deno/TS Notebook 继续保留各自行为。
- 上游新增退出后的 retired-session 清理能力；本次不更改用户清理选项，不调用清理，不重置任何用户数据。

## 验证

| 检查 | 结果 |
| --- | --- |
| `bun run install:ci` | 通过；安装锁定依赖，重建 Browser 与 Notes/Shepherdr 启动 bundle。[日志](pi-fork-upstream-release-update-2026-11-13-install.log) |
| conversion check/build | 通过；类型检查、三个现有测试和完整 dist 构建。check 输出已在工具结果中核对；[构建日志](pi-fork-upstream-release-update-2026-11-13-conversion.log)。 |
| Comms、Notes、Board、Shepherdr、Observatory、GitHub Watch | 各包 lint/typecheck 通过；Comms viewer 也已重建。Comms check 输出已在工具结果中核对，其日志仅记录 build；其余检查日志为本报告同名前缀的 `notes`、`board`、`shepherdr`、`observatory`、`github-watch` 文件。 |
| canonical 同步与依赖拓扑 | `sync-agent-comms-standalones.mjs` 和根 `bun run knip` 通过；Web Run/Imagegen 的 `src/codex-runtime` 完全一致。[knip 日志](pi-fork-upstream-release-update-2026-11-13-knip.log) |
| 构建后 QuickJS 实跑 | fresh globals、跨调用 store/load/delete、嵌套工具往返、四个并发 cell 与第五个准入拒绝、无限循环终止、后续执行恢复均通过；原始版本警告未再出现。[日志](pi-fork-upstream-release-update-2026-11-13-runtime.log) |
| 当前配置加载 | 将当前偏好复制到隔离 agent 目录，使用发布版 Pi 1.5.2 的资源加载器加载 27 个扩展，零错误，30 个工具无重名；conversion 恰好加载一次，实际入口为本 checkout 的新 `dist/index.js`。原 settings 字节未变。[日志](pi-fork-upstream-release-update-2026-11-13-configuration.log) |
| extension artifact/native 文件 | `verify:extension-artifact`、`verify:codex-tool-binaries` 通过；`verify:code-mode-host-assets` 验证全部六个平台的官方 rust-v0.167.0 资源。 |
| 本机 bundled helper 实跑 | 无 override：apply_patch 写入临时文件并返回新版本的 `OK`；exec_bridge 执行命令；view_image 解码 PNG，全部通过。[日志](pi-fork-upstream-release-update-2026-11-13-native-runtime.log) |
| 独立整合审查 | reviewer 按 ponytail-review 检查上游净差异、图片委派/去重调用链、bundle 中新 `.mjs` 路径、standalone 一致性、37 个 workspace 锁记录和既有决策，未发现阻断问题。复用已有门禁，未重复运行。 |

加载探针最初遗漏复制配置中额外引用的包来源映射，native 探针最初使用的 PNG 样本 CRC 错误；修正临时探针后原场景均通过，没有因此改动产品源码。探针只操作自有临时目录，没有调用模型、用户清理或用户数据库。

专用 `sandbox-reviewer` profile 在当前 agents 工具中不可用；调用返回 `unknown agent_type`。未做隔离 TUI 连续对话、真实模型或语音验收；上述程序探针不替代这些场景。

## 本机安装

本地 conversion 来源继续保留。另将 Pi npm 安装目录中供其他扩展导入的 conversion 从 4.0.10 更新到 5.0.0，避免混用旧公共 API。`pi update npm:@howaboua/pi-codex-conversion` 因该 npm 副本不在 settings 声明中而拒绝；随后使用 Pi 相同参数的原生 npm 安装更新已有副本，没有新增扩展来源。ask、imagegen、web-run 的实际依赖解析均指向 npm conversion 5.0.0。[安装日志](pi-fork-upstream-release-update-2026-11-13-npm.log)

没有变更当前 `executionMode: normal`、原生 codemode 偏好、账号或认证。磁盘产物已更新；正在运行的 Pi 不会自动替换已加载模块，空闲后 `/reload` 或重开会话才能完整使用新版本。

## 删除与交付

删除项来自上游：JS Notebook 的旧项目堆、快照、绑定和磁盘存储实现由一次性 QuickJS Code 替代。用户保存的数据、配置和历史报告不删除。

清理了指向不存在目录的旧 `/private/tmp/pi-sync-5ede06bd` worktree 注册，以及其已被当前 dev 包含的 `sync/upstream-5ede06bd` 辅助分支；提交历史仍保留。临时运行探针和 reviewer 在完成后清理。既有六份 fork changeset 保留，没有手工增加版本、重复发版或新增永久测试。整合保存在本地 `dev`，不 push。
