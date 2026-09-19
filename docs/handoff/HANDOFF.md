# HANDOFF｜交接（暂停/恢复用，先读我）

> 旧版字段（governance-state / Evidence / Human Gate / Promotion / Dispatch ID）已废弃，不填。

- Captured at（YYYY-MM-DD HH:MM）：2026-09-19 12:37 初稿（大交接封存；neat-freak 已过）；同日续修订——构建路线更新（EAS 10-01 前停用，改本地构建）、治理两案落地（runtime 枚举＋计划文件改名）
- PROJECT_PHASE：（DEVELOP——暂停中，恢复后继续；基线锁定 V1.5 不动）
- PLAN_VERSION：（PRODUCT_PLAN_V1.5）
- PLAN_READINESS_SCORE：（92）
- PLAN_GATE：（APPROVED——用户以“继续推进开发”批准 V1.5）
- DEV_BASELINE：（PRODUCT_PLAN_V1.5）
- CHANGE_REQUEST：（NONE）
- Stage ID（本阶段叫什么）：DEVELOP-安卓APP连续开发（基线 V1.5；MVP Gate T001–T085 为内部检查点）
- 剩 P0（没完的才列，多一条都不行）：
  - **T062 真机登录（阻塞中）**——需 Development Build；Expo Go 做不了自定义 scheme 回跳，根因与实证见 §1.3。**构建路线＝本地构建（EAS 10-01 前停用，用户 2026-09-19 定）；动构建前须用户批准。**
- 当前 Task（正干到哪）（累计打回 n/2，supervisor每次打回时TM同步更新）：暂停封存，**无在途 Task**。上一 Task=TASK-DEV-13 已收工 PASS（reviewer 打回 1 次已闭环；supervisor 口径打回 0/2）。本轮新增 T062 阻塞诊断（根因已定位，未派 builder）。
- 执行链/Session（可选，仅真 resume 通道填，普通 subagent 可空；TM 只记录/引用，ID 由基础设施返回，不手造、不要求用户复制；返工确认是否原链；senior 升级开新链后更新）：DEV-12 收工；DEV-13 初审打回→返工→R2放行→qa→supervisor 全闭环收工。本轮 neat-freak 文档对齐收工（本窗口 subagent）。
- 未闭环评审意见（code-reviewer/qa 留的还没改的）：P2-1/P2-2/P2-3（后续）；AI 真整理未接；neat-freak 提案 P-1～P-10 未拍板（见 §3.5）。
- docs 落盘清单（本轮新增/改了哪几个 docs 文件）：`docs/prompts/Orca 通用编排者持续推进协议.md`（十卡→十一卡）、`docs/templates/归位表.md`（账本/软链表述改不可过期口径）、本 HANDOFF；`DISPATCH-LOG.jsonl` +1 行（89→90，neat-freak 派工）；收尾续改——`.gitignore`（+/temp/）、`AGENTS.md`（runtime 枚举+`codebuddy`）、`docs/roles/supervisor.md`（脚本枚举同步）、`docs/pm/PRODUCT_PLAN_V1.0.md`→`V1.5.md`（改名+文头状态注）、`mobile/src/db/schema.ts:5`（仅注释内计划文件路径）、`docs/handoff/接续恢复开发提示词丨2026-09-19.md`（新增，永久留档）；P-1 落地 7 处——`AGENTS.md`×2、根 `编排者提示词.md`×2、`docs/roles/experience-recorder.md`、`docs/handoff/HANDOFF.template.md`、`docs/templates/归位表.md`。
- 下一步（Next Single Action）：见 **§2.1**——解 T062 阻塞（构建路线已定＝本地构建；动构建/装环境等用户批准）。
- 人要拍什么板（列出来问，不问不许开工）：见 **§2.4**（4 项，含 commit/push 目标分支）。
- permission_request（可选：原文/决策/回执一句，首版可先记自然语言一句）：—
- 收尾记一笔（neat-freak：文档对齐了没、临时文件清了没、未决列完没；neat 派完后 TM 补记，若已落盘则追加修订行）：neat-freak 已过——机械错位 4 处已修；归属不明文件 **无**；未决 10 项已列（§3.5）；临时文件无残留；**已 commit + push**（ee4aad6 → origin/master 主干）。同日续：P-1/P-2/P-3/P-4/P-10 已决并落地（含两包同步三处 diff 全零），余 P-5/P-6/P-7/P-8/P-9 为低危提案，不阻塞，待有空处理。

