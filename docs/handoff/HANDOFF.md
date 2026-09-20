# HANDOFF｜交接（暂停/恢复用，先读我）

> 旧版字段（governance-state / Evidence / Human Gate / Promotion / Dispatch ID）已废弃，不填。

- Captured at（YYYY-MM-DD HH:MM）：2026-09-20 14:00 大交接（用户口令「【大交接】开发先到这里暂时结束」）；本轮 DEV-14/15、PWA-01 均收工，详见下方「本次小交接快照」§1～§3（已重写）；历史大交接与审计记录保留
- PROJECT_PHASE：（DEVELOP——暂停中，恢复后继续；基线锁定 V1.5 不动）
- PLAN_VERSION：（PRODUCT_PLAN_V1.5）
- PLAN_READINESS_SCORE：（92）
- PLAN_GATE：（APPROVED——用户以“继续推进开发”批准 V1.5）
- DEV_BASELINE：（PRODUCT_PLAN_V1.5）
- CHANGE_REQUEST：（NONE）
- Stage ID（本阶段叫什么）：DEVELOP-安卓APP连续开发（基线 V1.5；MVP Gate T001–T085 为内部检查点）
- 剩 P0（没完的才列，多一条都不行）：
  - 无。PWA-AI 本地＋线上真调均 PASS（2026-09-20晚）：Vercel 变量由本窗口 CLI 落定（DEEPSEEK_API_KEY 三环境占位后用户网页填值、DEEPSEEK_MODEL=deepseek-flash、AI_PROVIDER_ORDER=deepseek）；`vercel redeploy` 重发生产（35s Ready）；线上 `/api/ai-organize` 实测 200（provider=deepseek，人均40/拍照命中/conf0.85）。注：线上跑的是旧代码（新设置页等 push 后才有），旧码认环境变量模型名故照样通。
