# RESEARCH_REVIEW｜Place Journal Android V1

- Plan Version（评的是哪版 PRODUCT_PLAN）：PRODUCT_PLAN_V1.2（文件现名 `docs/pm/PRODUCT_PLAN_V1.0.md`）
- Review Round（第几轮）：R3（2026-09-18）
- Result：FAIL｜R2-03 已关闭；R2-01、R2-02 未能以当前审阅基线验收，仍有两项 blocking P1，不能进入 Human Gate。

- P0 / P1 / P2：
  - P0：无。R1 的媒体 DAG 与 OAuth PKCE 主合同仍清楚，未发现新增计划 P0。
  - P1：
    - **R2-01｜未关闭｜TASKS 摘录/原包不可验收。**V1.2 首段宣称“内联 SDD TASKS 可审阅摘录与 RF-01～RF-08 执行覆盖层”，但 177 行计划正文中没有 TASKS 附录、任务标题、稳定包路径、版本或摘要。工作区及上级四层目录、Git 全 refs 均未发现 Android SDD/TASKS 或 zip；因此无法按要求以 `unzip -p` 读取权威包，亦无法抽查 T012、T040、T054、T067、T077 中任意 3–5 条与内联原文逐字对照。现有仅为 T 编号引用，不是可独立验收的任务摘录。
    - **R2-02｜未关闭｜MVP/完整 V1 两段 Gate 仍未落地。**V1.2 仍只在 HD-01 写“先验收 P0 内部 MVP，再进入 P2”或“一次性 T001–T120”，P0 条目没有 MVP 的任务编号、明确 DoD、首段发布物或不可延期验收清单；P2 仍将 Final Phase/Production AAB-ready 列为可后置，同时 P0 Basic History 要求“最终 Manifest、安全、升级、Web 回归和跨端真机验收”。两处直接冲突，Builder 仍无法判定首段 PASS 的边界。
    - **HD-02～HD-05｜仍为 blocking P1。**identity/EAS 归属、Redirect URL 授权、真机与双账号资源、SecureStore 取舍尚须 Human 明确确认；它们不是 Planner 可自行消除的事项。
  - P2：Play 上架时的政策复审继续作为 Change C 条件；不计为本 APK Gate。

- Key Assumptions（逐条列＋是否成立）：
  - Android 只新建 `mobile/`、不替换 Web/PWA：**成立**；边界清楚。
  - R2-01 的权威 TASKS 已被内联并可与包原文复核：**不成立/未验证**；审阅基线没有摘录或 zip。
  - R2-02 的 MVP 与完整 V1 已形成两个独立、可执行 Gate：**不成立**；只有意图，没有任务级切片与 DoD。
  - R2-03 的回调去重不会保存 code/token，且中断后可恢复：**计划层成立**；仍待原生真机验证。

- Verified Facts（已验证事实＋证据）：
  - V1.2 Technical Approach 已把 fingerprint 持久字段限定为 `fingerprint_hash/status/received_at/updated_at/expires_at/error_class`，并明确禁存 code、token 和完整 callback URL。
  - 状态机规定 `received → exchanging → succeeded`，超过两分钟或进程/网络中断时先读有效 session；无 session 转 `terminal_reauth`、永不重用旧 code、展示重新登录入口；24 小时 TTL 与三处 sweeper 时机均明确。DoD 已覆盖重复 deep link、换码中断、冷启动、无 session 重登和无敏感值落盘。
  - 官方 Supabase PKCE 文档说明 code 只能交换一次，需新 access token 时须从头重启认证流程；该约束与 V1.2 的 `terminal_reauth` 路径一致（https://supabase.com/docs/guides/auth/sessions/pkce-flow）。
  - 本轮只读检查中，计划文件为 177 行；`find`、Git 历史与 refs 均未找到可供 `unzip -p` 使用的 Android SDD/TASKS zip。

- External Sources（Web Search / Web Fetch / 官方文档 / 官方 GitHub / 第三方 / 社区反馈，附链接）：
  - [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)：授权 code 有五分钟有效期且仅可交换一次；需新 token 时重启流程。该事实支持“不重放旧 code”的恢复策略，不替代真机验证。
  - 沿用 R2 已核验的 Expo OAuth、ImagePicker、EAS APK 与 Supabase React Native 文档；本轮无新增竞品断言。

