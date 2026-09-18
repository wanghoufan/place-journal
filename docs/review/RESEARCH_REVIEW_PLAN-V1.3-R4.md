# RESEARCH_REVIEW｜Place Journal Android V1

- Plan Version（评的是哪版 PRODUCT_PLAN）：PRODUCT_PLAN_V1.3（文件现名 `docs/pm/PRODUCT_PLAN_V1.0.md`）
- Review Round（第几轮）：R4（2026-09-18）
- Result：FAIL｜R3-01、R3-02 已由 V1.3 关闭并经本轮独立复核；新增 R4-01、R4-02 两项 blocking P1（另 R4-03 非阻塞 P1、R4-04 P2），Readiness 87/100 < 90，HD-01～HD-05 仍待人决，不能进入 Human Gate。

- P0 / P1 / P2：
  - P0：无。R1 的媒体 DAG 与 OAuth PKCE 主合同仍清楚，未见新增计划 P0。
  - P1：
    - **R4-01｜blocking｜token 存储表述自相矛盾，安全 DoD 不可验收。**User Flow 4（第 30 行）与 DoD/Auth（第 118 行）均写“禁止把 code 原文或 token 写入 SQLite、SecureStore、AsyncStorage…/…中无 code 原文或 token”，但 User Flow 5（第 31 行）、Technical Approach/Session storage（第 63 行）与 HD-05（第 230 行）又明确“access/refresh token 由 SecureStore adapter 持久化”。同一验收条目内“SecureStore 中可恢复 session”与“SecureStore 中无 token”互斥，Builder 与审计者无法同时满足；这是安全终局证据（T062/T109/T118）会直接踩到的判据矛盾。修订方向见 Required Fixes 1。
    - **R4-02｜blocking｜HD-01～HD-05 被计入 Gate 的 blocking P1，造成“永远进不了 WAITING”的逻辑死锁。**第 129 行先把 Gate 的 `blocking P1=0` 定义为“尚未解决的计划评审问题”，第 138–142 行却把五项 Human 决策（HD-01～HD-05）标成 “Blocking P1-01～05”，第 241 行再用“blocking P1=5（HD-01～HD-05）”判定“不得进入 WAITING”。但按 AGENTS 与 HANDOFF（第 19–20 行）的流程，HD 正是在 Human Gate（WAITING）由人拍板的内容；把只能在 WAITING 拍板的事项当作阻断 WAITING 的前置条件，使计划在逻辑上无法收敛。修订方向见 Required Fixes 2。
    - **R4-03｜非 blocking｜PKCE code_verifier 的持久化与“冷启动 callback”PASS 的可行性未写明。**Supabase 官方 PKCE 文档明确：code exchange 需要 code verifier，verifier 在发起流程时本地创建并存储，换码必须在发起流程的同一设备/存储上进行；且并发流程会覆盖旧 verifier。V1.3 要求真机验收“换码后杀进程、冷启动 callback”（第 118 行 T062 DoD），却未说明 verifier 落在哪个 adapter、是否跨冷启动可读，也未说明重叠流处理（默认单流或 `appendPkceFlowIdToRedirects`/`flowId`）。若不补齐，冷启动路径可能必然落到 `terminal_reauth`，DoD 不可达；有安全降级路径，故不阻断 Gate，但必须补写并加测。
  - P2：
    - **R4-04｜Appendix A 的 zip 相对路径未声明基准目录，可审计性打折。**第 177 行给的是 `../../../../Downloads/…`。若基准为 `docs/pm/`，其解析为 `…/Playground/Downloads/…`，与本轮实测绝对路径 `/Users/zzymima0000/Downloads/…` 不符；若基准为仓库根则成立。建议注明基准或直接给绝对路径（zip/member SHA-256 已锚定，属轻微问题）。
    - Play 上架政策复审继续作为 Change C 条件；不计为本 APK Gate。

- Key Assumptions（逐条列＋是否成立）：
  - Android 只新建 `mobile/`、不替换 Web/PWA：**成立**；边界清楚。
  - R2-01/R3-01 的权威 TASKS 已内联且可与包原文复核：**成立（本轮独立复核）**；zip/member 双 SHA-256、成员大小/行数、七条标题、全局前置规则与前置任务引用均逐项对上。
  - R2-02/R3-02 的 MVP Gate 与完整 V1 Gate 已互不冲突、终局项唯一归属：**成立**；P0/P2/HD-01 三处口径一致。
  - R2-03 的回调去重与中断恢复状态机可实施：**基本成立**；设计闭环、敏感值边界清楚，但 code verifier 持久化/重叠流未写明（R4-03）。
  - HD-01～HD-05 作为 Human 决策与 Gate `blocking P1=0` 的关系自洽：**不成立**；需澄清（R4-02）。