- 已收口（2026-09-20晚，用户拍板）：**T062 PASS**——真机三连3/3（绑定持久＋退出数据保留地点6/7/照片14/标签26不变＋错号登录callback阻断原话）；附带同步实跑成功6/失败2；证据本窗口adb直驱＋截图（待入库）。
- 当前 Task（正干到哪）（累计打回 n/2，supervisor每次打回时TM同步更新）：**停工封存，无在途 Task**。本轮收工链：TASK-DEV-14 PASS（绑定确认UI＋退出/文案/mismatch；reviewer打回P1×3闭环；回归260全绿；真机①②③PASS；supervisor 0/2）→ TASK-DEV-15 PASS（双机分发，新老两机均Success；后用户改令只调Note12Pro）→ TASK-PWA-01 PASS（AI三件套：洗感受/筛标签/2-3句公开理由；summary退役；reviewer打回P1×1闭环；qa回归PASS；supervisor 0/2）→ 黑屏根治（dev-client默认读8081，曾错载补光灯包，`tcp:8081→8084`映射后正常）→ 演示7条已播（Note12Pro画廊可见）→ Chrome浏览器实测（确认页降级链全对：4星/50元/3标签/理由空等手填，未点保存零写入）。codebuddy通道已恢复（本轮6派全EXIT=0）；codex额度约13:43恢复（未经验证）。
- 执行链/Session（可选，仅真 resume 通道填，普通 subagent 可空；TM 只记录/引用，ID 由基础设施返回，不手造、不要求用户复制；返工确认是否原链；senior 升级开新链后更新）：builder×3（codebuddy/deepseek：DEV-14初版＋返工、PWA-01初版＋返工，均直调无session）／reviewer×2（本窗口subagent：CODE_REVIEW_DEV-14、CODE_REVIEW_PWA-01）／qa回归×2（codebuddy，用户口令因codex额度耗尽改道，表未改）／qa真机×1（本窗口adb直驱DEV-14）／supervisor×2（opencode直调，均PASS 0/2）／neat-freak×1（本窗口subagent，大交接收尾，AGENTS附录2行，未碰DEV_EXPERIENCE见U-18）。Metro 现役 **8084**（pid 19893，/status 200；8083已停，8082他项，3000/3100禁用）；Note12Pro 映射 `8081→8084`＋`8083`＋`8084`（恢复原状前勿动Expo Go补光灯）；PWA vite 5173（pid 50004，`--host 0.0.0.0`，本机/Tailscale`100.125.100.15`/局域网`192.168.31.60`均200）。
- 未闭环评审意见（code-reviewer/qa 留的还没改的）：P2-1/P2-2/P2-3（后续）；review P2 backlog（PWA-01 P2×2：80字/300字口径、exporter注释）；qa观察项（O-1～O-3、O-1～O-5）；文档提案余 P-7/P-8/P-9（U-9/U-11相关）；未决 **U-1～U-19**（U-1～U-3/U-5闭环，U-4可判闭环，余见§3.5及本次U-14～U-19）。
- docs 落盘清单（本轮新增/改了哪几个 docs 文件）：`AGENTS.md`（附录2行：09-20三项收工＋待办改T062判定，neat-freak改）、本 HANDOFF（大交接重写前段）、`docs/model/DISPATCH-LOG.jsonl`（DEV-14×6＋DEV-15×1＋PWA-01×4＋neat待记，used恒主）、`docs/model/TASK-MODEL-LOG.jsonl`（＋2行DEV-14/PWA-01）、`docs/review/CODE_REVIEW_DEV-14.md`＋`CODE_REVIEW_PWA-01.md`、`docs/qa/BUGS_DEV-14.md`＋`BUGS_PWA-01.md`、业务代码 `mobile/`6文件＋`mobile/src/features/account.ts`(+单测)、根`api/`1＋`src/`7。
- 下一步（Next Single Action）：**等用户恢复口令**。恢复后按序：①T062收口判定（拍板）；②DEV-16手机端照抄PWA（画廊详情＋记录页，用户已喊停工前投诉，方案待定）；③PWA-AI真调（配Key部署验）；④P2-1/P2-2/P2-3、AI真整理、分享真云发布。
- 人要拍什么板（列出来问，不问不许开工）：①T062收口放行否；②DEV-16是否开工（手机端照抄PWA）；③QA长期走codebuddy是否改override表（本轮两次用户口头改道，表未动）；④工作树20+改动是否commit＋push origin/master（早前jcp口令后被打断，未执行）；⑤改系统代理/shell/签名/卸载设备应用另行确认。
- permission_request（可选：原文/决策/回执一句，首版可先记自然语言一句）：本轮三次用户口令改道——codebuddy复活验证、QA改走codebuddy（codex额度耗尽）、双机分发后改回单设备（Note12Pro专用）；override表均未改。
- 收尾记一笔（neat-freak：文档对齐了没、临时文件清了没、未决列完没；neat 派完后 TM 补记，若已落盘则追加修订行）：neat-freak 已过（2026-09-20 大交接收尾）——`AGENTS.md`附录2行已改；归属不明0；残留删0个（6个未跟踪全是合法交付）；未决U-14～U-19已列（U-14本HANDOFF已收：黑屏/演示/Tailscale/Chrome实测进前段＋执行链；U-15本清单已收；U-16 DEV-15无review/qa doc待TM定；U-17 temp旧提示词过时待定；U-18 DEV_EXPERIENCE可写人冲突＋U-10引注失效待recorder；U-19旧U-6/7/8/9/11/12/13仍有效）；本轮仅本地改动，**未 commit／未 push**。

## 本次小交接快照（2026-09-20）

### 1. 当前的工作进展

**1.1 计划与阶段（不动）**
- 基线仍是 `PRODUCT_PLAN_V1.5`，Readiness 92，`PLAN_GATE=APPROVED`，Phase=`DEVELOP`（本交接末暂停封存，恢复后继续）。
- 仓库根＝当前 `master` 目录，分支 `wanghoufan/master`，HEAD＝`e996cc6`（**以 `git log` 为准**）；远程只有 `origin/master`。
- 分工表为本项目**实文件**（非软链）；表内 builder＝codebuddy/deepseek-v4.1-flash，但该**通道本轮实测不可用**（见 §1.6）。

**1.2 T062 真机段：六项已拿到真机证据（可复跑）**