- Competitor Findings（竞品现状＋对本 Plan 的启示）：
  - 无新增。现役 Web/PWA 仍只是行为基准，不作为 Android 运行可行性的证据。

- Counter-evidence（反对证据＋成功的相反做法）：
  - 不必把完整 120 条 TASKS 全部复制进产品计划；但至少须内联本轮引用的 3–5 个权威任务原文，或给出可读 zip 的稳定相对路径、包内路径、版本和 SHA-256，才能独立复核。
  - 不必把所有 P2 变成 MVP；但必须将最终 Manifest/安全/升级/跨端验收按“首段必需”或“完整 V1 才需”唯一归属，不能同时出现在 P0 与可后置 P2。
  - 指纹 hash 不能单独替代恢复策略；V1.2 已补 session-first/terminal reauth，且与一次性 PKCE code 的官方约束一致。

- Unverified Items（未验证项＋验证方法）：
  - 权威 Android SDD V1.2/TASKS zip：由 Planner 将包置入审阅基线或提供稳定可读路径；Reviewer 用 `unzip -p <zip> <member>` 抽查 T012、T040、T054、T067、T077 中至少三条，同计划内联摘录逐字比对标题、前置、DoD、证据与 RF 覆盖。
  - 两段 Gate：由 Planner 定义 MVP Gate 与完整 V1 Gate 的任务集合、每项 DoD、发布物、不可延期验收与通过条件；逐项消除 P0/P2 双归属后再审。
  - OAuth/SecureStore/redirect/RLS/Storage/跨端同步：Development/Preview Build 脱敏真机证据；不可用静态计划替代。

- Required Fixes（Planner 必须改项，打回依据）：
  1. **R3-01｜关闭 R2-01 的证据链。**补入实际 TASKS 内联摘录或可读 zip 的稳定路径、包内成员、版本与 SHA-256；逐条列出 T012、T040、T054、T067、T077（可另加 T050）的原文标题、前置、DoD/证据和 RF-01～RF-08 覆盖。不得仅保留 T 编号或“已内联”声明。
  2. **R3-02｜关闭 R2-02 的 Gate 冲突。**新增两个命名 Gate：MVP Gate 与完整 V1 Gate。各自必须列 Txxx 集合、通过产物、DoD、证据、是否允许进入下一段；将 Final Manifest、安全、升级、Web 回归、跨端验收各归属一个 Gate，并更新 P0/P2 与 HD-01 使其一致。

- Plan Readiness Score（分项打分＋合计，口径以 PRODUCT_PLAN.template.md 为准）：
  - 产品目标与用户需求（20）：19/20——目标、非目标与主要流程明确；首段验收边界仍不明确。
  - 核心方案完整性（20）：19/20——媒体 DAG、PKCE、SecureStore 和回调中断恢复已形成合同。
  - 外部事实与竞品验证（20）：15/20——官方 PKCE 约束已复核；运行事实及权威 TASKS 包仍不可审。
  - 技术可行性（15）：12/15——方案合理，但原生 build、OAuth callback、Storage、同步尚无实测。
  - 风险与异常场景（10）：9/10——R2-03 已补齐敏感值边界、TTL、sweeper 与不确定结果恢复；真机反证待实施。
  - 开发范围与 DoD（10）：6/10——TASKS 追溯不可验，MVP/完整 V1 的 Gate 冲突未消解。
  - 未决问题（5）：1/5——HD-02～HD-05 及两项评审 blocking P1 未关闭。
  - 合计：**81/100**。
  - Gate：**不通过**（Readiness < 90；计划 P0=0；blocking P1=6：HD-02～HD-05、R2-01、R2-02；关键运行事实和核心运行假设亦未完成合理验证）。

- Human-only Decisions（只需人类拍板项）：
  - HD-01 应在 R3-02 固化两段切片后再请人选择；HD-02～HD-05 仍保留，凭据不入文档或 Git。

- Next Action：**回 Planner 修订（Round 4）**。先关闭 R3-01、R3-02 并自评 Gate；未满足 Gate 前不得进入 `WAITING_HUMAN_APPROVAL` 或 `DEVELOP`。
