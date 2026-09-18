# RESEARCH_REVIEW｜Place Journal Android V1

- Plan Version（评的是哪版 PRODUCT_PLAN）：PRODUCT_PLAN_V1.0
- Review Round（第几轮）：R1（2026-09-18）
- Result：FAIL｜方向、范围和大部分技术约束可实施，但媒体依赖排序与 OAuth 回调落地仍留有 P0 主链缺口；并有 6 项 blocking P1，不能进入 Human Gate 或 DEVELOP。

- P0 / P1 / P2：
  - P0：
    - **P0-01｜媒体的父记录依赖未闭环。**计划只写“地点依赖”和 `upload_media`，未定义 Entry 已成功 INSERT 后才允许 media 表写入/Storage 上传，也没有明确 outbox 的依赖图、重放与失败次序。现役 Web 曾实测发生过 `media_entry_owner_fk`，修复是 `upsert_entry → upload_media → cover 回填`；若移动端按当前泛化顺序实施，多图 P0 主链会在首同步失败或产生不可重放状态。SDD TASKS T050/T067 必须补该依赖与真机/集成验收。
    - **P0-02｜OAuth 的返回、code 交换与会话写入不是可实施合同。**现有描述从 `signInWithOAuth(skipBrowserRedirect=true)` 直接跳到“system auth session → parse callback → session set”，没有固定 `redirectTo`、浏览器会话打开、回调中 error/code 处理、PKCE `exchangeCodeForSession`（或明确 implicit-flow）和幂等去重。Google 登录是 P0 和 RLS 前置；须在 PLAN/TASKS 写成一种确定流程并以 Development Build 真机证实。
  - P1：
    - **P1-01｜逐字段/逐操作云端合同仍只是承诺。**必须在 Foundational 前产出并验收 Web↔Mobile matrix：8 表全部列、null/默认值、client_id/唯一键、FK/级联、revision trigger、删除/分享操作和 Storage path；不能仅靠 `mapping.ts` 骨架。现役源码证明核心行的条件更新、media 的 `(owner_user_id, client_id)` 与 share_items 的 `(snapshot_id, client_id)` 有不同幂等键。
    - **P1-02｜Owner-mismatch 恢复 UX 与验收不完整。**虽禁止 A→B 自动改绑，但 Mine 页未定义“重新登录 A / 明确导出或清空后切换 B”的受控入口、二次确认与不可逆警示；否则用户只能永久阻断。补 UI、状态图、测试（含 cancel/重启）且不实现自动迁移。
    - **P1-03｜会话本地存储安全决策缺失。**PLAN 指向 Expo SQLite localStorage，但未说明令牌的 at-rest 策略与威胁取舍。Supabase 两份官方 RN 指南当前分别示范 Expo SQLite localStorage 与 AsyncStorage；另一个官方 Expo/Supabase 社交登录教程示范 SecureStore。须由 Planner 选择并记录理由；若维持 SQLite/AsyncStorage，安全 DoD 不应声称令牌“不可泄露”。
    - **P1-04｜许可与 Play 未来边界须落为证据。**Google Play 上架确属 out of scope，不能把“最终 Manifest 无禁用权限”写成 Play 合规结论。若以后上架，按 Play 的照片/视频权限规则，偶发或有限选择应使用系统 Photo Picker；当前多图需求需明确优先系统 picker、权限降级，以及未来 Play 政策复核点。
    - **P1-05｜Build/upgrade 证据条件不足。**“Preview APK 覆盖安装旧 Development Build”只有 package 相同、`versionCode` 递增且使用同一签名凭据才有效；这些未写入 e​​as profile/DoD。补版本与签名连续性前置检查，并把 migration 测试定义为真实旧数据库的覆盖安装，不把新装当升级。
    - **P1-06｜Readiness 88 的事实标签虚高。**“官方文档已验证”成立，但 Expo SDK/依赖组合、现有 Auth redirect、RLS/Storage upsert、真机 OAuth 与跨端同步均仍未验证；此外 P0 尚未闭环。分数必须随本轮问题下调，不可把实施期实验当作已经合理验证。
  - P2：
    - **P2-01｜竞品结论应限定。**“不做外部竞品扩张”是合理范围控制，不等于竞品研究完成；保留为产品取舍，避免在 Readiness 中作为竞品已验证加分。

