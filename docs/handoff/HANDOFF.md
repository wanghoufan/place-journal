# HANDOFF｜交接（暂停/恢复用，先读我）

> 旧版字段（governance-state / Evidence / Human Gate / Promotion / Dispatch ID）已废弃，不填。

- Captured at（YYYY-MM-DD HH:MM）：2026-09-18 19:20（jcp 洁癖收尾直推 origin/master，见本轮 commit）
- PROJECT_PHASE：（DEVELOP——暂停中，恢复后继续；基线锁定 V1.5 不动）
- PLAN_VERSION：（PRODUCT_PLAN_V1.5）
- PLAN_READINESS_SCORE：（92）
- PLAN_GATE：（APPROVED——用户以“继续推进开发”批准 V1.5）
- DEV_BASELINE：（PRODUCT_PLAN_V1.5）
- CHANGE_REQUEST：（NONE）
- Stage ID（本阶段叫什么）：DEVELOP-安卓APP连续开发（基线 V1.5；MVP Gate T001–T085 为内部检查点）
- 剩 P0（没完的才列，多一条都不行）：
  - 无（DEV-10 已收工；暂停前无在途 Task）。
- 当前 Task（正干到哪）（累计打回 n/2，supervisor每次打回时TM同步更新）：暂停封存。上一 Task=TASK-DEV-10 已收工 PASS（打回 0/2）。
- 执行链/Session（可选，仅真 resume 通道填，普通 subagent 可空；TM 只记录/引用，ID 由基础设施返回，不手造、不要求用户复制；返工确认是否原链；senior 升级开新链后更新）：DEV-01→DEV-10 全收工（唯一真打回 DEV-03 P1×3 已闭环；supervisor 累计打回 0/2）。
- 执行链/Session（可选，仅真 resume 通道填，普通 subagent 可空；TM 只记录/引用，ID 由基础设施返回，不手造、不要求用户复制；返工确认是否原链；senior 升级开新链后更新）：DEV-09 收工；DEV-10 builder→reviewer→qa→supervisor 全 PASS 收工＋真机实证。
- 未闭环评审意见（code-reviewer/qa 留的还没改的）：P2 池（DEV-09-FINAL 2 项、DEV-10 P1-1 量词口径/P1-2 计数口径等）；AI 真整理未接（占位）；分享页未做。
- docs 落盘清单（本轮新增/改了哪几个 docs 文件）：mobile 全量（untracked）、docs/pm/PRODUCT_PLAN_V1.0.md（V1.5）、docs/review/R1～R5＋CODE_REVIEW_DEV-01～10、docs/qa/BUGS_DEV-01～10＋evidence-android-t062/＋evidence-android-ui/、两账本（TASK 15 行/DISPATCH 70 行上下）、本 HANDOFF。
- 下一步（Next Single Action）：恢复后三选一——① 用户在真机亲自登录后跑 T062 真云联调；② 冷启动接线 P1-1（sweep＋session 恢复＋scheme 监听接入 _layout）；③ P2/分享/AI 页。构建保持冻结（用户未批打包）。
- 人要拍什么板（列出来问，不问不许开工）：暂停中无人要拍。HD-01～HD-05 已决；HD-03 redirect 已加白实证；mobile key 已填（gitignored，值不入文档）。

## 小交接快照（2026-09-18 19:10，开发暂停）

### 1. 当前工作进展
- 计划：PRODUCT_PLAN_V1.5（92 分，R5 终审，PLAN_GATE=APPROVED，DEV_BASELINE 锁定），HD-01=B 连续开发。
- 开发：DEV-01→DEV-10 全收工。mobile/ 从零到 8 页全功能读本地库（画廊/记录表单/详情/发现筛选/标签维度父子/Tags CRUD/我的同步状态/冲突裁决/AI 占位），206 tests 全绿，根 Web 零改动、根 build 每次回归 PASS。
- 真机（红米 Note12 Pro，adb 双机之一 ruby）：Expo Go＋adb reverse 连 Metro（8082）实证——8 卡画廊、4 星筛 6 条、标签建删、输入保存删全链，证据 docs/qa/evidence-android-ui/＋t062/；设备已还原干净（8 条演示）。
- 基础设施：HD-03 redirect 已加白；mobile/.env 已填 publishable key（连通 RPC 200/null 实证）；Metro  PID 以恢复时现查为准（曾用 8082，勿占 3000/3100）。
- 账本：docs/model/TASK-MODEL-LOG.jsonl（15 行）＋DISPATCH-LOG.jsonl（约 70 行），双校验 OK；supervisor 累计打回 0/2。
- git 状态：分支 wanghoufan/master（注意不是 main），未 commit 未 push（上一轮 jcp 指令被小交接 supersede，中止未执行）。

### 2. 下一步任务（按序）
1. T062 真机登录：用户本人在手机上点 Google 登录（凭据不代输），随后跑真云同步＋删除防复活＋跨端，
2. 冷启动接线 P1-1：`sweepFingerprints/recoverSession/subscribeAuthCallbacks/getInitialAuthUrl/attachAuthAutoRefresh` 接入 `mobile/app/_layout.tsx`，
3. P2 收尾＋分享/AI 页（T086–T120 范围），
4. 打包（Development Build/EAS）——用户明确批准前冻结不动。