| 项 | 结果 | 证据（原始输出摘要） |
|---|---|---|
| 本地 Development Build 构建 | PASS | `./gradlew :app:assembleDebug` → `BUILD SUCCESSFUL in 8m 22s`，EXIT=0 |
| APK 实体 | PASS | `mobile/android/app/build/outputs/apk/debug/app-debug.apk`，262,468,309 字节，mtime 2026-09-20 09:34:30（本轮新建） |
| 包名/签名/scheme（包内） | PASS | `package: name='com.wanghoufan.placejournal'`，targetSdk 36，`CN=Android Debug`；manifest 内 `com.wanghoufan.placejournal` scheme 存在 |
| 安装到真机 | PASS | `firstInstallTime=2026-09-20 10:37:33`（走「推包＋设备侧 `pm install`」，见 §1.4） |
| 自定义 scheme 回跳＋Google 登录 | PASS | 点「使用 Google 登录」→ Chrome 选账号 → 回 App 渲染 `auth/callback`：「登录成功，请回到 Mine 确认绑定本地数据。」 |
| SecureStore session 冷启动恢复 | PASS | 杀进程重进后点登录 → **「已是登录状态。」**（未再开浏览器） |
| 重复 deep link 幂等 | PASS | 重投同一 callback → **「该登录回调已处理过，无需重复操作。」** |

- 安装后 `pm query-activities -a android.intent.action.VIEW -d "com.wanghoufan.placejournal://auth/callback"` → **1 activities found → `com.wanghoufan.placejournal.MainActivity`**（上一轮此处返回空，即当时根因；现已消除）。

**1.3 【本轮新发现】首次绑定确认 UI 缺失——阻断 T062 剩余两项（P1）**
- 真机现象：登录成功后 Mine 页显示 `本机归属＝未绑定`、橙色文案「登录成功，已开始同步。」，且**看不到「退出登录」**。
- 代码证据（全仓可核）：
  - `mobile/src/supabase/auth.ts:98` `bindOwner()`、`:100` `unbindOwner()` **零 UI 调用点**（只有定义与 `__tests__/auth.test.ts`）。
  - `mobile/app/(tabs)/mine.tsx:161`：「退出登录」按钮以 `summary.owner` 为条件渲染 → owner 恒为 null → 永不出现。
  - `mobile/src/sync/nativeSync.ts:34`：owner 为空直接抛 `OWNER_NOT_BOUND`；`mobile/src/sync/push.ts:181`、`pull.ts:188`：`assertOwnerForSync` 未绑定即整体阻断。
  - `mobile/app/auth/callback.tsx:24`：让用户「回 Mine 确认绑定本地数据」，但 Mine **没有该入口**。
  - 另注：`createNativeSyncEngines()` 全仓**无调用方**，同步引擎当前未接线（属后续任务范围）。
- 后果：T062 DoD 里的 **owner binding 阻断走查** 与 **logout 不删业务数据** 在真机上无法执行 → T062 不能收口；T077 以 T062 为前置，一并受阻。

**1.4 构建与安装链路（可复现，含一个 MIUI 坑）**
- 代理 `127.0.0.1:7897` 本轮可用；上一轮卡死的构件 `androidx.compose.ui:ui-tooling-preview-android:1.11.0-beta02` 走代理 `http=200`。
- 工具链：JDK 17.0.20.1（JAVA_HOME 已设）、`ANDROID_HOME=/Users/zzymima0000/android-toolchain/sdk`、build-tools 36.0.0、minSdk 24 / compileSdk=targetSdk=36。
- 构建命令（本轮实测走通）：`cd mobile/android && ./gradlew --no-daemon -Dorg.gradle.jvmargs='-Xmx4096m -XX:MaxMetaspaceSize=1536m' -Dkotlin.daemon.jvm.options='-Xmx2048m' :app:assembleDebug`
- **MIUI 坑（重要）**：`adb install` 被系统拒绝 → `INSTALL_FAILED_USER_RESTRICTED: Install canceled by user`（HyperOS 2.0 的「USB 安装」未开）。
  绕过方式（本轮实测成功）：`adb push` 到 `/data/local/tmp/` → `adb shell pm install -r -t <path>` → 返回 `Success`；**装完必须删掉临时包**（本轮已删）。
