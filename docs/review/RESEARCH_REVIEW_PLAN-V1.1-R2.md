# RESEARCH_REVIEW｜Place Journal Android V1

- Plan Version（评的是哪版 PRODUCT_PLAN）：PRODUCT_PLAN_V1.1（文件现名 `docs/pm/PRODUCT_PLAN_V1.0.md`）
- Review Round（第几轮）：R2（2026-09-18）
- Result：FAIL｜R1 的两项 P0 与八项正文修订已基本形成可实施合同，但引用的 Android SDD/TASKS 不在工作区，且仍有三项 blocking P1；不能进入 Human Gate。

- P0 / P1 / P2：
  - P0：无。R1 P0-01 媒体 DAG 已明确为 `ensure_place → upsert_entry → upload_media → upsert_media_row → patch_entry_cover`，包含父失败阻断、重启续跑、幂等校准和 cover 乐观锁；R1 P0-02 也已确定为 Supabase-hosted Google OAuth + PKCE，定义了精确 callback、浏览器、error/code 分支、`exchangeCodeForSession` 与重复回调处理。
  - P1：
    - **R2-01｜blocking｜TASKS 映射不可独立验收。**计划反复以 T012–T013、T040/T050/T067/T077、T054–T062 作为硬门禁/验收定位，但当前工作区没有 Android SDD/TASKS 文件，无法核验这些任务是否存在、描述是否已同步，或是否真的把八项修订落实到可执行任务。仅在 PRODUCT_PLAN 中自称“映射”不构成可追溯性。
    - **R2-02｜blocking｜分段交付边界与 DoD/P0-P2 分类冲突。**HD-01 允许“P0 内部 MVP 后再做 P2”，但没有列出该 MVP 的精确任务/DoD；同时 Final Phase、Production AAB-ready 被列 P2，而 P0 的 Basic History 又包含最终 Manifest、安全、升级和跨端验收。Builder 无法判断何时可宣布首段通过、哪些 DoD 可延后，容易把 P2 工作误当 P0 验收或反之。
    - **R2-03｜blocking｜OAuth 回调去重缺少敏感值与失败恢复合同。**“持久化 `oauth_callback_fingerprint`”没有规定仅存不可逆 hash、保留期限/清理时机，亦未说明换码发生网络/进程中断等不确定结果后如何判定 session 已建立、何时允许用户重新发起登录。需要防止把授权 code 原文落盘，同时避免永远卡在 failed/重复状态或重复换码。
  - P2：
    - 建议把“未来进入 Google Play 时的政策复审”保留为 Change C 触发条件；它不应反向成为本轮 APK 的合规声明或 Gate 条件。

- Key Assumptions（逐条列＋是否成立）：
  - Android 只新增 `mobile/`、不替换 Web/PWA：**成立**；计划边界清楚。
  - 现役云端合同可在零生产迁移下复用：**部分成立**；已有 Web 证据，但 Android/RN 的 RLS、Storage、分享 RPC 操作组合仍须先由 matrix 和真机验证。
  - 媒体可按持久 DAG 可靠重放：**计划层成立，运行层未验证**；节点、依赖、幂等与失败语义已写清。
  - Development Build + 自定义 scheme 能承载 PKCE：**计划层成立，运行层未验证**；实际 redirect allow-list、EAS 归属、真机回调仍是 Human/实施验证项。
  - SecureStore adapter 足以缩小普通本地文件暴露面：**合理成立，不等于绝对防泄漏**；计划已正确保留 root、调试包、日志与屏幕泄漏边界。

- Verified Facts（已验证事实＋证据）：
  - V1.1 在 User Flow 6、Technical Approach 的“媒体 outbox”、R-16 与媒体 DoD 中一致描述了 Entry 父记录先成功、再 Storage/media/cover 的执行与重放顺序。
  - V1.1 在 User Flow 4、Auth、R-08 与 Auth DoD 中一致选择 PKCE，不再混用 implicit flow 或手工 token `setSession`。
  - V1.1 对 R1 RF-03 至 RF-08 均给出章节定位：合同 matrix 的范围/阻断准则、owner-mismatch 双恢复路、SecureStore 取舍、Photo Picker/Play 边界、覆盖升级三前置条件，以及未验证项和竞品范围限定均已写入正文。
  - 工作区内未发现 Android SDD/TASKS 源文件；因此所有 Txxx 映射均只能视为未验证引用，不能视为已闭环的证据。

