# BUGS

- Task: TASK-DEV-14 回归 QA（**非真机段**；真机段另派）
- QA: qa（本窗口，只读业务代码＋亲手执行命令；只写本文件，不改业务代码，未 commit/push）
- 日期：2026-09-20
- 范围：`mobile/src/features/account.ts`＋`__tests__/account.test.ts`、`mobile/app/(tabs)/mine.tsx` 绑定/退出接线、`mobile/app/auth/callback.tsx:29` 文案、`mobile/src/supabase/auth.ts` `getLoginState`
- **QA 结论：PASS** —— P0=0、blocking P1=0；code-reviewer 三条 P1 全部实证收敛；260/260 tests 全绿（基线 240 精确不回归）；4 项命令全绿；根 Web／`mobile/android/`／`mobile/package.json` 零改动。已列 3 条非阻塞观察项（O-1～O-3）。
- 命令铁律：关键门禁命令均为**单命令单动作**（`npm --prefix mobile ...` / `git ...`），未 `cd`、未出仓库根；前期探查阶段曾用复合命令（`cd &&`）只作只读定位，未产生任何状态变更，不计入门禁证据。

## 一、执行证据（逐条，亲手执行）

| # | 命令 | 结果 | 证据摘要 |
|---|---|---|---|
| 1 | `npm --prefix mobile run typecheck` | PASS（exit 0） | `tsc --noEmit` 零输出、零报错；`mobile/tsconfig.json:17-22` 的 `include` 覆盖 `**/*.tsx` → `mine.tsx`／`callback.tsx` 均在检查范围内 |
| 2 | `npm --prefix mobile test` | PASS（exit 0） | Test Suites: **32 passed / 32**；Tests: **260 passed / 260**；Snapshots 0；Time 1.815s；无失败/无跳过；仅 `migrations.test.ts` 的 `console.debug` 既有噪音（`[db] expected-columns reconcile: +N`） |
| 3 | `npm --prefix mobile run lint` | PASS（exit 0） | **0 errors / 3 warnings**，全部落在 `mobile/src/features/__tests__/shares.test.ts`（6:51、20:32 `import/no-duplicates`；81:10 `count` 未使用）＝DEV-13 起的 carry-over（QA-DEV13-01），**非本任务引入、本任务文件零 warning**；日志仅回显 env **变量名**，未回显值 |
| 4 | `git status --porcelain` | 见「三」 | **10 行**（`M`×7 ＋ `??`×3）；根 `src/`、`api/`、`public/`、`index.html`、根 `package.json`／`vite.config.ts` **零条目** |
| 5 | `git diff HEAD --stat -- mobile/package.json mobile/package-lock.json mobile/android` | PASS（零输出） | 空输出＝**这三处相对基线零改动**（P1-1 收敛的直接证据） |
| 6 | 旧文案全仓扫描（`已开始同步`／`导出后切号`） | PASS | 业务代码**.ts/.tsx 零命中**；命中的全部是「注释里写禁令」「测试里断言 `not.toContain`」「docs 历史记录/评审原文」，无一处是可运行文案 |

### 测试增量核对（证明「240 基线不回归」不是估的）

- 新增用例计数：`account.test.ts` 15 例（`it(` 计数）＋ `auth.test.ts` 新增 5 例（`git diff` 中 `^+  it(` 计数）＝ **+20**。
- 本轮总数 260 − 新增 20 = **240**，与基线（DEV-13 QA 记录 `Tests: 240 passed / 240`）**逐字吻合** → 既无删测、也无静默跳过，属纯增量全绿。

## 二、code-reviewer 三条 P1 收敛抽查（逐条实证）

| 打回项 | 结论 | 证据（可核） |
|---|---|---|
| P1-1｜`mobile/package.json` 范围扩散（新增 `expo-dev-client` ＋ `android/ios` 改 `expo run:*`） | **已收敛** | `git diff HEAD` 对 `mobile/package.json`／`package-lock.json` **零输出**；`package.json:51-52` 已恢复 `"android": "expo start --android"`／`"ios": "expo start --ios"`；全文件 **无 `expo-dev-client`** 行 |
| P1-2｜文案失实（match 分支仍称「已开始同步」） | **已收敛（走推荐的 A 方案）** | `mobile/src/features/account.ts:58` = `'登录成功。本机已绑定该账号，同步接线后自动进行。'`；单测 `account.test.ts:65-70` 断言**逐字相等**且 `not.toContain('已开始同步')`；`mine.tsx` 内旧的内联 `describeLogin` 已整段删除，改为从 `@/features/account` 导入（`mine.tsx:15`，调用于 `mine.tsx:81`）→ 全仓仅此一份口径 |
| P1-3｜`showSignOut` 在 `unbound` 下自定恒 true（超范围） | **已收敛** | `account.ts:33` = `showSignOut: state.binding !== 'unbound'`；注释 `account.ts:16-20` 已改为「仅 match / mismatch 显示；unbound 不显示」；单测 `account.test.ts:32-38`（unbound → `showSignOut:false`）与 `account.test.ts:48-54`（mismatch → `showSignOut:true`）**两条期望均已按拍板口径落盘**；`mine.tsx:184-186` 改为由 `actions.showSignOut` 条件渲染 |