### 3. 注意事项及相关规矩
- 模型调度铁律（用户定）：换人只听用户口令；备注只写实派模型/通道，不写原因推断；codex 状态未知不假设，按表派、失败报用户。
- 用户另派智能体的文件（如经验记录）一律不碰不删；未知归属文件动前先问。
- 密钥红线：真值只进 mobile/.env（gitignored），不入 Git/文档/聊天/截图；service_role 绝不碰。
- 未经明确指令禁 git commit/push；push 需二次确认（分支以用户指令为准）。
- 真机三件套：`adb -s indq5xfi6hovay4d`（ruby 红米）＋ `adb reverse tcp:8082 tcp:8082` ＋ Expo Go 输 `exp://127.0.0.1:8082`；本机无 Java/SDK，打包走 EAS；dev-client 已移除（Expo Go 可直连，打包前加回，见 mobile/docs 备注）。
- 已知坑：SQLite 禁子查询 ORDER BY 引外层列（改 COALESCE 双标量）；Metro 缓存旧包时 `--clear` 重启；`adb input text` 会追加不覆盖；toast 会盖按钮等几秒；/tmp 禁读写（opencode 权限）；别碰用户手机上别的 App。

- 人要拍什么板（列出来问，不问不许开工）：本轮无。HD-03 redirect 已加白实证；mobile key 已由我经 Dashboard API Keys 页取 publishable key 填入 `mobile/.env`（gitignored，不进 Git，值不入文档/聊天），连通性实证：RPC public_share_read 200/null（S2 同口径），直读表 401（anon 零表权限符合预期）；真机首验 PASS（红米 Note12 Pro：Expo Go＋adb reverse 连 Metro，Record/Gallery 四 tab 渲染，limited-picker 选 2 张→持久目录→缩略图→首图封面全链实证，证据 docs/qa/evidence-android-t062/ 3 张；OAuth 真登待用户在真机亲自完成）。
- permission_request（可选：原文/决策/回执一句，首版可先记自然语言一句）：无。
- 收尾记一笔（neat-freak：文档对齐了没、临时文件清了没、未决列完没；neat 派完后 TM 补记，若已落盘则追加修订行）：铁律补记——用户另派智能体的文件（如经验记录）一律不碰、不删，留原地；未知归属文件动前先问。模型调度铁律（2026-09-18 用户定）：换人只听用户口令，用户点谁就换谁；派工备注只写实派模型/通道，不写原因推断；codex 状态未知时不假设，直接按表派，失败则报用户定夺。

## 恢复读盘（全体系唯一顺序，别乱）

1. AGENTS；2. 角色卡；3. 根 `USER_MODEL_OVERRIDE.md`；4. 本 HANDOFF；5. 根 `经验一句话.md`；6. 任务目标放最后。
冲突才扩大读。

## 本轮迁移执行链（审计用）

- 源包：`/Users/zzymima0000/Developer/coding/4.Templates（PC）/2026-09-09 丨 MAC 丨 ORCA V2.1 治理模板 丨 分发版-2026-09-11/老项目迁移模板包`（整条原样引用，命令中用引号包裹）
- 冲突铁律执行：放 36（含归位表模板复抄 docs/templates/ 一份）／备份 3（AGENTS.md.旧版-2026-09-13、USER_MODEL_OVERRIDE.md.旧版-2026-09-13、docs/handoff/HANDOFF.md.旧版-2026-09-13）／跳过 0
- USER_MODEL_OVERRIDE.md：旧实文件已备份删除，现为软链→分发版根母版真源（`…/分发版-2026-09-11/USER_MODEL_OVERRIDE.md`）；与旧实文件差一行 db-admin 行（母版多 db-admin 记录），改母版即全项目同步；跨机器断链时拷实文件并在此记一笔。
- 账本示例行：docs/model/ 下两表示例行（各一行 `_example`）已于本轮删除（首个真实任务/派工前），文件现为空。
- 映射（搬了会 broken，留原地＋治理引用路径）：
  - 根 `HANDOFF.md`（旧入口指针，被 README/旧 AGENTS 引用）→ 留原地；治理交接以 `docs/handoff/HANDOFF.md` 为准，历史细节见 `docs/handoff/HANDOFF.md.旧版-2026-09-13`
  - `docs/handoff/HANDOFF.md.旧版-2026-09-13`（2026-09-07 在役快照全文，旧路径 `1.Active/ing…` 为历史绝对路径，读时以相对 docs 为准）
  - `scripts/deploy.sh`（项目规范部署 Docker V1.1，被旧 AGENTS/旧交接引用）→ 留原地；模板 `scripts/orchestration/` 为新增并存
  - `docs/` 下既有业务证据（acceptance-l2、db、qa、review 内旧文件、visuals、V1_PRODUCT_AND_TECHNICAL_PLAN.md）→ 全部留原地不碰
- 基线（2026-09-18）：`npm install` PASS（仅 allow-scripts 提示）；`npm run build`（tsc -b + vite build）PASS（仅 chunk>500kB 与 dynamic/static 复用警告）；lint/test：package.json 无对应脚本，记 N/A（未拿 lint 卡 dev）。
- 目检：dev（127.0.0.1:5173，后台起，验后已杀，端口已释放）`/` 200、` /mine` 200；无 computer-use 条件，curl 替代截图（无截图文件），SPA 详情页为前端路由故以 `/mine` 为详情页代表。
