# Pi fork 启动收益：当前三项加载优化的实测对照

2026-11-12。按用户决定：先测当前启动收益，再决定 Shepherdr/Notes 启动 bundle 与 Browser 懒加载的去留。本报告只做性能对照，产品源码与日常配置未修改，代码与决策记录由父 agent 负责。

## 结论

- 当前 Pi 1.5.2 的受控配置仍显示这些优化的价值。受控证据充分的是 Shepherdr 与 Browser；Notes 不能用 `+3 ms` 推断日常收益——受控 RPC 里 Notes runtime 没完成初始化，而用户日常交互式是启用的。Notes 的保留价值以已初始化对照的 **≈254 ms** 为准，真实全配置收益未定。
- 整体：扩展加载阶段（官方 `PI_TIMING` 的 `extensions` 命名空间 TOTAL）从 **937 ms 变成 1612 ms**（撤销三项，+72%）；同一批样本的 spawn→`get_state` 墙钟中位数从 **1998 ms 变成 2912 ms**（+914 ms）。
- 逐项（warm，撤销该项相对完整方案，扩展加载阶段）：Shepherdr bundle **+500 ms**，Browser 懒加载 **+153 ms**，Notes bundle **+3 ms**（只覆盖入口 import 与工厂，Notes 初始化不在其中，见下）。
- 冷缓存那轮（每条件 n=1）：Shepherdr **+854 ms**、Browser **+249 ms**，Notes 墙钟 **+478 ms** 同时 `pi-codex-conversion` 墙钟噪声很大，只能算观察值，不能作为 Notes 的单项收益。
- 因此：Shepherdr、Browser 建议保留；Notes 的取舍看是否认可已初始化对照的 ≈0.25 s，它在受控完整方案里没有被量到，不能据此得出“撤销代价最小”。旧 46% 报告是另一套指标与配置，不与本报告互相解释。

## 方法

- 被测进程：本机已装官方 bundled CLI `/Users/jinjiebewater/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js`，Pi 1.5.2，Node v24.21.0（`~/.local/bin/pi` wrapper 指向同一文件）。
- 模式：`--mode rpc --offline`，从 spawn 到 `get_state` 响应计墙钟；不使用 `PI_STARTUP_BENCHMARK`（仅 interactive）。另开 `PI_TIMING=1` 取官方分段计时，其中 `extensions` TOTAL 是扩展加载阶段，`createAgentSessionRuntime` 含扩展工厂。`get_state` 之后补一条 `get_commands` 再关闭 stdin，等进程自行退出。
- 不发模型请求：只发 `get_state`/`get_commands`，`--offline` 关闭 catalog refresh，`get_state` 每次返回 `magpie/codex/gpt-6.1-sol`。
- 隔离：`PI_CODING_AGENT_DIR` 指向 `/tmp` 下复制的 agent 目录（含 npm/git/extensions 副本与配置副本），`PI_CODING_AGENT_SESSION_DIR`、cwd 亦为临时目录，env 白名单重建，不带 `HC_TERMINAL_*`/`PI_SESSION_*`，不连接 Herdr Core，不读写真实 notes.sqlite / session / board 数据库。
- 条件（同一扩展集合、同一顺序、同一启用状态，只换三个包的加载入口）：
  - `full`：HEAD `1046f7d1` 现状——Shepherdr/Notes 用 `dist/*.js` bundle，Browser 用懒加载源码。
  - `rev-all`：三者都撤——Shepherdr/Notes 的 `pi.extensions` 改回 `./index.ts`（`main`/`exports` 同步），Browser 的 `src/browser-registration.ts`、`src/browser-tool-definition.ts` 换成 `upstream/main 096dbfca` 版本；包放在 `/tmp` 副本，`node_modules` 软链回原包，依赖解析与模块身份不变。
  - `rev-shepherdr` / `rev-notes` / `rev-browser`：只撤一项。
  - `notes-ctl-full` / `notes-ctl-rev`：从完整方案里移除 `pi-codex-conversion`，让 Notes 真正初始化，用来隔离 Notes 的收益（见"Notes 激活"）。
- 采样：每条件预热 1 次并剔除，正式 3 次；条件顺序逐轮轮转交错；warm 使用同一个持久 jiti/node 编译缓存目录（等同用户日常 `~/.cache/pi-tmp`）。另做一轮每条件独立冷缓存（n=1，方向性证据）。不追样本量。
- Browser 的 help/首操作边界不启 GUI：只用启动期是否载入 `browser/runtime` 模块 + 工厂耗时证明，首次真实浏览器操作仍支付延迟加载成本，本报告不含该成本。

## 结果（warm 缓存，n=3）