补充：reviewer P3-1 登记的 `callback.tsx:29` 也已核对——该行现为 `text: describeCallbackOwnerMismatch()`，与 Mine 侧共用 `OWNER_MISMATCH_HINT`（`account.ts:39`），全仓无「导出后切号」可运行文案。

## 三、范围与越界核对（`git status --porcelain` 全量 10 行）

- `M`×7：`AGENTS.md`、`docs/handoff/HANDOFF.md`、`docs/model/DISPATCH-LOG.jsonl`（治理/账本，非本任务 QA 判定范围）；**DEV-14 交付 4 件**＝`mobile/app/(tabs)/mine.tsx`、`mobile/app/auth/callback.tsx`、`mobile/src/supabase/auth.ts`、`mobile/src/supabase/__tests__/auth.test.ts`。
- `??`×3：`mobile/src/features/account.ts`、`mobile/src/features/__tests__/account.test.ts`（本任务新增）、`docs/review/CODE_REVIEW_DEV-14.md`（他人产出，未动）。
- **根 Web 零改动**：`src/`、`api/`、`public/`、`index.html`、根 `package.json`、`vite.config.ts` 在 `git diff HEAD` 中零条目。
- **`mobile/android/` 零改动**：`git diff HEAD --stat -- mobile/android` 零输出；且未出现任何未跟踪文件（`git status --porcelain -uall` 亦无 `mobile/android` 条目）。
- **包名/scheme/redirect 未动**：`mobile/app.json`／`app.config.*`／`eas.json`／`mobile/docs/AUTH_REDIRECT.md` 均在 status 中**零条目**。
- `mobile/package.json`／`package-lock.json` 亦零改动（P1-1 收敛证据，见「二」）。

## 四、DoD ①–⑤ 逐条核对（静态＋单测口径，真机段另派）

| 条目 | 结论（非真机段可达口径） | 证据 |
|---|---|---|
| ① 已登录且 owner 未绑定时 Mine 显示「确认绑定本机数据」→ 二次确认 → `bindOwner(当前userId)` → 刷新「已绑定 xxxxxxxx…」 | 逻辑接线**齐备** | 可见性：`accountActions` `account.ts:32` → `mine.tsx:189-198` 渲染按钮＋未绑定提示；二次确认：`mine.tsx:288-295` `ConfirmDialog`（标题/正文 `account.ts:84-91` 明示「不迁移、不删数据」）；写入：`mine.tsx:109` `getAuthService().bindOwner(userId)`（`auth.ts:321` → `deps.ownerStore.setBoundOwner`）；刷新：`handleBindOwner` finally `await load()` → `refreshLoginState()` → `mine.tsx:177` 由 `summary.owner` 渲染 `已绑定 <前8位>…` |
| ② 绑定后出现「退出登录」（`signOut()`，不删本地业务数据） | **成立** | 按钮由 `actions.showSignOut` 门控（match/mismatch＝已绑定才显示）；`auth.ts:317-319` `signOut()` 仅 `deps.auth.signOut({ scope: 'local' })`，**无任何本地业务表写操作**（无 `deps.ownerStore`／db 调用） |
| ③ owner 未绑定不得再显示「登录成功，已开始同步。」 | **成立** | 见「二」P1-2；`account.test.ts:58-77` 三处 `not.toContain('已开始同步')` 全绿 |
| ④ mismatch 只给阻断原因＋「重登原账号」；不实现导出后清空切号 | **成立** | `account.ts:39` 单一恢复句；`OWNER_MISMATCH_HINT` 被 Mine（`mine.tsx:188`）与 callback（`callback.tsx:29`）共用；全仓「导出后切号」可运行文案零命中；无 `unbindOwner` 新调用点（`unbindOwner` 仍零 UI 调用，符合「不实现」） |
| ⑤ 约束：不碰根 Web、不改 `mobile/android/`、不改包名/scheme/redirect、不 commit/push、不改其他角色 docs、既有 240 tests 不回归、新增逻辑有单测 | **全部成立** | 见「一」「三」；新增逻辑单测：`account.test.ts` 15 例覆盖三个动作可见性三态、七类登录结果文案、mismatch 同口径、绑定确认/成功文案；`auth.test.ts` 新增 5 例覆盖 `getLoginState` 四态＋读 session 失败降级 |