- Verified Facts（已验证事实＋证据）：
  - 本轮以只读管道独立复核（未解压、未落盘）：`shasum -a 256 <zip>` = `be4f94f42ef80d38c8d1db6295c3baaf16470cd7678496189e3e3a8ca8e92af2`，与计划第 178 行一致。
  - `unzip -p '<zip>' '*TASKS*' | shasum -a 256` = `a3dcd5d0384b32b1fb1dc2c20fc7414b32877547e600b653a31d2a2751e86442`、`| wc -l` = 343，与计划第 179 行（成员 18720 bytes、343 行、member SHA-256）一致；成员大小经 `unzip -l` 复核。
  - 逐字标题核对：T012、T040、T067（本轮要求至少三条）与加测的 T050、T054、T062、T077，七条原文标题与 Appendix A 第 181–215 行完全一致（如 T012 = `建立移动端领域类型并与 Web src/lib/types.ts 对照 — mobile/src/domain/types.ts`；T067 = `[US005] 实现 upload_media cloud dispatcher 与 remote path 落盘 — mobile/src/sync/push.ts`）。
  - 原包全局前置/证据规则（§0 Execution Rules，第 7–17 行）与计划第 180 行所述一致：按 phase 顺序、Foundational 未完成不得进入 User Story、`[P]` 为前置满足后可并行、验收任务补 `Evidence: <命令/设备/构建号/结果/必要截图路径或日志摘要>`、不记录 Secret/token/完整 OAuth callback URL、真机任务必写设备型号+Android 版本+build 标识。原包确未给普通实现任务逐条另写 DoD/Evidence 行，计划已如实标注“计划验收解释，不冒充包内原文”。
  - 前置引用真实存在：T011、T038/T039、T044–T049、T055/T061、T063–T066、T076 均在包内，支持 Appendix A 对 T012/T040/T050/T062/T067/T077 的前置表述。
  - Gate 边界核验：包内第 166 行 `T085 [US006] 真机执行浏览/编辑/删除/重启/跨端验收` 为 US-006 末项，第 175 行 `T086` 起为 US-007（P2），第 226–238 行为 Final Phase T108–T120；V1.3 的 `MVP Gate=T001–T085`、`完整 V1 Gate 新增 T086–T120/累计 T001–T120` 与包内 P1 主链→P2→Final Phase 结构一致，无双重归属。
  - OAuth 状态机：Supabase 官方 PKCE 文档确认 code 5 分钟有效且仅可交换一次，需新 token 须重启流程（沿用 R3 已核来源），与 `terminal_reauth`/不重用旧 code 一致；本轮新核“code verifier 本地存储、须同设备/存储换码、并发流覆盖旧 verifier”三点，支撑 R4-03。

- External Sources（Web Search / Web Fetch / 官方文档 / 官方 GitHub / 第三方 / 社区反馈，附链接）：
  - [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)（2026-09-18 复核）：code 5 分钟有效、一次性；code verifier 在发起时本地创建并存储、换码须在同一设备/存储；并发流会覆盖旧 verifier，需 `appendPkceFlowIdToRedirects`/`flowId` 隔离。用于 R4-03 与状态机可实施性判断，不替代真机验证。
  - 沿用 R2/R3 已核验的 Expo OAuth、Expo ImagePicker、EAS APK 与 Supabase React Native Storage 官方文档；本轮无新增竞品断言。

- Competitor Findings（竞品现状＋对本 Plan 的启示）：
  - 无新增。现役 Web/PWA 仍只是行为基准，不作 Android 运行可行性证据。

- Counter-evidence（反对证据＋成功的相反做法）：
  - token 不必移出 SecureStore：官方 RN 实践与 HD-05 都支持用 SecureStore 存 session；R4-01 是判据措辞需收敛，不是设计被推翻。
  - HD 不必在 WAITING 前全部拍板：Human Gate 本就是拍板处；“把 HD 当阻断 WAITING 的 blocking P1”是与流程相反的写法，应改掉。
  - 跨冷启动换码是官方支持能力（verifier 随 storage adapter 持久即可）：R4-03 是补写说明与加测，不是方案不可行。

- Unverified Items（未验证项＋验证方法）：
  - Expo 组合/`expo-doctor`、redirect allow list、SecureStore session 恢复/刷新/清除、RLS/Storage upsert、EAS 签名连续、Android↔Web 跨端：Development/Preview Build 脱敏真机证据，不可用静态计划替代。
  - code verifier 持久化位置、跨冷启动换码、重叠流处理：T055/T056 单测 + T062 冷启动真机（R4-03）。
  - Appendix A zip 相对路径基准：注明基准或改绝对路径（R4-04）。