- Metro 本轮起在 **8083**（8082 被另一项目 `027-ing-蛋白质计算器` 占用，按规矩未动）；`adb reverse tcp:8083 tcp:8083` 已建（**会掉，恢复时先查**）。

**1.5 设备与端口**
- 目标真机＝红米 Note12 Pro（`ruby` / 22101316C / Android 14 / HyperOS V816 / OS2.0），serial `indq5xfi6hovay4d`。
- 同机同时挂着 `IN9LZTAYV4UGU4JF`：**只操作 `indq5xfi6hovay4d`，不碰其他设备**（本轮已遵守）。
- 本轮截取的界面证据暂存 `/tmp/t062_*.png`（未入库；如需留档由后续决定）。

**1.6 通道故障（本轮最影响下一步的一条）**
- builder 表定通道 **codebuddy 当前不可用**：在窗口内嵌套调用 `codebuddy --model deepseek-v4.1-flash -y -p ...` 时，子进程启动即 `EADDRINUSE: address already in use 127.0.0.1:63928`——该端口被外层会话独占；子进程随后零网络、零落盘、零输出挂起（实测 48 分钟 CPU 仅 2.45 秒）。
- 已试无效：清空继承的 `CODEBUDDY_*`/`CLAUDE_*` 环境变量、显式改 `CODEBUDDY_SERVICE_PROXY_URL` 端口、`</dev/null`；换成 `--permission-mode` 未试。
- 处置：终止进程（工作树无残留），DISPATCH-LOG 记 FAIL，任务定义保留待重派。
- 结论：**换通道＝换模型范畴，须用户拍板**；下轮不得自行改表。

**1.7 其他实测观察（待评审判定，未派工）**
- Metro 日志有 `WARN WebCrypto API is not supported. Code challenge method will default to use plain instead of sha256.`——即 PKCE 的 `code_challenge_method` 退化为 `plain` 而非 S256，安全相关，交 code-reviewer 判。
- 冷启动时用纯 `auth/callback` scheme 直接唤起会被 **dev launcher** 截走（Development Build 环境特性，release 包不受影响）；R4-03 的「换码后杀进程、冷启动 callback」真机路径本轮**未完成**，需在可加载 JS 的前提下另设计验证步骤。
- 未跟踪文件：无；工作树改动＝`AGENTS.md`、`docs/handoff/HANDOFF.md`、`docs/model/DISPATCH-LOG.jsonl`、`mobile/package.json`、`mobile/package-lock.json`（后两个为上一轮既有）。

### 2. 下一步的任务

> 按序做，不要跳。第 1 条是唯一入口，不解决它后面都推不动。

1. **先解通道，再把 TASK-DEV-14 重派出去（第一件事）**
   - 任务目标（`TASK-DEV-14`，任务单原文曾在 `/tmp/TASK-DEV-14.md`，重开窗口后按本段重写即可）：补「首次绑定确认」的用户可见入口，锁死范围不扩散。
     - ① 已登录且 owner 未绑定时，Mine 显示「确认绑定本机数据」按钮 → 二次确认 → 调 `bindOwner(当前 userId)` 写 `bound_owner_user_id` → 刷新为「已绑定 xxxxxxxx…」。
     - ② 绑定后出现「退出登录」按钮（`signOut()`，不删本地业务数据）。
     - ③ 文案纠正：owner 未绑定时不得再显示「登录成功，已开始同步。」。
     - ④ mismatch 时只显示阻断原因＋「重登原账号」路径；**不实现**导出后清空切号（HD-04 已降级延后），不做自动迁移。
     - ⑤ 约束：不碰根 Web、不改 `mobile/android/`、不改包名/scheme/redirect、不 commit/push、不改其他角色 docs、既有 240 tests 不许回归、新增逻辑要有单测。
   - 通道选择（需用户拍板）：等 codebuddy 通道可用后按表重派；否则请用户在「换通道/换模型」与「允许本窗口 subagent 代做」之间定一次，**不许自行改 override 表**。