## 恢复读盘（全体系唯一顺序，别乱）

1. AGENTS；2. 角色卡；3. 根 `USER_MODEL_OVERRIDE.md`；4. 本 HANDOFF；5. 经验文档＝`docs/handoff/DEV_EXPERIENCE.md`（本项目定案，原“根 经验一句话.md”弃用，见 §3.5 P-1）；6. 任务目标放最后。
冲突才扩大读。

---

## 大交接快照（2026-09-19，开发暂停封存，neat-freak 已过）

### 1. 当前工作进展

**1.1 计划（已锁定，不动）**
- `PRODUCT_PLAN_V1.5`（文件已对齐为 `docs/pm/PRODUCT_PLAN_V1.5.md`——2026-09-19 用户拍板由 V1.0 名改名并加文头状态注），Readiness 92，R5 终审，`PLAN_GATE=APPROVED`，`DEV_BASELINE` 锁定，HD-01=B 连续开发。
- 分工表已按母版转本项目**实文件**（旧软链已删，备份 `USER_MODEL_OVERRIDE.md.旧版-2026-09-13` 留存）；builder=codebuddy/deepseek-v4.1-flash，主备链见表。

**1.2 开发（全部收工）**
- **DEV-01→DEV-13 全收工**；两次真打回（DEV-03 P1×3、DEV-13 证据口径）均已闭环；**supervisor 累计打回 0/2**。
- `mobile/` 8 页全功能＋分享页＋冷启动接线＋P2 大扫除；**240 tests 全绿**；**根 Web 零改动**，根 `npm run build` 每次回归 PASS。

**1.3 【本轮新发现】T062 真机登录卡死——根因已定位（不是 login 功能坏了）**
- 现象：用户在红米上点「使用 Google 登录」，Google 页打开后一直通不过去。
- 实证三条（可复跑）：
  - `adb -s indq5xfi6hovay4d shell pm list packages | grep -iE "placejournal|exponent"` → **只有 `host.exp.exponent`（Expo Go）**，没有 `com.wanghoufan.placejournal`（dev build 不存在）。
  - `adb -s indq5xfi6hovay4d shell pm query-activities -a android.intent.action.VIEW -d "com.wanghoufan.placejournal://auth/callback"` → **返回空**（全机无人注册该 scheme）。
  - 对照 `... -d "exp://127.0.0.1:8082"` → 命中 `host.exp.exponent.LauncherActivity`；前台卡在 `com.android.chrome/CustomTabActivity`。
- 机制：`mine.tsx:76` → `login()` → `openAuthSessionAsync(url, 'com.wanghoufan.placejournal://auth/callback')`（`mobile/src/supabase/redirect.ts:43` 硬编码 HD-02 基线值）→ 认证完成后跳自定义 scheme → 系统找不到处理者 → `openAuthSessionAsync` 永远等不到 `type:'success'` → UI 停在「正在打开登录…」。
- 定论：**这是环境不匹配，不是 bug**。PRODUCT_PLAN 本就写死「Expo Go 不能承担此类 OAuth，应使用 Development Build」；T062 前置也写「使用 Development Build 而非 Expo Go」。**不能为在 Expo Go 里跑通而临时改 redirect 到 `exp://`**（PLAN 禁临时 scheme，且要改 Supabase allow list）。
- 本机工具链实测：Android SDK **有**（`platforms/android-35`、platform-tools、cmdline-tools）；**Java 无**；**build-tools 无**；**`expo-dev-client` 未装**；`eas` CLI 有、`eas.json` 的 `development` profile 已备（`developmentClient:true`+`buildType:apk`）；`eas whoami` 访问 `api.expo.dev` **失败待确认**（沙箱可能挡网／CLI 版本旧）。

**1.4 真机与基础设施**
- 真机＝红米 Note12 Pro（ruby），serial `indq5xfi6hovay4d`；**已实证**：8 卡画廊、评分筛、标签建删、输入保存删、Find 量词、冷启动渲染；证据 `docs/qa/evidence-android-ui/`＋`t062/`；设备已还原干净。
- Metro 8082（**恢复时现查 PID/端口**，勿占 3000/3100）；`adb reverse tcp:8082 tcp:8082` **会掉**，本轮恢复时实测为空需重建。
- 注意：同机还挂着另外 3 台设备（`IN9LZTAYV4UGU4JF`、两个 `192.168.31.31`）；**只操作 `indq5xfi6hovay4d`**，别碰用户手机上别的 App。
- HD-03 redirect 已加白；`mobile/.env` 已填 key（gitignored，值不入文档）。