- Required Fixes（Planner 必须改项，打回依据）：
  1. **R4-01｜消除 token 存储判据矛盾。**将 User Flow 4 与 DoD/Auth 的“禁止/不得含 code 原文或 token”限定为“去重指纹记录、SQLite、AsyncStorage、日志、截图与证据中不得出现 code 原文或回调一次性 token”，并显式写明“session access/refresh token 由 SecureStore adapter 持久化”为该禁令的明确例外；确保 DoD/Auth 可被单一、无歧义地判定。
  2. **R4-02｜理顺 HD 与 Gate-blocking 的计数口径。**将 HD-01～HD-05 从“Blocking P1-01～05”改归 Human Decisions Needed（仍为必答项），明确它们在 Human Gate（WAITING）拍板、不计入“blocking P1=0”的 Gate 门槛；并同步修订第 129 行与第 241 行的 Gate 自判，使评审项清零后计划可进入 WAITING。
  3. **R4-03（非阻塞）｜补写 PKCE code verifier 路径。**说明 verifier 由哪个 storage adapter 持久化、如何在杀进程/冷启动后仍可换码，并对并发/重叠流程给出默认单流或 `appendPkceFlowIdToRedirects`/`flowId` 的处理；在 T055/T056/T062 增加对应单测与真机条目。
  4. **R4-04（P2）｜标注 zip 路径基准**（或直接给绝对路径），保留 SHA-256 定位句。

- Plan Readiness Score（分项打分＋合计，口径以 PRODUCT_PLAN.template.md 为准）：
  - 产品目标与用户需求（20）：19/20——目标、用户、非目标、十一条流程与 owner mismatch 恢复体验明确；交付分段待 HD-01。
  - 核心方案完整性（20）：18/20——媒体 DAG、PKCE、两段 Gate、升级/权限边界完整；R4-01 在安全判据处存在自相矛盾，code verifier 路径未写明。
  - 外部事实与竞品验证（20）：18/20——本轮独立复核 TASKS 证据链（zip/member 双 SHA、行数、七条标题、全局规则）成立；redirect allow list、EAS 归属、RLS/Storage 与真机运行仍未验证。
  - 技术可行性（15）：12/15——路径与现役 Web 语义相容；Expo 组合、PKCE 冷启动、SecureStore、RN Storage、Activity 回收与跨端同步仍待真机证明。
  - 风险与异常场景（10）：9/10——R1 各项控制到位；安全判据措辞矛盾（R4-01）与 verifier 路径（R4-03）待补。
  - 开发范围与 DoD（10）：8/10——七条 TASKS 可逐字复核、RF-01～RF-08 无空覆盖、两 Gate 无冲突；DoD/Auth 判据自相矛盾（R4-01）与 Gate 计数口径（R4-02）需修。
  - 未决问题（5）：3/5——R3-01/R3-02 经本轮复核确认关闭；新增 R4-01/R4-02（blocking）与 R4-03/R4-04，HD-01～HD-05 仍待人决。
  - 合计：**87/100**。
  - Gate（进 Human Review 条件）：Readiness >= 90 AND P0 = 0 AND blocking P1 = 0 AND 关键事实已验证 AND 核心假设已合理验证
  - Gate 自判：**未通过**。Readiness 87 < 90；计划 P0=0；blocking P1=2（R4-01、R4-02）。TASKS 证据链与两段 Gate 已确认关闭，但 token 存储判据矛盾、HD/Gate 口径死锁未消，且 Redirect allow list、Expo/EAS 归属、运行组合、SecureStore、RLS/Storage、OAuth 与跨端同步等核心运行假设仍待 Human 条件与 Phase2 真机证据。不得进入 `WAITING_HUMAN_APPROVAL` 或 DEVELOP。

- Human-only Decisions（只需人类拍板项）：
  - HD-01｜交付切片 A/B 二选一：仍待拍板；R3-02 已把两段 Gate 固化，故现在具备拍板条件。
  - HD-02～HD-05｜App identity/EAS 归属、Supabase redirect 授权、真机与双账号资源、SecureStore 取舍：仍为待人决项；凭据不入计划或 Git。上述五项不因 R4 结论而视为已决。

- Next Action：**回 Planner 修订（Round 5）**。先关闭 R4-01、R4-02（并补 R4-03、R4-04）后自评 Gate；未满足 Gate 前不得进入 `WAITING_HUMAN_APPROVAL` 或 `DEVELOP`。