| 条件 | spawn→get_state 中位数 | 范围 | 扩展加载阶段 中位数 | 范围 |
| --- | ---: | ---: | ---: | ---: |
| full | 1,998 ms | 1,990–3,244 | 937 ms | 922–947 |
| rev-all | 2,912 ms | 2,898–2,940 | 1,612 ms | 1,597–1,629 |
| rev-shepherdr | 2,523 ms | 2,513–2,550 | 1,437 ms | 1,436–1,460 |
| rev-notes | 2,279 ms | 2,266–3,473 | 940 ms | 932–944 |
| rev-browser | 2,689 ms | 2,145–3,379 | 1,090 ms | 1,090–1,116 |

墙钟噪声明显（`full` 有一次 3,244 ms 的离群、`rev-browser` 2,145–3,379），扩展加载阶段则很稳定。`full` 的墙钟离群与三项优化无关：`createAgentSessionRuntime` 稳定在 1,000–1,026 ms，变化落在计时覆盖不到的 `pi-codex-conversion` 相关阶段。

归因（撤销该项 vs `full`，扩展加载阶段）：Shepherdr +500 ms，Browser +153 ms，Notes +3 ms（仅入口部分）；三项之和 +656 ms 接近 `rev-all` 的 +675 ms。这组入口加载增量接近可加，但不证明不存在相互影响，也不包含 Notes 完整初始化的收益。

## 冷缓存（每条件独立 TMPDIR，n=1）

| 条件 | 墙钟 | 扩展加载阶段 |
| --- | ---: | ---: |
| full | 4,133 ms | 2,674 ms |
| rev-shepherdr | 5,781 ms | 3,528 ms（+854） |
| rev-notes | 4,611 ms | 2,695 ms（+21）；墙钟 +478 |
| rev-browser | 4,239 ms | 2,923 ms（+249） |
| rev-all | 6,957 ms | 4,134 ms（+1,460） |

冷缓存下公共部分（所有 TS 扩展的首次 jiti 编译）约 1.7 s，各样相同。Shepherdr 的 +854 ms 与扩展阶段一致，方向可读；Notes 的 +478 ms 只是墙钟观察值：该轮 `pi-codex-conversion` 相关阶段波动很大，且每条件只有 1 次样本，不能据此把差额归因成 Notes 动态 import 的节省，也不能换算成单项收益。

## Notes 激活（用户补充的验收点）

完整方案下，受控 RPC 进程**没有完成 Notes runtime 初始化**，证据：

- `notes` 工厂与 `session_start` 处理器确实执行：每次运行都会重写隔离目录里的 `notes-compaction/settings.json`，`PI_TIMING` 也记到 `pi-notes-compaction/dist/index.js` 的 import/factory。
- 但 Notes 初始化标志缺失：探针在 `session_start` 后 600 ms 仍收不到 `pi-notes-compaction:context-sharing:available`（该事件在 `createNotesRuntime` 里发出），`notes`/`history`/`new_context`/`get_context_remaining` 四个工具都不在 active tools 里，也没有创建 `notes.sqlite`。
- 变量控制：把 `pi-codex-conversion` 从集合里移除后，同一探针立刻显示 `sharing=true` 且四个工具全部 active。二分定位（npm/git 包、`pi-stuff` 包、fork 包逐组加减）都指向 `pi-codex-conversion` 这一项；它和 Notes 的整合在 RPC 模式下没有走完。

对照组 `notes-ctl-*`（Notes 完整初始化，n=3）因此才能量到 Notes 的真实收益：

| 条件 | 墙钟中位数 | 范围 | 扩展加载阶段 |
| --- | ---: | ---: | ---: |
| notes-ctl-full（bundle） | 1,127 ms | 1,114–1,129 | 891 ms |
| notes-ctl-rev（源码） | 1,381 ms | 1,374–1,381 | 874 ms |

即 Notes 初始化时撤销 bundle 多 **≈254 ms**，且这段成本落在 `session_start` 的动态 import，不在扩展加载阶段。该控制在 warm 缓存下非常稳定，是本报告里最干净的一组对照。它证明的是“Notes 一旦按日常方式初始化，bundle 值约 0.25 s”；用户真实全配置（含 `pi-codex-conversion`、真实 132 MB 库）下的绝对值仍未测。

范围界定：完整方案（含 `pi-codex-conversion`）的 Notes 结论只覆盖“入口 import + 工厂 + `session_start` 处理器前段”；Notes 初始化那 ≈254 ms 不在其中。`full` 与 `rev-notes` 的 +3 ms 因此既不能当作日常收益，也不能当作“撤销无代价”的依据。

## 保真度与限制