- External Sources（Web Search / Web Fetch / 官方文档 / 官方 GitHub / 第三方 / 社区反馈，附链接）：
  - 本轮未新增外部断言，沿用 R1 已核实的 [Expo OAuth authentication](https://docs.expo.dev/guides/authentication/)、[Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)、[Expo EAS APK](https://docs.expo.dev/build-reference/apk/)、[Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native) 与 [Supabase Native mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking?platform=swift)。

- Competitor Findings（竞品现状＋对本 Plan 的启示）：
  - 无新增竞品事实。V1.1 已恰当地将现役 Web/PWA 定位为行为基准，并把不扩张到轨迹/社区功能视为范围决策，而非研究验证加分。

- Counter-evidence（反对证据＋成功的相反做法）：
  - 不必要求 Planner 此时写死 Expo patch 版本；以官方兼容安装、lockfile、`expo-doctor` 与 Development Build 验证的做法更稳妥。问题是任务源文件缺失，不是版本尚未锁死。
  - 不必把 Play 政策审查提前当作 V1 发布条件；系统 Photo Picker 优先和 merged manifest 证据足以约束当前 APK，未来上架再按届时政策复审。
  - 不能因已写“fingerprint”就推定不会保存授权 code，亦不能因“failed 不重试”就推定存在可恢复路径；这两项必须成为明示合同。

- Unverified Items（未验证项＋验证方法）：
  - Android SDD V1.2/TASKS 原文及 T012–T013、T040/T050/T067/T077、T054–T062：将权威输入纳入当前可审阅范围（或在计划中写稳定相对路径与不可变版本/摘要），逐条补任务正文、前置、DoD 与证据后复核。
  - App identity/EAS 归属、Supabase redirect allow-list、真机与双账号资源：由 Human 按 HD-02 至 HD-04 确认；凭据不入计划或 Git。
  - Expo 组合、SecureStore、PKCE callback、现有 RLS/Storage 与 Web↔Android 同步：以 Development/Preview Build 的脱敏真机证据验证，不能由静态计划替代。

- Required Fixes（Planner 必须改项，打回依据）：
  1. **R2-01｜关闭 TASKS 追溯缺口。**将 Android SDD/TASKS 权威文件置于本轮审阅基线，或在 PRODUCT_PLAN 写明其稳定相对路径、版本与每个 Txxx 的实际标题；逐项把 RF-01～RF-08 的前置、实现、测试/证据写入对应任务。若输入暂不可提供，删除“已映射/已关闭”的断言，改为未闭环。
  2. **R2-02｜固定 HD-01 的两个可验收切片。**明确“P0 内部 MVP”包括/排除哪些 Txxx 和每项 DoD，明确首段 PASS 的发布物与不可延期的安全/数据/升级验收；将 Final Phase、Production AAB、Manifest 与跨端验收重新归类或标注为首段/完整 V1 的不同 Gate，消除与 P0/P2 的矛盾。
  3. **R2-03｜补 OAuth 回调状态机。**为 `oauth_callback_fingerprint` 明确只存 code 的不可逆摘要（不落原 code/token）、状态/时间戳/TTL 与成功后清理规则；明确 exchange 结果不确定时先用现有 session 判定、无 session 时回到可见的重新登录入口，且每种状态映射到 T054–T062 的实现和真机测试。

- Plan Readiness Score（分项打分＋合计，口径以 PRODUCT_PLAN.template.md 为准）：
  - 产品目标与用户需求（20）：19/20——目标、用户、非目标与 owner-mismatch 体验明确；首段 MVP 的精确边界尚待固定。
  - 核心方案完整性（20）：18/20——媒体 DAG、PKCE、SecureStore、权限和升级约束已落成合同；OAuth 失败恢复状态机仍缺。
  - 外部事实与竞品验证（20）：15/20——沿用 R1 的官方与仓库证据，且正确不把竞品范围取舍计作验证；运行事实仍未实测。
  - 技术可行性（15）：12/15——路径合理，但 Expo 组合、真实 callback、SecureStore、RN Storage 和跨端同步尚未以原生 build 验证。
  - 风险与异常场景（10）：8/10——媒体、权限、升级和 owner 风险控制明显加强；回调不确定结果及持久化敏感值未闭环。
  - 开发范围与 DoD（10）：7/10——正文 DoD 细致，但 TASKS 缺失、P0/P2 分段矛盾，尚不可按任务实施或验收。
  - 未决问题（5）：1/5——既有 HD-01～HD-05 均未决，另有 R2 三项 blocking P1。
  - 合计：**80/100**。
  - Gate：**不通过**（Readiness < 90；P0=0，但 blocking P1=8：HD-01～HD-05 与 R2-01～R2-03；关键运行事实和核心运行假设尚未验证）。

- Human-only Decisions（只需人类拍板项）：
  - 沿用 HD-01～HD-05；其中 HD-01 须在 Planner 完成 R2-02 的两套明确切片后再供人选择，避免要求人对含混范围拍板。

- Next Action：**回 Planner 修订（Round 3）**。先关闭 R2-01～R2-03，并重新自评 Gate；届时再送 R3，未满足 Gate 前不得进入 `WAITING_HUMAN_APPROVAL` 或 `DEVELOP`。