- Key Assumptions（逐条列＋是否成立）：
  - Android 只新增 `mobile/`、不替换 Web/PWA：**成立**；SDD 与 PRODUCT_PLAN 一致，现仓库尚无 `mobile/`。
  - 云端可无迁移复用：**部分成立**；现役 Web 的 8 表/RLS/两桶已有证据，但 Android 所需请求组合及 Storage overwrite policy 尚未真机验证。
  - Expo SQLite 可用 WAL 与 foreign keys：**成立**；官方示例支持 `PRAGMA journal_mode = WAL`、`PRAGMA foreign_keys = ON`。
  - `microphonePermission=false` 可避免 ImagePicker 加入录音权限：**成立但仍须 merged manifest 验收**；配置影响 native binary，不能由 Expo Go 证明。
  - 稳定 scheme + Development Build 足以承载 OAuth：**成立但方案未落地**；Expo 明示 Expo Go 不能用于 OAuth，且必须确定 native callback 流程。
  - RN Storage 的 ArrayBuffer 路径与现有 policy 可工作：**未验证**；二进制方式有官方依据，现有 policy 对真实 RN INSERT/SELECT/UPDATE 尚无证据。

- Verified Facts（已验证事实＋证据）：
  - 现役 `src/lib/sync.ts` 对 Place/Entry/Tag/Dimension 实行首次 INSERT、后续 `.eq('revision', expected)` 更新，0 行即冲突；不是普通 upsert。
  - 现役媒体同步先上传 Storage、再以 `(owner_user_id, client_id)` upsert `media`；分享项目以 `(snapshot_id, client_id)` 幂等。`docs/db/ENV1-实测记录丨2026-09-04.md` 还记录过媒体先于 Entry 的 FK 失败与已修正时序。
  - 现有私有桶按 owner 首层目录隔离、匿名拒读；公开分享 RPC 仅返回白名单字段。上述是 Web 实测，并非 Android/RN 验证。
  - SDD 的 Constitution/SPEC/PLAN/TASKS 在“增量 Android、local-first、无生产 DB migration、禁 WebView/后台定位/录音、P0→P2 主链”上相互一致；120 个任务与 FR/SC traceability 也存在。