- 受控配置改动仅限路径写法：`settings.json` 里的本地源改成绝对路径（Pi 以 agent 目录为基准解析，隔离目录里相对路径会指错），扩展集合、顺序、`extensions: []` 过滤、各开关保持不变。`pi-tool-exposure.json` 里 Browser 的 adapter 源同步指向对应副本（这是 user 实际加载 Browser 的真实路径，Browser 不是原生加载，而是被 `pi-tool-exposure` 以 deferred 曝光方式 import）。
- Shepherdr 在真实使用中由 `pi-context-policy` 的 Herdr 环境门控加载；受控环境没有 Herdr socket，改为原生加载（同样的入口、同样的工厂代码），运行期进入降级模式并提示需要 Herdr Core 0.1.18+。受控证据只到“相同入口、相同工厂与模块图下，bundle 少约 0.5 s”；真实 Core 路径（socket/controller/发现）未测，不能断言该收益与运行模式无关。
- Notes 使用隔离目录里的空库：`notes.sqlite` 读路径不会建库，`history-search.sqlite` 也要等首次索引；user 真实的 132 MB `notes.sqlite` 打开成本未覆盖（与 bundle 与否无关，但会抬高绝对时间）。
- Browser：启动期不再载入执行后端；首次真实浏览器操作（help 之外）仍会触发后端 import，是否启动本地 Chrome 取决于已有浏览器或远端配置，本报告未测。controls 里 Browser 的加载成本出现在 `pi-tool-exposure` 工厂（223 ms → 380 ms）。
- 绝对时间不能与旧证据（interactive `PI_STARTUP_BENCHMARK`，4537.6→2467.4 ms，−46%）横比：本报告是 RPC 就绪，不含 TUI 初始化，配置与指标也不同。旧报告本身也是预热后测量，本报告不解释两者的差额来源。
- 本机测量期间有其他 Pi 会话与后台任务并发，墙钟波动如实保留；周期间不追加样本追显著。
- 未做真机 TUI、真实浏览器、guest 验收。

## 零加载错误与进程实际扩展

33 次受控启动（warm 20 + cold 5 + notes-ctl 8）全部 `ok=true`、退出码 0、stderr 无 `Failed to load extension`；完整方案每次 37 个扩展工厂（加探针 38），含 `pi-shepherdr/dist/index.js`、`pi-notes-compaction/dist/index.js`、`pi-agent-board/index.ts`、`pi-codex-conversion/dist/index.js`、`builtin:codemode` 等；对照组因移除 `pi-codex-conversion` 为 36 个。`get_state` 均返回模型 `magpie/codex/gpt-6.1-sol`，`get_commands` 在完整方案为 157 条、对照组 156 条。原始逐次扩展清单与耗时见同名 raw JSON。

## 逐项建议（供父 agent 记录决策，不代表已实施）

- Shepherdr bundle：保留。受控证据里收益最大（warm +500 ms，冷 +854 ms），成本只是现有构建脚本 + 加载入口；真实 Herdr Core 会话的绝对收益未测。
- Browser 懒加载：保留。启动少 ~150 ms（冷 ~250 ms），且 `pi-tool-exposure` 的 deferred 曝光路径正常；首次真实操作仍会触发后端 import，其成本与是否拉起本地 Chrome 未测。
- Notes bundle：未定，不建议按本轮受控数据判为“可撤”。受控完整方案里 Notes 未初始化，`+3 ms` 只说明入口层面几乎无差别；已初始化对照显示 bundle 值 ≈0.25 s，这是目前唯一支持保留的量化证据。若采用“用户日常 Notes 始终启用”的前提，应按 ≈0.25 s 计入保留价值；真实全配置下该数值仍未测。
- 附带观察（未定，超出本报告范围）：`pi-codex-conversion` 存在时，RPC 模式下 Notes runtime 初始化不完成。默认交互会话里 Notes 工具是激活的，所以这更像 RPC 路径的差异而非产品缺陷，但它会影响任何以 RPC 评估 Notes 的测量，值得单独确认。

## 未决

- 完整配置（含 `pi-codex-conversion`、Notes 正常初始化）下 Notes bundle 的真实启动收益未测；目前只有已初始化对照的 ≈254 ms。
- 真实 Herdr Core 会话下 Shepherdr 的绝对启动成本（含 socket/controller）未测。
- 真实 `notes.sqlite`（132 MB）打开成本未测。
- Browser 首次真实操作成本未测（按要求不开 GUI）。
- Notes 在 RPC + `pi-codex-conversion` 下未完成初始化的原因未定位到具体调用点。

## 证据位置

- 本报告：`docs/reports/pi-fork-startup-benchmark-2026-11-12.md`
- 原始逐次数据：`docs/reports/pi-fork-startup-benchmark-2026-11-12-raw.json`（warm/cold/notes-ctl 逐次 `wallMs`、`timings`、`extensionTimings`、激活探针结果、隔离 env）
- 基线：fork `1046f7d16e34e4e99b882f732c0e89ca6ef38d2a`，`upstream/main 096dbfca6af374ba23f6a5fe97e7c28566561a6c`；旧证据 `32b7b21b:docs/startup-optimization-research.md`。

临时脚手架（隔离 agent 目录、变体副本、runner）原位于 `/tmp/pi-fork-bench`，已删除，父 agent 已核实目录不存在。没有修改产品源码、日常安装或配置。

用户看过测量范围和限制后，分别决定保留 Shepherdr 打包、Notes 打包和 Browser 懒加载；最终选择见 [逐项决策记录](pi-fork-customization-decisions-2026-11-12.md)。