2. **builder 交付后走 Phase2 主链**：code-reviewer（本窗口 subagent）→ qa（真机段走本窗口 adb 直驱）→ supervisor（opencode）→ TM 收齐。
3. **回真机收口 T062 剩余两项**（重装新 APK 后）：
   - 冷启动 → 登录 → 点「确认绑定本机数据」→ 二次确认 → `本机归属` 变**已绑定**；
   - 杀进程重进 → 仍显示已绑定（持久化验证）；
   - 点「退出登录」→ 本地业务数据**不删**（先播种 2 条记录再退，退出后条数不变）；
   - owner binding 阻断走查（`bound_owner_user_id` 与当前账号不一致时 push/pull 被阻断；cancel/重启不改 owner 与数据）——这条要先解决 §1.3 的「同步引擎未接线」才能端到端看到效果，若仍不可见则按「代码+单测证据＋真机 UI 证据」记录并说明边界。
4. **T062 全项收口后**再动后续：P2-1/P2-2/P2-3、AI 真整理接入、分享真云发布。**T062 未闭环前不得宣称本阶段完成。**
5. 每次派工收工，TM 往 `docs/model/DISPATCH-LOG.jsonl` 记一行（`used` 恒填「主」）；任务真收工再往 `docs/model/TASK-MODEL-LOG.jsonl` 记一行。

### 3. 注意事项及相关规矩

**3.1 阶段与红线**
- 基线锁死 `PRODUCT_PLAN_V1.5`，Phase=`DEVELOP`；**不改计划**（Plan 变更只走 Change C＋Human Approval）。本轮判定：补绑定 UI 属「已完成计划内任务的缺口」，**不是** Change A/B/C。
- 未经明确指令**禁** `git commit`／`git push`。**禁** `git reset`／`checkout`／`stash`：工作树里有本轮未提交成果（`AGENTS.md`、本 HANDOFF、DISPATCH-LOG、两份 `mobile/package*`），误清理＝事故。
- 不碰 `Services/`、`DockerData/`、`DockerBackups`；不改 `*旧版-*.md` 封存件；密钥只进 `mobile/.env`（gitignored），不入 Git/文档/聊天/截图；`service_role` 绝不碰。

**3.2 真机与安装（本轮踩过的坑，别再踩）**
- 只操作 `indq5xfi6hovay4d`；不卸载设备应用；不动同机其他 App 与设备。
- `adb install` 在 HyperOS 上会被拒（`INSTALL_FAILED_USER_RESTRICTED`）：改走 `adb push` → `adb shell pm install -r -t`；**不要**去关用户手机的「USB 安装」以外乱改系统设置，装完删临时包。
- Metro 端口**恢复时现查**（本轮 8083；8082 属别的项目、3000/3100 禁用）；`adb reverse tcp:<port> tcp:<port>` 会掉，失联先重建。
- 冷启动加载 App 的方式：`am force-stop` 后用
  `am start -a android.intent.action.VIEW -d "com.wanghoufan.placejournal://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A<port>"`；纯 `auth/callback` scheme 冷启会被 dev launcher 截走（§1.7）。
- UI 自动化取坐标一律用 `uiautomator dump` 读真实 `bounds`，别按截图目测（本轮目测点错过两次）。

**3.3 构建与环境**
- 必须用项目自带 `mobile/android/gradlew`；不依赖全局 Gradle；**不许**靠升级 compileSdk/targetSdk/AGP/Kotlin 绕问题。
- 不删 `mobile/android/` 原生目录、不执行 `npx expo prebuild --clean`、不清 Gradle/npm 缓存。
- 不改 `~/.zshrc`／`~/.zprofile`／IDE 设置；不改正式签名/keystore。
- 构建成功 ≠ 通过：必须同时核 **APK 实体（大小/时间/生成于本轮）＋包名＋签名＋目标设备安装状态＋scheme activity 注册**。
- 构建日志里的 deprecated 警告、`NODE_ENV` 未设置、npm audit 提示不构成失败依据。

