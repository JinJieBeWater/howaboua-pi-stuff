# Pi 三包上游发布同步（2026-11-12）

## 范围与决策

- 基线：`5e503fdcf199db7e101e440274b381ff722f9da0`，`dev`，开始时工作区干净。
- 发布来源：上游 `096dbfca6af374ba23f6a5fe97e7c28566561a6c`；三个目标 release tag 均指向此提交。
- 仅同步 `pi-ask` 0.0.19、`pi-codex-imagegen` 0.0.14、`pi-skill-harness-and-agent-engineering` 0.0.8，以及必要的依赖锁文件。
- fetch 后先核对 `git diff --stat` / `--name-status`：上游全仓差异 777 文件；三包仅 19 文件。没有整仓 merge，也不改其他包源码。
- 前一版 release 与本地三包的唯一差异，是 ask/imagegen 的 conversion peer/dev 版本由 4.0.8 改成 4.0.9。保留 dev 依赖 4.0.9，以继续使用本地 fork；运行时可选 peer 保留新上游的 `>=4.0.10` 声明，不能据此宣称整个 conversion 4.0.9 已兼容。
- 首轮聚焦检查发现上游开发 SDK 1.5.2 与 conversion fork 的 SDK 1.5.0 类型冲突。仅将 ask/imagegen 的 Pi SDK 开发依赖保留在 1.5.0；不修改源码、不加类型断言、不升级 conversion。相同检查回放后错误消失。
- 源码、prompt 和 skill 引用内容按原始上游同步；修改前已读取 `writing-for-agents`。
- `gh pr list --repo JinJieBeWater/howaboua-pi-stuff --state all --base main --head dev` 返回空列表。保留全部 fork 提交，不重置、不合并 main。
- 不另加 changeset：这些是原始上游已经发布的代码，不重复发版。

## 验证计划

运行两个扩展的聚焦 lint/typecheck；用可丢弃探针检查 schema 参数边界、设置校验和本地 conversion 4.0.9 的 Code Mode 路由。核对 skill 引用和发布版本；确认两个 codex-runtime 目录仍完全相同。按 `ponytail-review` 自查 diff 和实际调用路径。

依赖重计算前已提示可用 `hc run --on kvm`；本次仅小范围安装和检查，不启动批量全仓门禁或子 agent。没有实际 Pi TUI 验收或付费图像生成时明确记录，不用探针冒充 sandbox。

## 验证结果与实际日志

环境：Bun 1.4.4、Node.js v24.21.0（满足两个扩展的 Node `>=22.19.0` 要求）。三包内没有已有 test 脚本或测试套件；没有新增永久测试。

| 检查 | 结果 | 日志 |
| --- | --- | --- |
| `bun install --lockfile-only --ignore-scripts`，随后 `bun install --frozen-lockfile --ignore-scripts` | 通过；最终 frozen 安装无变更 | [install](pi-package-sync-2026-11-12-install.log) |
| 首轮 `bun run --cwd packages/pi-ask check` | 失败：Pi SDK 1.5.2/1.5.0 类型混用，已用开发依赖对齐修复 | [ask initial](pi-package-sync-2026-11-12-ask-check.log) |
| 首轮 `bun run --cwd packages/pi-codex-imagegen check` | 同上，已修复 | [imagegen initial](pi-package-sync-2026-11-12-imagegen-check.log) |
| 修复后再次运行 ask `check`（lint + typecheck） | 退出 0；24 文件 lint，通过 typecheck | [ask final](pi-package-sync-2026-11-12-ask-check-final.log) |
| 修复后再次运行 imagegen `check`（lint + typecheck） | 退出 0；30 文件 lint，通过 typecheck | [imagegen final](pi-package-sync-2026-11-12-imagegen-check-final.log) |
| 可丢弃 Bun 探针 | 退出 0；92 组 schema 对照、conversion 路由、设置读写和参数错误均通过 | [probe](pi-package-sync-2026-11-12-probe.log) |
| `git diff --check` | 通过 | 无输出 |
| 两个 `src/codex-runtime` 的 `diff -qr` | 完全相同，未修改 | 无输出 |
| 与目标 release 的三包全目录对照 | 只有 ask/imagegen `package.json` 的开发依赖版本不同，其余逐字相同 | `git diff @howaboua/pi-ask@0.0.19 -- packages/pi-ask packages/pi-codex-imagegen packages/pi-skill-harness-and-agent-engineering` |