## BUGS

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| —（无） | — | No | — | — | TASK-DEV-14 | 本次非真机段回归 QA **未发现阻塞缺陷**；非阻塞观察项见「五」 |
| QA-DEV14-01 | P3 | No | `npm --prefix mobile run lint` → 3 warnings（`mobile/src/features/__tests__/shares.test.ts` 6:51／20:32／81:10） | Open（DEV-13 起 carry-over，同 QA-DEV13-01） | TASK-DEV-14 | exit 0；仅测试文件、非本任务引入、不影响门禁 |

## 五、观察项与未验证项（明示边界，不冒认）

- **O-1｜派工通道与模型表存在偏离（治理观察，供 supervisor 抽查，非代码缺陷）**：根 `USER_MODEL_OVERRIDE.md` 的 qa 行为「普通 QA（回归/校验/DoD）走 `codex/gpt-5.6-luna` 直调」，本任务为非真机段回归 QA，实际在**本窗口**执行（窗口自述模型 `deepseek-v4.1-flash`）。按 HANDOFF §3.4「本窗口直派的角色照实写实际模型」如实登记，请 TM／supervisor 判是否需要补记或改派。
- **O-2｜reviewer 已降级的 P2 仍未闭环（非本轮门禁项）**：P2-1 `getLoginState` 把「读 session 失败」吞成 `signed_out`（`auth.ts:328-335`，用例 `auth.test.ts` 明确断言降级为 `signed_out`）；P2-2 `describeUnboundHint`（`account.ts:80`）仍写「绑定后才会与该账号同步」。二者**内部自洽**（实现与用例一致），仅属排障性/未来时表述，reviewer 已明确留作后续任务，**不构成本轮 blocker**；附带影响：Mine 侧 `refreshLoginState` 的 catch 会把「存储故障」显示成「未登录」（无退出入口），与 P2-1 同源，建议同批修。
- **O-3｜UI 接线层无自动化用例，须真机段兜住**：`mine.tsx`／`callback.tsx` 的渲染与交互无组件测试基建（全仓 jest 只覆盖纯逻辑/服务层）。本轮仅静态核对接线（`auth.ts`－`mine.tsx`－`account.ts` 三处调用点逐一对齐），**实际渲染、点击、刷新后的 UI 变化未验证**。
- **未验证项**：① 真机 UI（绑定按钮出现/二次确认/归属变「已绑定」/杀进程持久化/退出后本地数据条数不变/owner 阻断走查）**全部未验**，待真机段；② 高德/网络与 Supabase 真连（本段不联网）；③ 原生构建（`mobile/android` 零改动，本段未重跑 gradle，留真机段随新 APK 一并核）。

## 真机QA会话能力预检结果（每真机session正式用例前必填，PASS才进正式QA，否则停）

> 本轮为**非真机段回归 QA**，未开真机 session，按模板口径**不适用**，不填不冒认；禁跨 session／跨模型／跨 Runtime 拼 PASS。

- 日期/任务名：2026-09-20 / TASK-DEV-14（非真机段回归 QA）
- session ID：（不适用）
- 模型精确ID：`deepseek-v4.1-flash`（本窗口继承模型，照实记；表列普通 QA 应为 `codex/gpt-5.6-luna`，偏离见 O-1）
- Runtime：本窗口（codebuddy session；未走 codex 通道）
- 原生CUA是否实际注入：**不适用**（未使用 CUA，未伪称已注入）
- 可用工具精确名称：（不适用）
- CLI备用入口是否存在（Bash→orca computer CLI）：未检测（不适用）
- Orca Runtime（`orca status --json` 实时结果，禁沿用旧报告）：未检测（不适用）
- 能力（`orca computer capabilities --json` 实时结果）：未检测（不适用）
- 权限（`orca computer permissions --json` 实时结果）：未检测（不适用）
- 读屏结果：N/A
- 截图结果：N/A
- 点击并恢复结果：N/A
- 输入并清除结果：N/A
- 滚动及可见位移结果：N/A
- 界面恢复确认（无残留）：N/A（本轮零 UI 操作）
- 最终结论（枚举只许 `PASS / BLOCKED_TOOL_NOT_INJECTED / BLOCKED_ORCA_APPROVAL / BLOCKED_RUNTIME / BLOCKED_OS_PERMISSION / FAIL_UNVERIFIED_ACTION / NOT_VERIFIED`）：`NOT_VERIFIED`（本轮非真机会话）
- 原始错误摘要：无
- 是否允许进入正式QA（全PASS才YES，否则NO即停）：**N/A（本轮非真机链）**；真机段另派时须重跑本预检并全 PASS 才进正式用例