**1.5 账本（实测已校验）**
- `docs/model/TASK-MODEL-LOG.jsonl` **19 行**（role 仅 planner 1 / builder 18）；`docs/model/DISPATCH-LOG.jsonl` **90 行**，**全部 JSON 合法**、键集合统一 8 键。
- runtime 分布：`opencode` 58 / `本窗口` 17 / `codex` 9 / `codebuddy` 5（L81/83/85/86/88）。**枚举已扩**：2026-09-19 用户拍板把 `codebuddy` 加入 AGENTS 与 supervisor 脚本枚举，5 行存量转正（P-2 关闭）。
- 无 `_example` 示例行残留。

**1.6 git（已提交并推主干）**
- **本轮提交已推 `origin/master`（主干）**：主提交＝`chore: DEV-11→13 收工封存 + 大交接`（`ee4aad6`），其后为 HANDOFF 同步小提交；**精确 HEAD 以 `git log` 为准**（本文件自身在提交内，不写死自身 HEAD）。本地 `wanghoufan/master` 同进度。远程**只剩 `origin/master` 一条**：废弃分支 `origin/wanghoufan/master` 已于 2026-09-19 删除（删前已验证其无独有提交、零丢失）。仓库**无 `main` 分支**。
- 本轮提交 38 个文件（+2101/−60）：`USER_MODEL_OVERRIDE.md`(软链→实文件)、本 HANDOFF、两账本、neat-freak 改的 2 个 docs、`mobile/` 源码 19 改＋6 新增（分享页/冷启动接线）、`CODE_REVIEW_DEV-11/12/13.md`＋`BUGS_DEV-11/12/13.md`＋4 张 evidence png。
- **工作树现已干净**；`mobile/.env` 经 `git check-ignore` 确认被忽略，未入提交。
- 旁注：另一 worktree 的本机 `master` 分支（`…/coding/1.Active/011-ing-个人打卡小工具`）落后 origin/master 4 个提交，**本轮未动它**。

### 2. 下一步任务（按序）

**2.1 第一件事：解 T062 阻塞（构建路线已定，时机待用户拍板）**
- **构建路线（2026-09-19 用户已定，铁律）**：EAS 云构建免费额度耗尽（10-01 才恢复）→ **云构建停用**；今后一律**本地构建**（`npx expo run:android`）。
- **本地构建前置**：装 JDK 17＋`sdkmanager` 补 build-tools＋`expo-dev-client` 加回依赖——**动构建/装环境前必须用户明确批准（构建冻结）**。
- **备选**：等 10-01 EAS 恢复走云构建；或先绕开登录转 AI 页（需 `OPENCODE key`），T062 挂起。

**2.2 AI 页真接入**：需 `OPENCODE key`（用户给）；随后编辑确认；失败可跳过不阻断保存。

**2.3 分享真云发布 + 打包**：分享随 T062 一起验；打包（Development Build／EAS）**用户明确批准前冻结不动**。

**2.4 人要拍什么板（1 项，不问不许开工）**
1. **T062 时机**：批准补本地构建环境并开工（§2.1）／等 10-01 走 EAS／先转 AI 页。

> 已决并执行（2026-09-19）：commit/push 目标＝`origin/master` 主干；runtime 枚举加 `codebuddy`；`PRODUCT_PLAN` 改名对齐 V1.5；**构建路线＝本地构建、EAS 10-01 前停用**；构建冻结维持。

### 3. 注意事项及相关规矩

**3.1 模型调度铁律（用户定）**
- 换人**只听用户口令**；备注**只写实派模型/通道**，不写原因推断。
- 每次派前读根 `USER_MODEL_OVERRIDE.md`；表定通道（codex/opencode/codebuddy）的**必须走通道直调，禁本窗口套娃代做**；只有「本窗口」行才用 subagent 直派。
- 屏蔽词（额度耗尽/上限、一次性换人）全仓清零；技术性「一次性 code」等除外；codex 状态未知**不假设**。
- 账本：每次派工收工往 `docs/model/DISPATCH-LOG.jsonl` 记一行（`used` 恒填「主」），与派工显式两行互验。