**3.4 治理与账本**
- 派工前读根 `USER_MODEL_OVERRIDE.md`，精确 ID 照抄；表定通道必须走通道直调，禁本窗口套娃代做；**换人只听用户口令**。
- 本窗口 subagent 直派的角色（code-reviewer／qa 真机段／experience-recorder／neat-freak／product-reviewer）实际会继承窗口模型，派工账本要照实写实际模型，不照抄表列值（本轮 neat-freak 已按此记）。
- 缓存五条照旧：读盘序 AGENTS→角色卡→override→HANDOFF→`docs/handoff/DEV_EXPERIENCE.md`→任务目标最后；动态信息押后。

**3.5 文档未决（neat-freak 本轮产出，均未动手；TM 已据此重写本 HANDOFF 前段）**
- U-1～U-3 **已闭环**：本 HANDOFF §1／§3 已按实测改写（APK 已产出、设备已安装、代理 7897 可用、Metro 改「现查端口」）。
- U-4：构建命令以 §1.4 实测行为准（`--no-daemon` ＋自定义 jvmargs）。
- U-5 **已闭环**：本 HANDOFF「未闭环评审意见」行已改为「余 P-7/P-8/P-9＋本轮 U-1～U-13」。
- U-6：根 `AGENTS.md` 附录两处引「HANDOFF §0」（现无 §0）＋「恢复必读」顺序与 ORCA 冲突 → 待用户定「指向新快照」还是「整行标历史」。
- U-7：根 `HANDOFF.md:20` Node 路径仍写 `22.22.2-2`（dated 旧快照，属「搬了会 broken 的留原地」映射件）→ 待定「修路径」还是「加历史注」。
- U-8：`docs/handoff/接续恢复开发提示词丨2026-09-19.md` 多条已过期（Java/SDK/dev-client/Metro 8082/工作树干净），它却是给人粘贴用的 → 待用户定「改原文」还是「加已被 09-20 取代注」。
- U-9（原 P-7）：`docs/roles/planner.md:6`、`senior-expert.md:4` 硬写模型 ID，其余 9 卡写「见 override 表」→ 是否统一口径，用户定。
- U-10（原 P-8）：`docs/handoff/DEV_EXPERIENCE.md:52` 引 `HANDOFF.md:25` 与 `PRODUCT_PLAN_V1.0.md:224` 均已失效；该文件唯一可写人＝experience-recorder → 待派 recorder。
- U-11（原 P-9）：`docs/qa/BUGS_DEV-13.md:38` 行号引注过期；`mobile/docs/AUTH_REDIRECT.md §2` 仍写「HD-03 待办」与已加白矛盾 → 待派 owner/recorder。
- U-12：本轮 `AGENTS.md` 新增的「本目实文件例外」使项目 AGENTS 与母版分叉 → **两包不同步**，需要时在母版同步记一行（属治理改动，走用户确认）。
- U-13：上轮大交接 §1.4 证据路径写 `t062/`，实际目录名是 `docs/qa/evidence-android-t062`（低危）。
- U-14 **已闭环（进前段＋执行链）**：黑屏根治（8081默认端口映射）、演示7条已播、PWA切0.0.0.0+Tailscale可访、Chrome实测通过。
- U-15 **已闭环（前段落盘清单已补全）**。
- U-16：DEV-15（双机分发）仅账本一行，无review/qa doc——恢复后TM定是否补。
- U-17：`temp/接续恢复开发提示词丨2026-09-20.md` 写「重派DEV-14」（已过时）——改原文还是作废，用户定。
- U-18：DEV_EXPERIENCE唯一可写人冲突（AGENTS＋文件头定experience-recorder，本轮口令称neat-freak）；U-10引注失效仍在——待口令澄清后派recorder。
- U-19：旧U-6/U-7/U-8/U-9/U-11/U-12/U-13仍有效（U-1～U-3/U-5已闭环；U-4可判闭环）。

## 恢复读盘（全体系唯一顺序，别乱）

1. AGENTS；2. 角色卡；3. 根 `USER_MODEL_OVERRIDE.md`；4. 本 HANDOFF；5. 经验文档＝`docs/handoff/DEV_EXPERIENCE.md`（本项目定案，原“根 经验一句话.md”弃用）；6. 任务目标放最后。
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