两份最终 check 日志有一条信息级提示：上游 `^2.6.6` 范围解析成 Biome 2.6.7，而上游配置 schema 固定 2.6.6。没有 lint 错误，也不为消除提示偏离上游文件。持久日志只裁掉工具输出的行尾空白，保留全部诊断内容。

探针在独立临时 agent 目录运行，不读取或写入真实 Pi 配置。其结果覆盖：

- 新 `compile()` 和旧 TypeBox `Check()` 对 ask、Codex imagegen、OpenAI imagegen 的 92 组输入给出一致判定；包括缺少必填项、错误类型、枚举、GIF 数值边界/步长、引用图片数量和 null、未知字段。
- ask 的未知字段仍给出原来的可操作错误；本地 conversion 4.0.9 的 `adaptToolForCodeMode` 将 ask 帮助调用路由到 Pi 1.5.0 原生参数校验及执行，返回原帮助文本。
- imagegen 设置默认值、有效设置 round-trip、文件权限 `0600`、无效字段/枚举和损坏 JSON 错误均正确。
- 探针首次使用 CJS resolver 读取 ESM-only `pi-schema` 失败；改用 ESM resolver 后重跑通过。该错误属于探针本身，原始输出仍保留在日志中。

主 agent 已独立使用发布版 Pi 1.5.2 SDK 离线加载更新后的 ask/imagegen 两个 npm 扩展及 git 安装的 pi-grok，ask/imagegen/x_search 均注册成功；harness 是 skill 包，未作为运行扩展加载。未重跑它的门禁。这不是本地 TUI 交互或图像生成验收。

### 发出 schema 与 prompt 成本

使用 fork 已带的 `js-tiktoken` / `o200k_base` 测量序列化 schema，而非源码行数：

| 表面 | JSON bytes 旧 → 新 | tokens 旧 → 新 |
| --- | --- | --- |
| ask 参数 schema | 470 → 470 | 116 → 117 |
| imagegen Codex 参数 schema | 614 → 614 | 135 → 135 |
| imagegen OpenAI 参数 schema | 1062 → 1078 | 244 → 248 |
| fold 模板 | 不适用 | 165 → 165 |
| grill 模板 | 不适用 | 247 → 247 |

工具 description、promptSnippet、promptGuidelines 没有变化，standing tool prompt 的文字增量为 0。这里不声称测量了完整会话 prefix；skill 引用是按需指导，原样接受上游的 schema 建议，不做额外压缩。

### lockfile 范围

workspace metadata 只改变三个目标包。去掉了重计算顺带修正的、原本已存在的 pi-pulses / pi-shepherdr 陈旧 lock metadata，不夹带整理；保留后的 frozen install 仍通过。

依赖解析保留新 schema 1.5.2、imagegen undici 8.12.4、上游开发工具版本需求。共享 Biome 解析到 2.6.7，`@types/node` 到 26.6.6；旧的精确需求仍有独立条目。未修改根 manifest 或其他包 manifest。aggregate 包的精确发布依赖不自动升级，因此锁中保留它们需要的旧 ask 0.0.18 / harness 0.0.7 注册表条目；本次没有 aggregate 发布。

## Ponytail self-review

What this change does: It imports the three published upstream package updates. It keeps the fork's local conversion dependency and Pi 1.5.0 development SDK, without changing the released runtime code.

Looks good. Ship.

Checked: the full scoped diff, ask preparation/normalisation/coordinator callers, imagegen schema/settings/UI/execute callers, Code Mode adaptation and routing, manifests, lock scope, prompt metadata and the checks above. Expected load: one interactive Pi session per user. No new coordination, storage format, authentication or request transport was added.

Not checked: live Pi TUI, paid image generation, real proxy/HTTP behaviour of undici 8.12.4, or every optional conversion 4.0.9 workflow. The upstream optional peer still requires conversion >=4.0.10; the focused local success does not waive that requirement.

## 交付与清理

- Conventional Commit：`chore: sync three Pi packages with upstream releases`；最终 SHA 由交付回复给出，也可用 `git log -1 --format=%H -- docs/reports/pi-package-sync-2026-11-12.md` 查询。
- 删除项：没有删除仓库文件；ask/imagegen 移除 TypeBox 直接/peer 声明，其他包仍使用 TypeBox，未全仓清除。
- 临时探针及其隔离设置文件已清理；未创建子 agent、辅助分支、worktree、后台服务或 sandbox。检查进程均已退出。验证日志作为持久交付证据保留。
- 不 publish、不 push，不修改 `~/.pi` 或另一个安装仓库。源码提交本身不会重载当前运行中的 Pi 会话。