**3.2 文件与密钥红线**
- **用户另派智能体的文件一律不碰、不删**；未知归属文件动前先问（本轮 neat-freak 复核结果：归属不明文件＝**无**）。
- 密钥真值**只进 `mobile/.env`**（gitignored），不入 Git/文档/聊天/截图/证据；`service_role` **绝不碰**。
- 不碰 `Services/`、`DockerData/`、`DockerBackups`；不改 `*旧版-*.md` 封存件。

**3.3 git 红线**
- 未经明确指令**禁** `git commit`／`git push`；push **二次确认**（主干=origin/master，本地分支 wanghoufan/master）。
- 禁 `git reset`／`checkout`／`stash`：工作树里有用户未提交的成果，误清理＝事故（风险 R-14）。
- 外部者分支用 `ext/` 开头。

**3.4 真机三件套与已知坑**
- 三件套：`adb -s indq5xfi6hovay4d` ＋ `adb reverse tcp:8082 tcp:8082`（**会掉，失联先重建**）＋ Expo Go 输 `exp://127.0.0.1:8082`。
- 已知坑：SQLite 禁子查询 `ORDER BY` 引外层列（用 COALESCE 双标量）；Metro 缓存旧包时 `--clear`；`adb input text` 追加不覆盖；toast 盖按钮等几秒；opencode 下 `/tmp` 禁读写、bash 禁 `cd` 禁串联；Expo Go 缓存顽固时 force-stop＋重进。
- **Expo Go 只配做 UI/SQLite 探针**；OAuth／scheme／权限／APK 相关验收一律 Development Build 起步（§1.3）。

**3.5 文档待拍板（neat-freak 本轮产出，均未动手）**
- **P-1｜经验文档真源【已决，2026-09-19 用户拍板：方案 A】**：读盘序与 recorder 口径统一改指 `docs/handoff/DEV_EXPERIENCE.md`，不再新建「一句话」文件（避免两份经验真源漂移）。已改 7 处：`AGENTS.md`（谁写哪表＋缓存五条）、根 `编排者提示词.md`（读盘序＋落盘清单）、`docs/roles/experience-recorder.md`（输出行）、`docs/handoff/HANDOFF.template.md`、`docs/templates/归位表.md`、本 HANDOFF 恢复读盘。**母版两包不动**（包内有根 `经验一句话.md`，机制对母版自洽）。
- **P-2｜runtime 枚举【已决并落地，2026-09-19】**：**真因＝母版本就带 `codebuddy`（母版 AGENTS 逐派行与 supervisor 脚本均为 `本窗口/codebuddy/codex/opencode/—`），本项目迁移副本丢失**；已按母版原序补齐本项目两处（AGENTS＋`docs/roles/supervisor.md:40`），账本 5 行存量转正，校验脚本对 90 行真账本实测 `bad=0, exit=0`。
- **P-3｜`PRODUCT_PLAN_V1.0.md` 名/内容分叉【已决，2026-09-19 用户拍板：改名】**：已 `git mv` 为 `docs/pm/PRODUCT_PLAN_V1.5.md`＋文头加状态注（声明文中 `PROJECT_PHASE: PLAN`/`PLAN_GATE: READY_FOR_HUMAN_REVIEW` 为批准前快照，真源＝HANDOFF）；活动引注已同步（`mobile/src/db/schema.ts:5` 注释、本 HANDOFF）；4 份历史 RESEARCH_REVIEW 保原文不改（属历史审计记录）。原核验记录：文件名 V1.0／内容 V1.5，且 `:5/:239/:241` 为批准前快照；该问题早已登记（`docs/review/RESEARCH_REVIEW_PLAN-V1.4-R5.md:12` R5-N2）。
- **P-4｜T062 前置未登记**：PRODUCT_PLAN 无需改（本就写明须 Development Build）；缺口是没人把本轮 adb 实证写进文档——**本 HANDOFF §1.3 已补**，并把 Development Build 列为 T062 硬前置。
- **P-5｜本机口径不准**：HANDOFF 旧文写「本机无 Java/SDK」不准确——**SDK 在，缺的是 Java 与 build-tools**；另根 `AGENTS.md:98` Node 路径写 `22.22.2-2`，实际是 `22.22.2-3`（含 `current` 软链）；`AGENTS.md:108` 旧状态仍写 `HEAD=d1b2e4b`（现 ee4aad6）。**§1.4 已更正本 HANDOFF 口径；根 AGENTS 属附录历史段，建议只加注。**
- **P-6｜软链制与实文件冲突**：`AGENTS.md:45` 仍写「分工表软链制…禁拷实文件」，现实是本项目已按用户指令转实文件。建议补一句「本项目按用户 2026-09-18 指令用实文件，软链制仅约束未转实文件的项目」。
- **P-7｜2 张角色卡复述模型 ID**：`docs/roles/planner.md:6`、`docs/roles/senior-expert.md:4` 硬写 `codex/gpt-5.6-sol`，其余 9 张均为「见 override 表」。当前值无错但会静默过期，建议改成同口径。
- **P-8｜他人文件引注漂移（neat-freak 未越权改）**：`docs/handoff/DEV_EXPERIENCE.md:52` 称「HANDOFF.md:25 登记了 HD-01 交付切片」——**该引文在 HANDOFF 全文不存在**，实际出自 `PRODUCT_PLAN_V1.0.md:224`。建议交 experience-recorder 修。
- **P-9｜行号引注过期**：`docs/qa/BUGS_DEV-13.md:38` 引 `HANDOFF.md:59`（实际在 `:55`）；`BUGS_DEV-12.md:28` 引 HANDOFF:59「仍写现为软链」已过期；`mobile/docs/AUTH_REDIRECT.md §2` 仍写「HD-03 待办／无法代加 allow list」，与「已加白实证」矛盾。**本 HANDOFF 已重写，行号引注需在恢复后统一校正。**
- **P-10｜两包同步【已执行，2026-09-19】**：本轮唯一母版级治理改动＝`Orca 通用编排者持续推进协议.md`（十卡→十一卡两行，neat-freak 修）；已同步 `新项目模板包/`、`老项目迁移模板包/`，**三处 diff 全零复核通过**（包间、包↔项目）。AGENTS/supervisor 卡经查**母版本就含 `codebuddy`**（项目迁移副本丢失，已按母版对齐），无需回写母版；P-1 为本项目特例，不同步母版。两包路径见 §存档。