- External Sources（Web Search / Web Fetch / 官方文档 / 官方 GitHub / 第三方 / 社区反馈，附链接）：
  - [Expo OAuth authentication](https://docs.expo.dev/guides/authentication/)：`makeRedirectUri`/Linking 是推荐回跳方式；Expo Go 不能用于 OAuth，Development Build 可以；变更 scheme 要重建原生项目。
  - [Expo EAS APK](https://docs.expo.dev/build-reference/apk/)：EAS 默认 AAB，不能直接安装；`developmentClient`、`distribution: internal` 或 `android.buildType: apk` 可产 APK。
  - [Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)：默认会加 `RECORD_AUDIO`；`microphonePermission:false` 可阻断；Android MainActivity 被杀后必须用 `getPendingResultAsync()` 恢复结果。
  - [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)：官方示例支持 WAL 与 foreign keys；[Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)：`Paths.document` 是 documents 持久目录 API。
  - [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/) 与 [Expo Network](https://docs.expo.dev/versions/latest/sdk/network/)：背景定位/前台服务开关分别影响相应权限；`getNetworkStateAsync` 与 listener 可提供网络状态，但不等同服务可达。
  - [Supabase Expo quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native)、[Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native)、[Native mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking?platform=swift)、[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)：支持 publishable key、RN storage adapter、deep link scheme、`skipBrowserRedirect` 与 allow-list 的 `redirectTo`；生产推荐精确 redirect URL。
  - [Supabase Google login](https://supabase.com/docs/guides/auth/social-login/auth-google)：Google Provider 的 authorized redirect URI 指向 Supabase callback；客户端完成 OAuth 后按选定 flow 建立 Supabase session。
  - [Google Play Photo/Video permissions policy](https://support.google.com/googleplay/android-developer/answer/14115180?hl=en-CA)：一次性/有限照片选择应优先系统 Photo Picker；本计划不发布 Play，故这是未来政策门禁而非本轮交付条件。

- Competitor Findings（竞品现状＋对本 Plan 的启示）：
  - 本轮产品基准应继续是已验收的 Place Journal Web，而非将地点轨迹/社区类产品并入范围；该克制支持 MVP。外部研究没有产生应加入 V1 的竞品功能，故不为该项加“已验证”分。

- Counter-evidence（反对证据＋成功的相反做法）：
  - 反对“必须 SecureStore”：Supabase Expo quickstart 目前使用 `expo-sqlite/localStorage/install`，其 RN Auth quickstart 使用 AsyncStorage；可以采用它们，但应公开记录令牌静态存储风险。相反的成功做法是 Supabase Expo 社交登录教程使用 SecureStore 作为移动端 adapter；本计划可据实际威胁模型择一。
  - 反对“必须使用 Expo AuthSession 自己交换 Google code”：Supabase 官方支持原生 deep link + `signInWithOAuth`。相反的成功做法是不混合两套实现：选择 Supabase-hosted OAuth 或 AuthSession/PKCE 中的一条并把浏览器、回调、session 写入完整固化。
  - 反对“有 `blockedPermissions` 即必然安全”：官方 ImagePicker 的配置确可阻断 RECORD_AUDIO；相反的可靠做法仍是以每次 native/config-plugin 变更后的 Preview APK merged manifest 实测为准。

- Unverified Items（未验证项＋验证方法）：
  - 现有 Supabase Redirect URLs、Expo/EAS project/Android credentials：由人确认归属并在 Dashboard/Development Build 中核对，勿把密钥写入仓库。
  - Android 的 OAuth callback：Development Build 真机，覆盖成功、取消、错误、重复 deep link、冷启动回调、重启 session；日志只记脱敏状态。
  - 现有 RLS/Storage：以两个测试账号，在不改生产 policy 前验证私有桶的 INSERT/SELECT/UPDATE、越权拒绝和 media row FK 顺序。
  - Web↔Mobile 合同：先完成逐字段/逐操作 matrix，再做 Android→Web、Web→Android、Entry/Place 冲突、删除无复活的真数据回归。
  - SQLite/升级：真实旧 Development Build 写入数据后，在同签名且 versionCode 递增的 Preview APK 覆盖安装，确认 schema 和 media 均留存。

- Required Fixes（Planner 必须改项，打回依据）：
  1. 补 P0-01：把 `Place/Entry INSERT → media upload/media row → cover 回填` 的依赖、原子/重放规则和失败状态明确写入 PLAN 与 T040/T050/T067/T077。
  2. 补 P0-02：选定一种 Supabase Google OAuth flow，写清 `redirectTo`、浏览器调用、callback code/error、PKCE/implicit 的 session 建立、重复回调处理，并映射 T054–T062。
  3. 在 T012–T013 前增加强制的字段/操作/约束 matrix 及通过准则，覆盖全部 8 表、Storage 与分享 RPC。
  4. 为 owner mismatch 补恢复 UX、二次确认、重启/cancel 测试，保持“无自动跨账号迁移”。
  5. 对 session storage 在 SQLite localStorage、AsyncStorage、SecureStore 中作明确选择、威胁取舍和安全 DoD，禁止泛称“安全”。
  6. 将 Photo Picker 优先、最小授权降级和“若进入 Play 才重做政策审查”写入权限/范围；不把未上架 V1 宣称为 Play 合规。
  7. 补 Preview 覆盖升级的同 package、同签名、versionCode 递增前置条件及证据字段。
  8. 修正研究结论与评分：将未实测运行项标为未验证，移除“竞品已验证”暗示，并在修订版重新计分。

- Plan Readiness Score（分项打分＋合计，口径以 PRODUCT_PLAN.template.md 为准）：
  - 产品目标与用户需求（20）：18/20——目标、非目标和离线价值明确；owner-mismatch 恢复体验仍缺。
  - 核心方案完整性（20）：14/20——分层正确，但媒体父子排序与 OAuth 可执行合同缺失。
  - 外部事实与竞品验证（20）：15/20——关键 Expo/Supabase 能力已有官方依据；实际账号、redirect、Storage/RLS 与运行组合未验证，且竞品只作范围选择。
  - 技术可行性（15）：11/15——SQLite、持久目录、权限和 EAS 路径可行；跨端合同、OAuth 与 RN Storage 尚无实证。
  - 风险与异常场景（10）：8/10——覆盖广，但缺媒体 FK 时序、会话存储取舍与升级签名条件。
  - 开发范围与 DoD（10）：8/10——大部分可验收；升级与 Play 边界需收紧，P0 的两个验收前提未写清。
  - 未决问题（5）：1/5——4 个既有 Human blocker 加本轮 P0/P1，尚不具备进入 Human Gate 的条件。
  - 合计：**75/100**。
  - Gate：**不通过**（未解决计划 P0=2、blocking P1=6、Readiness<90，关键运行假设未完成合理验证）。Planner 修订并经 R2 复核后，才可汇总 Human Decisions。

- Human-only Decisions（只需人类拍板项）：
  - HD-01：P0 内部 MVP 后分段验收，还是 T001–T120 一次性交付。
  - HD-02：最终 Android package/scheme、Expo/EAS 账号、Android 签名凭据与构建额度的归属。
  - HD-03：授权在现有 Supabase Auth Redirect URLs 增加精确的最终 App callback；Google Provider 层继续仅使用 Supabase callback。
  - HD-04：提供真机与两个测试账号（不在文档/Git 写凭据）。
  - HD-05：会话 token 是否采用 SecureStore；若不采用，接受 SQLite/AsyncStorage 的静态存储取舍。

- Next Action：**回 Planner 修订**。先关闭 P0-01/P0-02 和 8 条 Required Fixes，再由 Research Reviewer 进行 R2；当前不得进 `WAITING_HUMAN_APPROVAL` 或 `DEVELOP`。