## Fix Attempt Fingerprint

- Task ID: TASK-DEV-14（reviewer 打回 1 次后的收敛轮）
- Root Cause Hypothesis: 首轮交付把「绑定 UI」做成了超范围改动＋失实文案＋自定可见性口径——即「范围边界未守死 + 文案未与未接线的同步引擎现状对齐」。
- Approach: 只读核对＋亲手执行 4 项门禁命令；对三条 P1 逐条定位到行号与对应用例断言，验证「实现/注释/单测」三处口径一致；用测试增量算术（260−20=240）证明基线不回归。
- Files Changed: 无（仅新增本 QA 文档 `docs/qa/BUGS_DEV-14.md`）
- Verification: 见「一、执行证据」「二、P1 收敛抽查」「三、范围核对」「四、DoD 逐条」
- Failure Reason: 无 blocker（唯一新增条目 QA-DEV14-01 为 P3 carry-over）
- Difference From Previous Attempt: 首轮（codebuddy 通道 `EADDRINUSE` 挂起 48 分钟零落盘）**无交付可测**；本轮为可测工作树，QA 首次拿到实体证据，结论 PASS

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。

## 真机段（TASK-DEV-14 真机走查，T062 剩余两项前置验证）

- QA：qa（本窗口 adb 直驱；只操作 `indq5xfi6hovay4d`，未碰同机其他设备/其他 App，未卸载任何应用，未改业务代码，未 commit/push，未碰 `Services/`/`DockerData/`/`DockerBackups`；`mobile/.env` 只读未打印）
- 日期：2026-09-20；Metro 端口 **8083**（现查：8082 被 027 项目占用未动，3000/3100 禁用）；截图/UI dump 只放 `/tmp/dev14_ui*.xml`，未入库
- **真机段结论：① PASS / ② PASS / ③ PASS / ④ 边界记录（按任务口径不冒认）**

### 0. 能力预检（PASS，全绿才进正式用例）

| 项 | 证据摘要 |
|---|---|
| `adb -s indq5xfi6hovay4d get-state` | `device` |
| 目标包已安装 | `package:com.wanghoufan.placejournal` |
| Metro 8083 | 本轮新起（`npx expo start --port 8083`，PID 71409，`lsof` LISTEN 确认；`curl 127.0.0.1:8083` 返回 500 系 bundler 正常态） |
| `adb reverse --list` | 原状 `tcp:8083 tcp:8083`；冷启动阶段临时加 `tcp:8081 tcp:8083`（dev-client 默认读 8081，见下），走查结束已 `--remove` 恢复原状 |

- Metro 首包曾 `Web Bundling failed … wa-sqlite.wasm`（web 平台事，与真机无关）；`Android Bundled 3517ms … (1577 modules)` 成功后 App 正常渲染。

### 1. 重建 APK（PASS）

- 命令：`cd mobile/android && ./gradlew --no-daemon -Dorg.gradle.jvmargs='-Xmx4096m -XX:MaxMetaspaceSize=1536m' -Dkotlin.daemon.jvm.options='-Xmx2048m' :app:assembleDebug` → `BUILD SUCCESSFUL in 5m 24s`（353 tasks, 323 executed）
- 实体：`app-debug.apk` **237,488,961 字节，mtime 2026-09-20 12:24:14（本轮新生成）**
- 包名：`package: name='com.wanghoufan.placejournal' versionCode='1' versionName='0.1.0'`；签名：`CN=Android Debug`；scheme：`com.wanghoufan.placejournal`、`exp+place-journal` 均在 manifest 内

### 2. 安装（PASS，走 MIUI 绕行链）

- `adb push … /data/local/tmp/dev14-debug.apk`（237MB，2.366s）→ `adb shell pm install -r -t …` → `Success` → 已删临时包
- `-r` 保留数据实证：`firstInstallTime=2026-09-20 10:37:33`（上轮值保留），`lastUpdateTime=2026-09-20 12:24:38`；`pm query-activities … "com.wanghoufan.placejournal://auth/callback"` → `1 activities found → MainActivity`