---

## 存档：本轮迁移执行链（审计用）

- 源包：`/Users/zzymima0000/Developer/coding/4.Templates（PC）/2026-09-09 丨 MAC 丨 ORCA V2.1 治理模板 丨 分发版-2026-09-11/老项目迁移模板包`（整条原样引用，命令中用引号包裹）
- 冲突铁律执行：放 36（含归位表模板复抄 docs/templates/ 一份）／备份 3（AGENTS.md.旧版-2026-09-13、USER_MODEL_OVERRIDE.md.旧版-2026-09-13、docs/handoff/HANDOFF.md.旧版-2026-09-13）／跳过 0
- USER_MODEL_OVERRIDE.md：2026-09-18 用户亲令按母版逐字转实文件（旧软链已删，备份留存；跨机器用实文件，无断链问题）。QA-DEV12-01 关闭（TM 判定：非代码问题）。
- 账本示例行：`docs/model/` 下两表示例行（各一行 `_example`）已于首个真实任务/派工前删除。
- 映射（搬了会 broken，留原地＋治理引用路径）：
  - 根 `HANDOFF.md`（旧入口指针，被 README/旧 AGENTS 引用）→ 留原地；治理交接以 `docs/handoff/HANDOFF.md` 为准，历史细节见 `docs/handoff/HANDOFF.md.旧版-2026-09-13`
  - `docs/handoff/HANDOFF.md.旧版-2026-09-13`（2026-09-07 在役快照全文，旧路径 `1.Active/ing…` 为历史绝对路径，读时以相对 docs 为准）
  - `scripts/deploy.sh`（项目规范部署 Docker V1.1，被旧 AGENTS/旧交接引用）→ 留原地；模板 `scripts/orchestration/` 为新增并存
  - `docs/` 下既有业务证据（acceptance-l2、db、qa、review 内旧文件、visuals、V1_PRODUCT_AND_TECHNICAL_PLAN.md）→ 全部留原地不碰
- 基线（2026-09-18）：`npm install` PASS（仅 allow-scripts 提示）；`npm run build`（tsc -b + vite build）PASS（仅 chunk>500kB 与 dynamic/static 复用警告）；lint/test：package.json 无对应脚本，记 N/A（未拿 lint 卡 dev）。
- 目检：dev（127.0.0.1:5173，后台起，验后已杀，端口已释放）`/` 200、`/mine` 200；无 computer-use 条件，curl 替代截图（无截图文件），SPA 详情页为前端路由故以 `/mine` 为详情页代表。