### 3. 冷启动加载（PASS）

- `am force-stop` 后 `am start -a android.intent.action.VIEW -d "com.wanghoufan.placejournal://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8083"` → `mFocusedApp=…com.wanghoufan.placejournal/.MainActivity`；uiautomator dump 读到画廊 tab（`共 0 条记录`）→ JS 加载成功
- 点击坐标一律 uiautomator 真实 bounds（例：我的 tab `[810,2136][1080,2270]`→(945,2203)；确认绑定 `[91,991][989,1123]`→(540,1057)）

### 4. 用例逐条

| # | 用例 | 结论 | 证据（adb/UI dump 原始输出摘要） |
|---|---|---|---|
| ① | Mine 出现「确认绑定本机数据」→二次确认→确认→归属变已绑定 | **PASS** | 初态 Mine：`本机归属＝未绑定`＋`确认绑定本机数据 [91,991][989,1123]`；点后弹二次确认：标题`把本机数据绑定到这个账号？`＋正文`绑定后本机数据归属账号 3e0acd69…，只与该账号同步；换用其他账号会被阻断…本机数据不会被删除。`＋`取消/确认绑定`；点`确认绑定 [557,1334][959,1466]`后 Mine 变为`已绑定 3e0acd69… [605,532][989,590]`＋出现`退出登录 [689,703][989,835]`＋确认绑定按钮消失 |
| ② | 杀进程重进仍显示已绑定（持久化） | **PASS** | `am force-stop`→deep link 重进→Mine 仍`已绑定 3e0acd69…`＋`退出登录`按钮在（首次 dump 恰逢列表未聚焦，重 tap 后复核一致；SecureStore/ownerStore 持久化实证） |
| ③ | 先播种 2 条再退出→退出后条数不变 | **PASS** | Record 页建 `qatestplacea/qaarea`、`qatestplaceb/qaarea`（详情页＋画廊`共 2 条记录`双重确认）；退出前 Mine：`地点 / 记录 2 / 2`、照片 0、标签 0、`待上传 4 项`；点`退出登录 (839,769)`后：`已退出登录（本地数据保留）。`＋`地点 / 记录 2 / 2`、照片/标签/`待上传 4 项`全部不变；退出按钮消失（仅剩`使用 Google 登录`）；归属保持`已绑定 3e0acd69…`（signOut 不解绑，符合 `unbindOwner` 零 UI 调用设计） |
| ④ | owner mismatch 阻断走查 | **边界记录，不冒认** | 代码：`createNativeSyncEngines()` 全仓仅定义零调用（grep 唯一命中 `nativeSync.ts:30`）→同步引擎未接线，push/pull 真机不可达；`push.ts:181`/`pull.ts:188` 的 `assertOwnerForSync` 接线存在＋`owner.test.ts:31-40` 单测覆盖 mismatch/unbound 抛 `OwnerBindingBlockedError`（非真机段 260 全绿已含）；UI：mismatch 文案口径 `account.ts:39/44/49` 与 Mine/callback 共用且单测断言一致，但真机触发需第二 Google 账号切号（动用户 Chrome 账号，超范围未做）。结论：端到端阻断**未验证**，待同步接线任务后重走 |

### 5. 清理与副作用声明

- QA 播种的 2 条记录已逐条经「详情→删除→确认删除」清除；终态画廊`共 0 条记录`、Mine`地点 / 记录 0 / 0`、照片/标签 0；outbox `待上传 8 项`系播种＋删除操作的离线队列堆积（同步未接线故滞留，符合离线优先设计，非缺陷）
- 绑定态保留：`本机归属＝已绑定 3e0acd69…`（用户本人账号，T062 目标态）；登录 session 已退出（`使用 Google 登录`可重登）
- 误切说明：两次 `KEYCODE_BACK` 按 Android 任务栈语义浮现同机后台任务 `com.filllight.nightlamp`（026 项目 App），仅做只读 `dumpsys`/`uiautomator dump` 确认、**零点击零输入**，随后 deep link 切回我方；`reverse tcp:8081` 临时映射已移除，原状 `tcp:8083` 恢复
- 输入 quirks（供复跑）：HyperOS 输入法拒收 `adb input text` 拼音串，需追加 `KEYCODE_ENTER` 上屏；`input keyevent KEYCODE_*` 单字母同样被忽略；新地点名/区域均用纯小写无符号串（`qatestplacea`/`qaarea`）
