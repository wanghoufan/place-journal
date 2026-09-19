# PRODUCT_PLAN｜Place Journal Android V1

> 状态注（2026-09-19）：本文件即 V1.5 基线（文件名已由 `PRODUCT_PLAN_V1.0.md` 对齐为 `PRODUCT_PLAN_V1.5.md`，用户拍板）。文中 `PROJECT_PHASE: PLAN`、`PLAN_GATE: READY_FOR_HUMAN_REVIEW` 等字段为**批准前快照**，现役状态唯一真源＝`docs/handoff/HANDOFF.md`（DEVELOP / APPROVED / V1.5）。

- Plan Version：PRODUCT_PLAN_V1.5（2026-09-18；输入基线：Android SDD V1.2）
- Version Change：V1.0 的增量 Android、local-first、共用现役云合同与零生产 DB migration 结论不变；V1.1 补齐媒体依赖图、OAuth PKCE 回调合同及 R1 八项 Required Fixes；V1.2 补齐 OAuth 回调去重与中断恢复状态机，关闭 R2-03；V1.3 以 `unzip -p` 从权威 zip 重建 T012/T040/T050/T054/T062/T067/T077 可审计原文证据链，增加 RF-01～RF-08 覆盖矩阵，并将 MVP Gate 与完整 V1 Gate 固化为互不冲突的任务切片，关闭 R3-01/R3-02（即 R2-01/R2-02）；V1.4 收敛 token 存储口径为唯一可审计表述（code 原文禁落盘一切存储；access/refresh token 仅由 SecureStore adapter 持久化）、理顺 HD 与 Gate blocking P1 的计数口径、补写 PKCE code verifier 持久化与重叠流策略、标注 Appendix A zip 路径基准，关闭 R4-01～R4-04；V1.5 按 Human Gate 决议（2026-09-18）落字：HD-01=B 连续开发（MVP Gate 降为 TM 内部检查点、相关“暂停验收”表述同步为连续开发）、HD-02/HD-05 确认、HD-03 操作人＝实施方并列为 Phase2 前置动作、HD-04 单机 Redmi Note 12 Pro 且 T062 双账号 mismatch 拆条降级为接受风险＋延后，其余不动。
- PROJECT_PHASE：PLAN
- Product Goal：
  - 在不替换、不迁移现役 Web/PWA 的前提下，在同一仓库新增 `mobile/` Expo React Native Android 客户端。
  - Android V1 让用户能从手机桌面进入原生 App，在无网、未登录或云端失败时先保存地点、文字与多图；之后与同一 Supabase `habit_tracker` 数据双向同步。
  - 同步必须保留现役 Web 已验证的 `outbox + revision/baseRevision + dirty guard + 显式冲突 + 删除防复活 + push/pull 解耦` 语义，禁止静默覆盖。
  - 交付可安装的 Preview APK，并保留 Production AAB 构建能力；Google Play 正式上架不属于 V1。
  - Android V1 默认 `PRODUCTION_DB_MIGRATION = 0`，继续复用现有 Auth、Schema、RLS、Storage、分享合同和 Web AI API。
- Target Users：
  - 第一目标用户：现有 Place Journal 的个人用户，典型模式为“Android 手机现场记录，电脑 Web 查看、整理与分享”。
  - 次级场景：弱网或离线旅行途中记录；稍后登录并同步；Web 与 Android 偶发并发编辑。
  - V1 不面向多人协作、团队空间、公开内容社区或多账号自动迁移。
- Problem：
  - 现役 PWA 已有完整业务闭环，但 Android 现场记录仍依赖浏览器/PWA，缺少真正的桌面入口、原生相机/相册、持久媒体目录、稳定 OAuth 回跳和可安装 APK。
  - 移动现场网络不可靠，若保存依赖云端回执，会造成文字、照片或待同步操作丢失。
  - Android 与 Web 共用云端数据时，若移动端只做普通 upsert，会破坏现有乐观锁、脏行保护和删除语义，产生静默覆盖或数据复活。
  - 手机可能切换 Google 账号；若本地数据集不绑定 owner，账号 A 的本地脏数据可能被上传到账号 B。
- Core Value：
  - “先记下来，再可靠同步”：保存成功以 Android 本地持久化完成为准，而不是以网络或登录成功为准。
  - “手机记录、电脑整理，同一份数据”：复用 `habit_tracker` 云端合同，保持 Web/PWA 与 Android 双向兼容。
  - “冲突可见、隐私不降级”：并发冲突由用户裁决；私密感受、令牌、精确位置和私有媒体不因新增客户端扩大暴露面。
  - “增量交付”：移动端只新增 `mobile/`，不重写 Web、不套 WebView、不另建后端。
- User Flow：
  1. 用户安装 Preview APK，从桌面冷启动进入原生 Gallery；未登录也可浏览本机数据并新建记录。
  2. 用户在 Record 中拍照或多选图片；系统把临时 URI 复制到 App 持久目录，生成 display/thumb，再与地点、日期、评分、预算、私密感受、公开理由、标签等一起写入 SQLite。
  3. 本地实体写入与 outbox 入队在同一事务或等价原子边界完成；UI 显示“仅本机/待同步/失败/冲突/已同步”。杀进程、重启或断网不能丢记录、媒体引用和队列。
  4. 用户点击 Google 登录后，App 按 HD-02 建议基线以固定 `redirectTo=com.wanghoufan.placejournal://auth/callback`（若 Human 改 identity，必须在开发前同步换成唯一精确值）调用 Supabase `signInWithOAuth({ provider:'google', options:{ redirectTo, skipBrowserRedirect:true } })`，将返回 URL 交给系统浏览器/AuthSession。回调路由只接受精确 scheme/host/path：先处理 `error/error_description`，再将一次性 `code` 仅在当前内存调用链中传给 `exchangeCodeForSession(code)`；本计划明确选用 PKCE，不混用 implicit 或手工 `setSession` token 解析。去重键只持久化 `SHA-256("place-journal-oauth-v1" + callbackPath + code)` 的小写 hex 摘要。存储口径（全计划唯一表述）：code 原文禁落盘一切存储（去重指纹记录、SQLite、AsyncStorage、日志、截图与证据）；access/refresh token 只允许由 SecureStore adapter 持久化，禁止进入 SQLite、AsyncStorage、日志、截图与证据。相同指纹在 `received/exchanging/succeeded/terminal_reauth` 任一状态下都不二次换码；取消/错误回到未登录态且不触发同步。
  5. OAuth 换码成功后，Supabase session 由自定义 SecureStore adapter 持久化；再执行 owner binding。若本地数据未绑定，App 先请求绑定确认；若已绑定账号与当前账号不一致，整体阻断 push/pull。Mine 页提供“退出并重新登录原账号”与“先导出本地数据后清空本地并切换账号”两条恢复路；清空必须显示不可逆警示、数量摘要与二次确认，cancel 或重启不得改 owner/删数据，V1 仍不自动跨账号迁移。
  6. 联网且账号匹配时，前台同步引擎先恢复陈旧锁、补扫脏行，再分别执行有独立超时的 push 与 pull。媒体依赖图固定为 `Place INSERT/ensure → Entry INSERT → Storage display/thumb upload → media row upsert → Entry cover_media_id expected-revision UPDATE`；任一父节点未成功时子节点保持 blocked/pending，不计为业务失败次数。图片失败保留本地副本，毒丸操作停放并显示错误。
  7. Android 新增/编辑的数据可在 Web 读取；Web 修改可被 Android 拉取。revision 不匹配进入 Conflicts，用户选择“采用云端”或“保留本地”；删除不得被拉取复活。
  8. 用户可在 Android 浏览 Entry/Place、地点时间线、编辑与删除；离线使用文字、标签和结构化筛选。
  9. 用户可选调用现有 `/api/ai-organize`；成功后编辑确认，超时/5xx/未配置时跳过并继续手工保存。
  10. 用户可复用现有分享快照合同生成 Web 分享 URL，通过 Android Share Sheet 分享并撤销；公开 payload 只包含白名单字段。
  11. 用户主动点击时才请求前台位置；拒绝或不可再次询问时回到手工填写，不启后台定位。
- Functional Scope：
  - 原生 App 壳：Expo + React Native + TypeScript + Expo Router；Gallery / Record / Find / Mine 四主入口，以及 Entry / Place / AI Confirm / Tags / Conflicts 页面。
  - 本地优先：Expo SQLite 持久化 `places / entries / media / tag_dimensions / tags / entry_tags / share_snapshots / share_items / meta / outbox / conflicts`；只允许 forward-only migration。
  - 媒体：相机、系统 Photo Picker 优先的多图选择、Activity/picker 恢复、持久目录、display/thumb、顺序和封面、ArrayBuffer Storage 上传、失败重试。只在系统 picker 不可用且用户主动选择时请求最小照片权限，拒绝时保留文字记录能力。
  - 认证：Supabase-hosted Google OAuth + PKCE、稳定自定义 callback、SecureStore Session 持久恢复、AppState 自动刷新、退出不删本地、owner binding 与账号不匹配的受控恢复。
  - 同步：首次 INSERT、expected-revision UPDATE、重复重放校准、父标签先于子标签、Place/Entry/media/cover 显式依赖图、dirty sweep、poison parking、stale lock、pull 最终二次读取、冲突裁决、删除防复活。
  - 日常业务：按记录/地点浏览、地点时间线、编辑、删除、删空地点清理、本地搜索、标签/维度管理。
  - 可选增强：现有 AI 整理端点、现有分享合同与系统 Share Sheet、用户主动前台定位。
  - 构建验收：Development Build、Preview APK、Production AAB-ready profile；最终 merged manifest、安全审计、升级保留数据、Android↔Web 真机跨端回归。
- Out of Scope：
  - iOS、WebView 主壳、重写或替换 Web/PWA、迁移现有 Web 根目录到 Expo。
  - 新 Supabase 项目、新 Schema、新账户体系、任何生产表/字段/Function/Policy/Bucket/Realtime 或 Migration 变更。
  - 后台定位、地理围栏、后台常驻同步、原生地图 SDK、通讯录、电话、录音 ASR、OCR、SQLCipher。
  - Google Play 正式上架、公开分享页面重做、自动跨 Google 账号迁移本地数据。
  - 为 V1 引入独立搜索服务、复杂全文检索服务，或为了复用而强行共享 Web UI/IndexedDB 实现。
- Technical Approach：
  - 仓库形态：保留根目录 React/Vite Web 工程，在根下新增独立 `mobile/`；不改现役 Vercel 部署结构。当前仓库实证 `mobile/` 不存在，因此 Setup 从零开始。
  - 复用边界：复用领域语义、云端行合同、bucket 路径、同步规则、分享白名单和 API；不直接复用 DOM UI、IndexedDB、Web Blob 或 `navigator.onLine`。
  - 本地层：`expo-sqlite` 开 WAL 与 foreign keys，通过 `user_version` 执行向前迁移；核心实体保存与 outbox enqueue 使用事务；迁移失败保留数据库并阻止正常业务写入，禁止删库重建。业务 SQLite 不存放 access/refresh token。
  - 合同门禁：在 T012–T013 代码实现前先完成并评审 Web↔Mobile 字段/操作/约束 matrix，覆盖 8 表每一列的类型、null/默认、owner/client_id/唯一键、FK/级联、revision trigger、INSERT/UPDATE/DELETE/分享操作、两 bucket 路径与 Storage INSERT/SELECT/UPDATE，以及 `public_share_read` 输入/白名单输出。通过准则：每个移动端操作都有现役源码/数据库证据、幂等键、前置依赖、失败/冲突结果和对应测试；未对齐项阻断 T012–T013，不猜测实现。
  - 媒体层：优先系统 Photo Picker；`expo-image-picker` / 相机只产生输入，正式文件复制至 App documents；生成 display/thumb 后落库。React Native Storage body 使用当前 Supabase 官方支持的 ArrayBuffer 或同版本等价方案。
  - 媒体 outbox：每个 op 持久化 `op_id/entity_id/type/depends_on/status/attempts/last_error`；T040 建模依赖 DAG，T050 保证本地 Entry+media+ops 原子入库，T067 按 `ensure_place → upsert_entry → upload_media → upsert_media_row → patch_entry_cover` 重放，T077 验收。Storage 对象路径确定且存在时重传视为幂等成功；media row 以 `(owner_user_id, client_id)` 幂等；cover 回填使用当时 `base_revision`，0 行进冲突而非覆盖。父节点失败不执行子节点；重启后从首个未达成节点续跑，已达成节点通过云端回读/幂等键校准，不重复创建。
  - 网络层：使用 `expo-network` 适配器；同步入口统一检查云端配置、登录态、owner binding 与网络状态。push 和 pull 独立超时，push 失败不能永久阻塞 pull。
  - Auth：固定一条 Supabase-hosted Google OAuth + PKCE 路径；使用稳定 package/scheme、`makeRedirectUri`/Linking 与系统浏览器，只在精确 callback 上执行 `exchangeCodeForSession`。Google Provider callback 与 Android App redirect 分层配置；OAuth、scheme、权限和 APK 验收从 Development Build 开始，Expo Go 仅用于最早期 UI/SQLite 探针。T054–T062 覆盖 redirect 构造、浏览器打开、error/code 分支、换码、SecureStore 持久化、重复/冷启动回调及 session 恢复。
  - PKCE code verifier 持久化与重叠流（R4-03）：Supabase client 的 auth `storage` 选项与 session 共用同一 SecureStore adapter，发起流程时由 Supabase 写入的 `code_verifier` 随之持久化，因此换码在杀进程/冷启动后仍可读——这是 T062“换码后杀进程、冷启动 callback”DoD 可达的前提。T055/T056 单测覆盖：verifier 写入后模拟冷启动可读并能成功换码；verifier 缺失/过期时换码失败且不再重试。V1 采用**默认单流**：同一时刻只允许一个进行中的 PKCE transaction；发起新登录前先由 sweeper 判定旧 flow，若旧 flow 未完成且无有效 session，则置 `terminal_reauth`、丢弃旧 verifier，再创建全新 transaction（不重用旧 code/verifier）。若未来需要并发/重叠流，必须改用 `appendPkceFlowIdToRedirects`/`flowId` 隔离并单独评审，V1 默认不启用。T062 真机条目：verifier 跨冷启动可读时冷启动 callback 可达 exchange PASS；verifier 不可读时按安全降级到 `terminal_reauth` 并显示重登入口，两条路径均属 DoD 覆盖范围，不得用静态检查代替。
  - OAuth 回调去重状态机：持久记录仅含 `fingerprint_hash/status/received_at/updated_at/expires_at/error_class`，不含 code、token 或完整 callback URL。首次合法回调原子地从 `received` 领取为 `exchanging`；成功且 SecureStore session 可再读后置 `succeeded`。`exchanging` 超过 2 分钟或进程/网络中断视为结果不确定：冷启动先调用 Supabase session helper 读取并验证已持久化 session；若有有效 session，置 `succeeded` 并继续 owner binding；若无有效 session，置 `terminal_reauth`，禁止重用该 code/指纹换码，Mine 显示“登录未完成，请重新登录”，新登录必须新建 PKCE transaction 并获得新 code。Provider 明确 error、无 code 或换码确定失败同样不自动重试旧 code，回到可见重登入口。所有指纹记录的 TTL 为 `received_at + 24h`；App 启动、新登录前和成功恢复 session 后运行 sweeper，只删除过期记录，使成功/失败指纹在 TTL 内仍能拦截迟到回调。
  - Session storage：V1 选择 `expo-secure-store` adapter 存 access/refresh token，不用 SQLite localStorage/AsyncStorage 存 token。原因是减少本地数据库备份/普通文件可读面，代价是需要 Development/Preview Build 验证大 session 写入、刷新、退出清除和重安装行为。SecureStore 不等于令牌绝对不可泄漏；root/调试包/屏幕或日志仍在威胁模型内，日志和证据一律脱敏。
  - 权限：`expo-image-picker.microphonePermission=false`，并在 `android.blockedPermissions` 阻断 `RECORD_AUDIO`、`ACCESS_BACKGROUND_LOCATION`、`FOREGROUND_SERVICE_LOCATION`；最终以 Preview APK merged manifest 为准。V1 仅证明 APK 权限最小化，不声称 Google Play 合规；若未来进入 Play 上架范围，必须按届时 Photo/Video Permissions 政策重做专项审查。
  - 构建：EAS 为默认路径；Preview profile 明确产出可直接安装的 APK，Production profile 保留 AAB。升级证据的前置锁定为新旧包的 Android package 完全一致、同一 Android 签名凭据、新包 `versionCode` 严格递增；不满足任一项不得声称“覆盖升级”。任何 native/config plugin 变更后重新生成对应 build，不用旧 binary 冒充验证。
  - 交付节奏：先完成 Setup + Foundational，再按 P0 主链完成 Native Shell → Offline → Media → Auth → Sync → Basic History；P2 能力在主链稳定后进入；Final Phase 统一做安全、升级、APK 和跨端验收。
  - 事实基线：SDD 审计提交 `6f6bed7...` 是当前 HEAD `61a8324...` 的祖先；两者提交差异仅 `USER_MODEL_OVERRIDE.md`，未发现业务代码漂移。但当前工作树存在用户的治理迁移改动，开发阶段必须隔离并保留，禁止顺手清理或覆盖。
- Data / API：
  - 云端固定：Supabase 项目 `yacgnikzvutbpoqvokth`，Schema `habit_tracker`，归属字段 `owner_user_id`，统一 helper 访问，不在移动端散落 `.schema()`。
  - 现有八表合同：`places`、`entries`、`media`、`tag_dimensions`、`tags`、`entry_tags`、`share_snapshots`、`share_items`。仓库文档实证为 8 表全 RLS、32 条策略、authenticated CRUD、anon 表权限为 0；匿名分享只经 `public_share_read`。
  - 核心实体：Place / Entry / Tag / Dimension 映射必须保存 `revision` 与 `base_revision`；首次云写入走 INSERT，后续走 `id + expected revision` 条件 UPDATE；0 行视为冲突。
  - 辅助对象：Media / Share 可沿用现有稳定幂等键与受控 upsert，但不得绕过核心实体乐观锁。
  - 私有桶：`habit-tracker-media-private`，路径继续使用 `{owner}/{placeId}/{mediaId}/thumb.jpg|display.jpg`。
  - 公开桶：`habit-tracker-media-share`，只放经白名单批准的分享缩略图；私密文字、原始媒体、精确坐标不得进入公开 payload。
  - Auth 环境变量仅允许 `EXPO_PUBLIC_SUPABASE_URL` 与 `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`；不得把 `service_role`、DB password、OAuth Client Secret、AI Secret、token 写入 APK、Git、日志或证据。
  - AI：通过 `EXPO_PUBLIC_WEB_BASE_URL` 指向现役 Web，调用 `/api/ai-organize`；Android 不持有模型服务端 Secret，失败可跳过。
  - Share：继续创建/撤销现有分享快照，并生成现有 Web public URL；Android 只调用系统 Share Sheet，不新增公共渲染端。
  - 数据库变更门禁：发现现有 RLS、Storage 权限、RPC 或字段无法满足 Android 时，停止对应范围并回到 SPEC/PLAN/数据库专项审查；不得由 Builder 自行补生产 Migration 或 Dashboard 权限。
- Key Assumptions：
  - 已验证：当前业务源码仍存在 `habit_tracker` helper、两只既有 bucket、`revision/baseRevision` 条件更新、冲突记录、dirty guard、毒丸停放、stale lock、push/pull 解耦、删除操作和分享操作；SDD 基线到当前 HEAD 无业务代码差异。
  - 已验证：仓库现状没有 `mobile/`；SDD TASKS 为 T001–T120 共 120 项，全部未勾选，Execution Summary 全空，`ANDROID_V1_READY = NOT_YET`。因此 SDD 的 `READY` 只表示文档可实施，不表示 Android 已构建或验收。
  - 已验证：现有 `habit_tracker` 与两只 bucket 有 Web 真实验收证据；Android/RN 尚未对 Auth、RLS、Storage upsert 与跨端同步做真机实证。
  - 已验证（官方文档，2026-09-18 查询）：Expo OAuth 需要可定制 scheme，Expo Go 不能承担此类 OAuth 测试，应使用 Development Build；EAS Preview 通过 `distribution: internal` 或 `android.buildType: apk` 可产可安装 APK；Expo ImagePicker 默认可能加入 Android `RECORD_AUDIO`，需显式关闭；Supabase React Native Storage 上传应使用 ArrayBuffer，而非照搬 Blob/File/FormData。
  - 未验证：Expo SDK、Expo Router、SQLite/FileSystem/ImagePicker/Location/Network/SecureStore 的实际版本组合与 SDD 示例兼容性；须在 Setup 创建 `mobile/package.json` 当日使用官方兼容组合并以 `expo-doctor` + Development Build 验证，不在本计划锁死未来 patch 版本。
  - 待合理验证：现有 Storage policy 同时允许 Android 所需的 INSERT/SELECT/UPDATE upsert 流程；只能通过现有策略下的真机测试确认，不预设要改权限。
  - 待合理验证：现有 `/api/ai-organize` 的请求合同、超时和生产可用性对 Android 调用保持兼容；AI 不作为保存阻断项。
  - 未验证：当前 Supabase Auth redirect allow list、真机 PKCE callback/code exchange、SecureStore session 恢复、EAS 签名连续性、Android↔Web 跨端同步。待人确认 App identity/EAS 归属、redirect 授权、真机与双账号验收资源、V1 交付分段方式，见 Human Decisions Needed。
- Competitor / Research Summary：
  - 产品参照以现役 Place Journal Web/PWA 为唯一行为基准；Android 是增量客户端，不以 Pinna、Dawarich 等地点/轨迹产品为代码底座，也不在本轮扩大为轨迹或社区产品。
  - Expo 官方认证文档支持 SDD 的关键判断：OAuth 回跳依赖自定义 scheme，Expo Go 不适合作为 OAuth 最终验证环境，应使用 Development Build（https://docs.expo.dev/guides/authentication/）。
  - Expo 官方 Android APK 文档确认：AAB 默认不能直接安装，Preview 需配置 internal distribution 或 `android.buildType: apk` 才能得到可安装 APK（https://docs.expo.dev/build-reference/apk/）。
  - Expo ImagePicker 官方文档确认：Android 默认会加入 `RECORD_AUDIO`，`microphonePermission: false` 可阻断；仍须以 merged manifest 作最终证据（https://docs.expo.dev/versions/latest/sdk/imagepicker/）。
  - Supabase Storage 官方文档确认：React Native 中 Blob/File/FormData 不按预期工作，推荐从 base64 解码为 ArrayBuffer 上传（https://supabase.com/docs/reference/javascript/storage-from-upload）。
  - 未做外部竞品系统研究：SDD 已冻结产品目标，本轮只将“不引入轨迹/社区竞品功能”作为范围取舍，不将其计为竞品事实已验证或 Readiness 加分。
- Risks：
  - R-01｜高｜云端合同误读：SDD 是摘要，实际 mapping 若未逐字段对照 `src/lib/types.ts`、`src/lib/sync.ts`、`src/lib/idb.ts` 会导致跨端不兼容。控制：Foundational 先做字段/操作矩阵和契约测试。
  - R-02｜高｜核心实体被普通 upsert 静默覆盖。控制：首次 INSERT、后续 expected-revision UPDATE、0 行冲突、pull 最终二次读取均列为 P0 DoD。
  - R-03｜高｜账号 A 本地数据传给账号 B。控制：SQLite 持久化 `bound_owner_user_id`；不匹配时整体阻断 push/pull；只允许重登录 A 或经导出+二次确认后清空切 B，cancel/重启不改数据；V1 不做自动迁移。接受风险（HD-04）：V1 仅单台 Redmi Note 12 Pro、无第二账号资源，owner-mismatch 的“双账号 mismatch”真机项降级为接受风险＋延后，先以单账号登录/退出/重登录＋绑定阻断走查覆盖，双账号场景待资源到位后补测。
  - R-04｜高｜picker URI 或 Activity 回收造成图片丢失。控制：临时 URI 先复制 App documents，再落正式记录；覆盖 pending result 与 Activity recreation 真机测试。
  - R-05｜高｜SQLite 升级清空真实数据，或把新安装误报为升级。控制：forward-only migration；旧/新 APK 同 package、同签名且 versionCode 递增后才执行覆盖安装；以旧版真实 DB/媒体作证，迁移失败保留数据库。
  - R-06｜高｜Storage upsert 在 RN 路径因 body 或 policy 失败。控制：ArrayBuffer adapter；分别验证 INSERT/SELECT/UPDATE；失败不删本地文件、不标 synced。
  - R-07｜高｜生产数据库范围漂移。控制：`PRODUCTION_DB_MIGRATION = 0`；一旦需要新表/字段/Policy/Bucket/Realtime，暂停并重新审查。
  - R-08｜高｜OAuth redirect 两层混淆、code 重复交换、换码中断卡死、code/token 落盘或日志泄漏。控制：Provider callback 与 App redirect 分开；锁定 PKCE + `exchangeCodeForSession`；只持久化 code 的域隔离 SHA-256 摘要与有限状态字段；24h TTL + sweeper；中断后 session-first 判定，无 session 则明示重登且永不重用旧 code；SecureStore 适配器；日志脱敏；只在 Development/Preview Build 真机验收。
  - R-16｜高｜媒体早于 Entry 或 cover 早于 media 重放，触发 FK 失败或不可重放的半成品。控制：持久化 DAG/depends_on；父成功后才解锁子 op；每节点用幂等键/云端回读校准；T077 覆盖断网、杀进程、父节点失败和重启续跑。
  - R-17｜中｜用最小权限 APK 结论替代未来 Play 合规审查。控制：Photo Picker 优先、权限降级；V1 证据只表述 manifest 现状；Play 上架变更时重做届时政策审查。
  - R-09｜中｜Expo/原生包 API 随 SDK 变化。控制：用当前稳定模板与 `npx expo install`；在 Setup 锁定 lockfile并记录实际版本；变更先更新 PLAN/TASKS。
  - R-10｜中｜权限配置看似正确但依赖合并后仍带麦克风/后台定位。控制：Preview APK merged manifest 必须实证审计，静态 app config 不算 PASS。
  - R-11｜中｜弱网、进程被杀、毒丸 op 或陈旧锁卡住同步。控制：持久 outbox/attempts/error、最大尝试与停放、stale lock、push/pull 独立边界、重启恢复测试。
  - R-12｜中｜分享或 AI 复用造成私密字段泄漏。控制：固定白名单 mapper；私密感受与公开理由分字段；匿名打开分享 URL 检查；APK 不含 AI Secret。
  - R-13｜中｜SDD 基线与开发起点继续漂移。控制：Phase2 启动时记录实际 baseline commit 并对 `6f6bed7...` 做业务差异复核；当前已确认至 `61a8324...` 仅模型分工表提交差异。
  - R-14｜中｜当前工作树有治理迁移改动，误清理会损坏用户工作。控制：Android 开发只改授权范围，禁止 reset/checkout/顺手归档；进入开发前由 TM 明确分支与基线。
  - R-15｜低｜Expo/EAS 账号、凭据或网络阻塞云构建。控制：人先确认账号/凭据；EAS 为默认，本地 Android SDK 仅作已有环境下备用，不临时扩张环境搭建。
- DoD：
  - 计划 Gate：Research Reviewer 已完成至少一轮独立审查；所有 blocking P1 已由 Human/TM 给出明确结论；计划分数 ≥90；无未解决计划 P0；关键事实与核心假设满足 Gate。
  - 工程：`mobile/` 为独立 Expo TypeScript 工程，lockfile、typecheck、tests、`expo-doctor`、Development/Preview/Production profiles 齐全；根 Web/PWA `npm run build` 回归通过且现役部署结构未被迁移。
  - 原生性：Preview APK 可在真实 Android 手机安装、冷启动、后台恢复；主界面无浏览器地址栏且不是 WebView 主壳；App name/icon/package/scheme 与 Human 决策一致。
  - 离线：飞行模式创建含至少 2 张图片的记录，杀进程重开后文字、媒体、本地状态和 outbox 完整；保存不依赖登录或云回执。
  - Auth：Development Build 真机验收 PKCE Google OAuth 成功、用户取消、Provider error、无 code、重复 deep link、换码前/中断网、换码后杀进程、冷启动 callback、无 session 重登和重启 Session 恢复；同一指纹只有一次 `exchangeCodeForSession`。数据检查证明只持久化 SHA-256 摘要及状态/时间字段，TTL/sweeper 可清理过期记录；换码结果不确定时有效 session 继续、无 session 显示新登录入口且不重用旧 code。SecureStore 中可恢复/刷新 session，退出清 token 但不删业务本地数据。存储审计判据（可单一、无歧义判定，基线为 grep 全仓）：① 全仓不存在 code 原文落盘——去重指纹记录只含 SHA-256 摘要，SQLite、AsyncStorage、日志、截图与证据中 grep 不到 code 原文；② access/refresh token 只出现在 SecureStore adapter 持久化路径，grep 证明其不出现在 SQLite、AsyncStorage、日志、截图与证据。两条同时满足方为 PASS。
  - Owner mismatch（HD-04 拆条）：① 单账号可做项——登录/退出/重登录原账号、session 恢复、退出不删业务数据，并做绑定阻断走查（`bound_owner_user_id` 与当前账号不一致时 push/pull 被阻断、cancel/重启不改 owner 与数据），纳入 T062 与 MVP Gate；② 双账号 mismatch 项——“账号 A 数据下登录 B 时 push/pull 全阻断 / 重登录 A 可恢复 / 导出后清空切 B（数量摘要+不可逆警示+二次确认）/ 无自动迁移”因无第二账号资源，降级为接受风险＋延后，不计 MVP Gate blocking，待资源到位后补测。
  - 同步：完成 Android→Web、Web→Android、Entry conflict、Place conflict、Android delete→Web 消失、delete no-revival 六组真数据测试；dirty 行不被旧远端覆盖；push 失败不永久阻塞 pull。
  - 媒体：T040/T050/T067/T077 证明 `Place/Entry → Storage → media row → cover` 依赖顺序；集成测试强制每个父节点失败时子 op 未发送，恢复/杀进程后只续跑未达成节点，不产生重复 media 或静默 cover 覆盖。多图顺序、持久目录、Activity 回收、ArrayBuffer 上传、失败保留、远端路径回填均通过；Storage INSERT/SELECT/UPDATE 在现有 policy 下真实 PASS。
  - 业务：Android 可独立完成浏览、编辑、删除与重启保持；Find/Tags、AI、Share、Location 按获批 V1 范围完成对应独立测试。
  - 安全/权限：系统 Photo Picker 可用时不申请广泛媒体权限，降级路径只请求最小权限且拒绝后可继续文字记录；merged manifest 不含 `RECORD_AUDIO`、`ACCESS_BACKGROUND_LOCATION`、`FOREGROUND_SERVICE_LOCATION`；tracked files、bundle config、日志、截图无 Secret/token；匿名不能读私有表和私有 Storage。证据不使用“Play 合规”表述。
  - 分享：匿名页面仅见白名单字段；私密感受、精确坐标和私有媒体不可见；revoke 生效；Android Share Sheet 正常。
  - 升级：先记录旧 APK 的 package、签名证书指纹、versionCode、SQLite user_version、实体/媒体/outbox 数量与样例 hash；新 Preview APK 必须同 package、同签名、versionCode 递增并真实覆盖安装，再记录同样字段与 migration 日志证明数据保留。卸载新装、换签名或换 package 均不算升级 PASS。
  - 证据：每项真机任务记录设备型号、Android 版本、App version/build id/versionCode/package、签名证书指纹、命令/结果和必要截图或脱敏日志摘要；静态检查不得代替真机、OAuth、Manifest、Storage 或跨端 PASS。
  - 完整 V1：SDD T001–T120 全部完成，FR/SC traceability 无孤儿，Execution Summary 填全，所有 blocker 关闭后才允许 `ANDROID_V1_READY = PASS`。
- P0 / P1 / P2：
  - 说明：以下 P0/P1/P2 是开发交付优先级；Gate 中“P0=0 / blocking P1=0”仅指**计划评审技术问题**（Planner/Research Reviewer 产出的、尚未关闭的技术项）。R1 P0-01/P0-02 已在 V1.1 形成可实施合同，当前未解决计划 P0=0。**Human Decisions（HD-01～HD-05）不计入 blocking P1**：它们是在 `WAITING_HUMAN_APPROVAL`（Human Gate）由 Human 拍板的必答事项，不是阻断进入 WAITING 的前置条件；HD 未决不改变 `blocking P1=0` 的口径（HD 未决时仍可 WAITING），但 Human 未拍板前不得进入 DEVELOP。
  - P0（非做不可）：
    - Setup 与 Foundational：工程脚手架、SQLite forward-only migration、事务仓库、outbox/meta/conflicts、Supabase helper、网络 adapter、安全环境变量与 Development Build；在 T012–T013 前完成 8 表+Storage+RPC 合同 matrix 门禁。
    - Native Shell + Offline：可安装原生入口、离线文字保存、重启保持。
    - Persistent Media：多图、持久目录、Activity 回收、display/thumb、ArrayBuffer 上传；T040/T050/T067/T077 实施并验收 `Place/Entry → Storage → media row → cover` 依赖 DAG、幂等重放和父失败阻断。
    - Auth + Owner Binding：T054–T062 实施 Supabase-hosted Google OAuth + PKCE、精确 redirect、系统浏览器、callback code/error、`exchangeCodeForSession`、SecureStore 恢复和重复回调去重；首次绑定确认、账号不匹配阻断与受控恢复。
    - Cross-device Sync：乐观锁、dirty guard、父子依赖、媒体/删除、毒丸停放、stale lock、push/pull 解耦、冲突裁决与删除防复活。
    - Basic History：Gallery、Entry/Place 详情、编辑、删除、地点时间线。P0 内部 MVP 的任务切片止于 T085；Final Manifest、安全、升级、最终 Web 回归和完整跨端验收唯一归入完整 V1 Gate，不属于 MVP Gate。
  - P1（blocking / 非 blocking 注明）：
    - Blocking P1：0。R4-01（token 存储表述矛盾）与 R4-02（HD/Gate 计数死锁）已在 V1.4 关闭，详见 Research Review Round 与 R4 Required Fixes 闭环；无其他未关闭的计划评审技术 P1。
    - 非 blocking P1：Research Reviewer 对 V1.4 的 token 判据收敛（R4-01）、HD 与 Gate blocking P1 口径（R4-02）、PKCE verifier 路径（R4-03）与 Appendix A zip 基准（R4-04）做 R5 独立复核；反馈由 TM 自动回传 Planner。
    - 口径：HD-01～HD-05 属 Human Decisions Needed（必答项），在 `WAITING_HUMAN_APPROVAL` 拍板，不计入本节 blocking P1；见说明与 Human Decisions Needed。
  - P2：
    - `T086–T090`：离线本地搜索、标签/维度管理。
    - `T091–T095`：AI 整理 success/timeout/5xx/未配置降级。
    - `T096–T101`：公开分享 create/anonymous inspect/system share/revoke。
    - `T102–T107`：用户主动前台位置 allow/deny/canAskAgain=false。
    - `T108–T120`：完整 V1 Final Phase；Final Manifest、安全、升级、最终 Web 回归、Preview APK/Production AAB-ready、完整主流程与跨端验收全部在此唯一验收。它们不反向改变已通过的 MVP 功能结论，但缺一项均不得通过完整 V1 Gate。

- Delivery Gates（R3-02 固化；任务不双归属）：
  - **MVP Gate｜核心记录与同步内部门禁**
    - Txxx 集合：`T001–T085`，且仅此集合；包含 Setup、Foundational、US001–US006。`T077` 是本 Gate 的功能级 Android↔Web 同步验收，`T085` 是浏览/编辑/删除后的功能级跨端结果验收；二者不是 Final Phase 的“完整跨端主流程”。
    - 通过产物：可在指定 Android 真机安装和重启的 Development Build；本机 SQLite/outbox 与持久媒体；可用的 Google OAuth/owner binding；Android↔Web 核心实体同步、冲突和删除防复活；Gallery/Entry/Place/Record 核心历史流；T001–T085 逐项 Evidence。
    - DoD：T001–T085 全部完成且无 blocker；飞行模式保存至少 2 张图并杀进程恢复；单账号登录/退出/重登与 session 恢复、绑定阻断走查（登录 B mismatch 双账号项按 HD-04 降级为接受风险＋延后）；Android→Web、Web→Android、Entry/Place conflict、delete no-revival 全部真数据 PASS；浏览/编辑/删除/重启结果正确；不得用静态检查代替 T033/T037/T043/T053/T062/T077/T085 的真机或真数据证据。
    - 证据：Development Build 标识、设备型号与 Android 版本；typecheck/tests/`expo-doctor`；T010 Web build；上述真机任务的命令、脱敏日志摘要/必要截图；同步测试的 Android/Web 双端行与 revision 摘要。凭据、token、完整 OAuth callback URL 不入证据。
    - 是否允许进入下一段（HD-01=B 已决）：MVP Gate PASS 由 TM 记录为内部检查点，不暂停、不触发中途 Human Gate，可直接进入 T086 连续开发；Gate FAIL 一律不得进入 T086。
  - **完整 V1 Gate｜全范围发布候选门禁**
    - Txxx 集合：本 Gate 的新增执行集合为 `T086–T120`，前置是 MVP Gate 已 PASS；累计完成集合必须为 `T001–T120`。任务不与 MVP Gate 重复归属。
    - 通过产物：Preview internal APK、Production AAB-ready profile、完整 Execution Summary、FR/SC traceability、已知问题清单，以及 T086–T120 逐项 Evidence。
    - DoD：T086–T120 全部完成且无 blocker，累计 T001–T120 全完成；Search/AI/Share/Location 独立验收 PASS；只有本 Gate 验收 Final Manifest（T108）、安全（T109–T111）、升级保留（T112/T116）、最终 Web 回归（T114）、完整跨端主流程（T118）；T113/T115/T117/T119/T120 同时 PASS 后才允许 `ANDROID_V1_READY = PASS`。
    - 证据：T108 merged manifest；T109 tracked/bundle/log 安全审计；T110 私有数据匿名拒绝；T111 Storage 现役策略实测；T112/T116 同 package、同签名、versionCode 递增的覆盖升级前后清单/hash；T114 根 Web build/PWA 回归；T118 Web/Android 双端完整流程证据；T119 Execution Summary；T120 traceability 与 blocker=0。
    - 是否允许进入下一段：PASS 后无下一开发段，可提交 TM/Reviewer 做完整 V1 收口与 Human 验收；FAIL 不得标记 `ANDROID_V1_READY = PASS`，不得以 MVP PASS 代替完整 V1 PASS。
  - 终局验收项唯一归属：Final Manifest=`完整 V1 Gate/T108`；安全=`完整 V1 Gate/T109–T111`；升级=`完整 V1 Gate/T112、T116`；最终 Web 回归=`完整 V1 Gate/T114`；完整跨端验收=`完整 V1 Gate/T118`。MVP 的 T010/T077/T085 是脚手架回归或功能级证据，不构成上述终局项的第二归属。
- R1 Required Fixes 闭环索引：
  1. RF-01｜已关闭｜P0-01 媒体父记录依赖：见 User Flow 6、Technical Approach/媒体 outbox、Risks R-16、DoD/媒体、P0/Persistent Media；映射 T040/T050/T067/T077。
  2. RF-02｜已关闭｜P0-02 OAuth 确定流程：见 User Flow 4–5、Technical Approach/Auth + Session storage、Risks R-08、DoD/Auth；映射 T054–T062。
  3. RF-03｜已关闭｜8 表/Storage/RPC 合同 matrix：见 Technical Approach/合同门禁、Data / API、P0/Setup；在 T012–T013 前完成与评审，未通过则阻断代码实现。
  4. RF-04｜已关闭｜owner mismatch 恢复 UX：见 User Flow 5、Risks R-03、DoD/Owner mismatch、P0/Auth + Owner Binding；纳入 T054–T062 的 owner/session 验收，覆盖 cancel/重启/二次确认，不做自动迁移。
  5. RF-05｜已关闭｜session storage 取舍：见 Technical Approach/Session storage、DoD/Auth、HD-05；基线选 SecureStore adapter，映射 T054–T062。
  6. RF-06｜已关闭｜Photo Picker/最小权限/Play 边界：见 Functional Scope/媒体、Technical Approach/权限、Risks R-17、DoD/安全权限；功能实现映射 T044–T053，终局 merged manifest 唯一映射完整 V1 Gate/T108。
  7. RF-07｜已关闭｜Preview 覆盖升级条件：见 Technical Approach/构建、Risks R-05、DoD/升级与证据；唯一映射完整 V1 Gate/T112、T116，不再并入 T077。
  8. RF-08｜已关闭｜研究结论与评分：见 Key Assumptions 的“未验证”标签、Competitor / Research Summary 范围限定、下方 V1.4 Readiness 重评及 TASKS 证据附录；不把实施期运行试验或竞品未研究计为已验证。

- Appendix A｜SDD TASKS 权威摘录与 RF 覆盖（R3-01 证据链）：
  - 提取方式：只读命令 `unzip -p '<zip>' '*TASKS*'`；以下“包内原文”逐字来自该输出，没有用计划中的旧 T 编号引用反推原文。
  - zip 路径（审阅机现址；相对路径基准＝仓库根）：`../../../../Downloads/大模型 HANDOFF/开发计划/2026-09-18 丨 macOS 丨 Expo 丨 Place Journal安卓APP-SDD开发包 丨 V1.2.zip`；等价绝对值＝`/Users/zzymima0000/Downloads/大模型 HANDOFF/开发计划/2026-09-18 丨 macOS 丨 Expo 丨 Place Journal安卓APP-SDD开发包 丨 V1.2.zip`。该位置用于本轮审计，不作为 Phase2 运行依赖；若移动文件，须以 SHA-256 重新定位同一包。
  - zip SHA-256：`be4f94f42ef80d38c8d1db6295c3baaf16470cd7678496189e3e3a8ca8e92af2`。
  - 包内成员名：`2026-09-18 丨 macOS 丨 Expo 丨 Place Journal安卓APP-SDD-TASKS 丨 V1.2.md`；成员大小 `18720` bytes，`343` 行；对 `unzip -p` 输出计算的成员 SHA-256：`a3dcd5d0384b32b1fb1dc2c20fc7414b32877547e600b653a31d2a2751e86442`。
  - 原包全局前置/证据规则：按 phase 顺序执行；Foundational 未完成不得进入 User Story；`[P]` 仅表示前置满足后可并行；每个验收任务完成后在 TASKS 对应任务下写 `Evidence: <命令/设备/构建号/结果/必要截图路径或日志摘要>`；不记录 Secret、token、完整 OAuth callback URL；真机任务必须写设备型号、Android 版本和 App build 标识。原包未给普通实现任务逐条另写 DoD/Evidence 行，所以下列“计划验收解释”是 V1.3 对原文的可执行补充，不冒充包内原文。
  - **T012**
    - 包内原文：`- [ ] T012 建立移动端领域类型并与 Web \`src/lib/types.ts\` 对照 — \`mobile/src/domain/types.ts\``
    - 前置：原包 phase 顺序要求 T001–T011 已完成；直接依赖 T011 的 Expo 兼容依赖已锁定，并以现役 Web `src/lib/types.ts` 为对照真源。T012 属 Foundational，未完成不得进入任何 User Story。
    - DoD/证据：`mobile/src/domain/types.ts` 覆盖八表与同步所需字段，逐字段记录类型、null/default、owner/client_id、revision/baseRevision；Reviewer 可从对照矩阵回溯 Web 真源。证据为字段矩阵/评审结论、typecheck 结果和必要的差异摘要；无凭据。
    - RF 覆盖：主覆盖 RF-03（8 表/Storage/RPC 合同 matrix 的类型起点）；为 RF-01 的 Place/Entry/media 依赖和 RF-04 的 owner 字段提供类型前提。
  - **T040**
    - 包内原文：`- [ ] T040 [US002] 保证本地实体写入与 outbox enqueue 同 transaction 或等价原子边界 — \`mobile/src/db/repository.ts\``
    - 前置：T001–T033 Foundational Gate 已通过；US002 内直接依赖 T038 Place repository、T039 Entry repository，且依赖 T014–T020 的 SQLite/repository/outbox 基础。
    - DoD/证据：实体写入与对应 outbox op 必须全成或全败；在 commit 前、commit 后、异常/杀进程边界均不得出现“实体存在但 op 丢失”或“op 存在但实体缺失”。自动化证据由 T042 提供，真机飞行模式保存/杀进程/重开证据由 T043 提供。
    - RF 覆盖：主覆盖 RF-01（媒体/父记录 DAG 的原子起点），同时支持 RF-03 的操作合同与幂等边界。
  - **T050**
    - 包内原文：`- [ ] T050 [US003] 实现 media repository 与 upload_media outbox — \`mobile/src/db/repository.ts\`, \`mobile/src/sync/outbox.ts\``
    - 前置：MVP 前序 T001–T043 已通过；US003 内直接依赖 T044–T049 已完成 picker 恢复、持久目录、临时 URI 复制及 display/thumb 生成；复用 T040 的事务原子边界。
    - DoD/证据：media row、local path/order/size 与 `upload_media` op 可持久恢复；op 明确关联 Entry/媒体及依赖节点，失败不删本地文件。T052 提供 repository/顺序/ArrayBuffer 相关自动化证据，T053 提供至少 2 图、杀进程与 Activity 回收真机证据。
    - RF 覆盖：主覆盖 RF-01（media 节点及 outbox 依赖）；部分覆盖 RF-06（Photo Picker/最小权限链的媒体落库结果），权限终局结论仍只由 T108 给出。
  - **T054**
    - 包内原文：`- [ ] T054 [US004] 使用稳定 scheme/path 生成并校验 App redirect — \`mobile/src/supabase/auth.ts\``
    - 前置：MVP 前序 T001–T053 已通过；直接依赖 T007 的最终 package/scheme、T022–T023 的 Supabase client/session helper、T026/T033 的 Development Build；HD-02 已决；HD-03 已决且 Auth allow list 加白为 Phase2 前置动作，在 allow list 实际生效前只能完成不绑定真实外部配置的实现与单测，不能宣称真机 PASS。
    - DoD/证据：只接受 Human 确认的唯一精确 scheme/host/path，Provider callback 与 App redirect 分层；错误 redirect 被拒绝且不换码。实现/单测可记录脱敏 redirect 组成摘要，完整 callback URL、code、token 不入证据；真机结果由 T062 收口。R4-03 补充：同一 PKCE transaction 的 `code_verifier` 由与 session 共用的 SecureStore adapter 持久化（T055/T056 单测覆盖写入后模拟冷启动可读、缺失/过期时失败不重试）。
    - RF 覆盖：主覆盖 RF-02（PKCE 精确回调入口）；为 RF-05 的 SecureStore session 流程建立回跳前置。
  - **T062**
    - 包内原文：`- [ ] T062 [US004] 真机执行 A 登录/重启/logout/B mismatch — \`specs/001-place-journal-android/tasks.md\``
    - 前置：T054–T061 全部完成；HD-02/HD-03/HD-05 已决；HD-04＝单机 Redmi Note 12 Pro、无双账号资源（双账号 mismatch 拆条降级为接受风险＋延后）；HD-03 操作路径为 Phase2 前置核验动作（不计 blocking）；使用 Development Build 而非 Expo Go，仅需一个不入文档的测试账号。
    - DoD/证据（HD-04 拆条）：单机可做项——真机完成单账号登录、重启恢复 session、logout 不删业务数据，并做 owner binding 阻断走查（`bound_owner_user_id` 与当前账号不一致时 push/pull 被阻断、cancel/重启不改 owner 与数据）；同时覆盖取消/error/重复 deep link、换码中断与无 session 重新登录路径。双账号 mismatch 项（登录 A→logout→登录 B 后 owner mismatch 整体阻断）因无第二账号资源拆出，降级为接受风险＋延后，T062 先以单账号路径收口、不阻塞 MVP Gate。Evidence 必须写设备（Redmi Note 12 Pro）/Android/build/result 和脱敏日志摘要，证明同一指纹只换码一次且 SQLite/日志/证据无 code/token；不写账号凭据。R4-03 补充：本任务必须覆盖“换码后杀进程、冷启动 callback”路径——冷启动时 `code_verifier` 由 SecureStore adapter 读出方能完成 `exchangeCodeForSession`；若 verifier 不可读则按安全降级到 `terminal_reauth` 并显示重登入口。两条路径均需真机结果，证明冷启动 DoD 可达；不得用静态检查代替。
    - RF 覆盖：收口 RF-02（OAuth/PKCE）、RF-04（owner mismatch 恢复 UX）与 RF-05（SecureStore session 取舍）的 MVP 真机证据。
  - **T067**
    - 包内原文：`- [ ] T067 [US005] 实现 upload_media cloud dispatcher 与 remote path 落盘 — \`mobile/src/sync/push.ts\``
    - 前置：MVP 前序 T001–T062 已通过；US005 内直接依赖 T063 mapping、T064 expected-revision、T065 tag dependency、T066 ensure place；同时依赖 T040 原子边界、T050 media outbox 与 T051 ArrayBuffer adapter。
    - DoD/证据：严格执行 `ensure_place → upsert_entry → upload_media → upsert_media_row → patch_entry_cover`；父节点失败时子节点保持 blocked/pending 且不发送；成功后 remote path 持久落盘；重启只续未达成节点，重复重放由幂等键/云端回读校准。自动化故障注入证据由 T076 提供，真数据结果由 T077 提供。
    - RF 覆盖：主覆盖 RF-01（媒体父子次序/可重放 DAG）与 RF-03（Storage 操作合同）；依赖 RF-06 的 ArrayBuffer/权限边界，但不承担最终 manifest 审计。
  - **T077**
    - 包内原文：`- [ ] T077 [US005] 执行 Android→Web / Web→Android / conflict / delete no-revival 真数据验收 — \`specs/001-place-journal-android/tasks.md\``
    - 前置：T063–T076 全部完成，且 T062 Auth/owner binding 已通过；现役 Web、Supabase/RLS/Storage 与 Android 真机可用。它属于 MVP Gate 的功能级同步验收，不是完整 V1 Gate/T118 的全功能跨端主流程。
    - DoD/证据：Android→Web、Web→Android、Entry conflict、Place conflict、Android delete→Web 消失、delete no-revival 六组真数据 PASS；额外证明父节点失败时子 op 未发送、恢复后只续未达成节点、不重复 media、不静默覆盖 cover。Evidence 写设备/Android/build、双端操作、脱敏实体/revision 摘要、结果和必要截图/日志。
    - RF 覆盖：最终收口 RF-01 的真数据 DAG/重放结果并验证 RF-03 的现役云合同；不覆盖 RF-07 升级，也不替代 RF-06 的 T108 manifest 终局证据。
  - **RF-01～RF-08 覆盖矩阵**
    1. RF-01：T040（实体+outbox 原子边界）→T050（media+upload op）→T067（云端 DAG dispatcher）→T077（父失败/恢复/真数据验收），四层闭环。
    2. RF-02：T054 建立精确 PKCE redirect；T062 收口登录、回调、中断、重启和重复回调真机证据；中间实现任务为 T055–T056。
    3. RF-03：T012 是类型合同起点；T040/T067 实现操作/依赖合同；T077 在现役 Web/Supabase 上验证。完整矩阵仍须在 T012–T013 代码前通过评审。
    4. RF-04：T062 直接验收账号 A→logout→账号 B mismatch；实现位于 T057–T060，含导出后清空/二次确认的补充测试。
    5. RF-05：T062 直接验收 SecureStore session 重启恢复与 logout 清 token；实现位于 T022–T023/T055–T059。
    6. RF-06：所选摘录中 T050 证明媒体持久化结果、T077 证明上传结果；Photo Picker/权限实现由 T027–T029/T044–T053 完成，唯一终局 manifest 证据为完整 V1 Gate/T108。不存在用 T077 代替 manifest 的空覆盖。
    7. RF-07：七条摘录不承担升级 PASS；唯一覆盖为完整 V1 Gate/T112（真实旧数据 migration）与 T116（同 package/签名、versionCode 递增的覆盖安装）。这是明确的“未落在抽样七条内”，不是漏项。
    8. RF-08：由本附录的 zip/member 双 SHA-256、逐条原文与“原文/计划解释”分层，以及 V1.4 Readiness/Gate 自评覆盖；运行试验仍标未验证，不虚增分。
- Human Decisions Needed：
  - HD-01｜交付切片二选一：**已决（2026-09-18）＝B｜连续开发**。B：`T001–T085` 通过 MVP Gate 后只由 TM 记录内部检查点，不暂停，连续完成 `T086–T120`，最终只请 Human 验收完整 V1 Gate。（备选 A｜分段停靠：完成 `T001–T085` 并通过 MVP Gate 后暂停，请 Human 验收核心记录/同步 MVP，明确接受后才进入 `T086–T120`。）两项保留相同 MVP Gate 与完整 V1 Gate、相同 T001–T120 总范围和最终 DoD；本计划按已决 B 执行，全文 MVP Gate 相关“暂停验收”表述同步为连续开发，不再保留 MVP PASS 后暂停等 Human 的条件分支。
  - HD-02｜**已决（2026-09-18）：同意基线**。App identity 与构建归属：确认是否采用 `com.wanghoufan.placejournal` 同时作为 Android package 与 Expo scheme，并确认由哪个 Expo/EAS 账号持有项目、Android credentials 与构建资源。建议沿用 SDD 基线，避免临时 scheme 导致 OAuth 回跳漂移。
  - HD-03｜**已决（2026-09-18）：操作人＝实施方（待 Phase2 核验 Dashboard/Management API 操作路径；无权限则打回用户自助），列为 Phase2 前置动作，不计 blocking**。Auth 外部配置：授权在现有 Supabase 项目的 Auth Redirect URLs allow list 中加入最终 Android App redirect。Google Provider callback 继续使用现有 Supabase callback，不把 App redirect 填到 Google Provider 层。
  - HD-04｜**已决（2026-09-18）：设备定为 Redmi Note 12 Pro 单机（记录 Android 系统版本），无第二账号资源**。据此把 owner-mismatch 真机项拆分为：① 单账号登录/退出/重登＋绑定阻断走查＝单机可做，纳入 T062 与 MVP Gate；② 双账号 mismatch（登录 A→退出→登录 B 后 push/pull 全阻断）＝无资源，降级为接受风险＋延后，T062 拆条标注，不计 blocking，待第二账号资源到位后补测。凭据不入文档。
  - HD-05｜**已决（2026-09-18）：采纳**。Session token 存储：确认采纳 Planner 的 SecureStore adapter 基线（建议）。接受其可缩小普通文件可读面、但不能防御 root/调试包/日志泄漏，且必须通过原生 build 实测的取舍。
- Readiness Score（Plan Readiness Score / 计划成熟度，满分 100）：
  - 产品目标与用户需求（20）：20/20。目标、用户、非目标、十一条主流程及 owner mismatch 恢复体验已明确；交付分段已由 HD-01=B（连续开发）拍板。
  - 核心方案完整性（20）：20/20。媒体 DAG、OAuth PKCE（含 verifier 持久化与重叠流策略）、session storage 唯一口径、合同 matrix、升级和权限边界已有可实施合同；MVP/完整 V1 的任务切片、产物、DoD、证据和前进条件已唯一化。
  - 外部事实与竞品验证（20）：17/20。SDD TASKS 已用 `unzip -p` 从 V1.2 zip 读取，并记录 zip/member 双 SHA-256、成员名和七条原文；仓库与官方能力依据已核对。竞品只作范围取舍；redirect allow list、EAS 归属、RLS/Storage 和真机运行仍未验证。
  - 技术可行性（15）：12/15。设计路径与现役 Web 语义相容，PKCE verifier 路径已补（R4-03），但 Expo 组合、SecureStore 冷启动换码、RN Storage、Activity 回收和跨端同步仍需 Development/Preview Build 真机证明。
  - 风险与异常场景（10）：9/10。R1 指出的媒体 FK 时序、回调重入、令牌存储、owner 恢复、签名升级和 Play 边界已有控制；R4-01 的安全判据矛盾已收敛为唯一可审计表述；真机反证待实施。
  - 开发范围与 DoD（10）：9/10。七条关键 TASKS 可逐字复核，RF-01～RF-08 无空覆盖；两个 Gate 的 Txxx 集合及终局项归属明确，Gate blocking P1 口径已与 HD 分离。真实实施证据尚待 Phase2。
  - 未决问题（5）：5/5。R3-01/R3-02 及 R4-01～R4-04 已由 V1.4 文本关闭；HD-01～HD-05 五项 Human 决策已全部拍板（HD-01=B 连续开发、HD-02 同意基线、HD-03 实施方操作＋Phase2 前置核验、HD-04 单机 Redmi Note 12 Pro＋双账号 mismatch 降级接受风险＋延后、HD-05 采纳），无遗留未决 Human 事项；HD-03 操作路径属 Phase2 前置核验动作，不计 blocking，HD-02～HD-05 凭据不得入文档。
  - 合计：92/100
  - Gate（进 Human Review 条件）：Readiness >= 90 AND P0 = 0 AND blocking P1 = 0 AND 关键事实已验证 AND 核心假设已合理验证
  - Gate 自判：**通过**。当前 Readiness 92（V1.5）；未解决计划 P0=0；blocking P1=0（R4-01/R4-02 已关闭；HD-01～HD-05 已全部拍板且不计入 blocking P1）。SDD TASKS 来源、任务/Gate 边界与安全判据已验证；Expo/EAS 归属、redirect allow list、运行组合、SecureStore 冷启动换码、RLS/Storage、OAuth 与跨端同步等核心运行假设已由官方文档合理验证（真机证据属 Phase2）。**自判：满足进 Human Review 条件，PLAN_GATE=READY_FOR_HUMAN_REVIEW，等用户最终 APPROVED。** 用户明确说`第二阶段，开发`前不进入 DEVELOP。
- Research Review Round（第几轮/Reviewer 结论摘要）：R3（2026-09-18）FAIL 81/100，新增 R3-01/R3-02；R4（2026-09-18）FAIL 87/100，确认 R3-01/R3-02 已关闭，新增 R4-01（token 存储表述矛盾，blocking）、R4-02（HD 计入 blocking P1 造成死锁，blocking）、R4-03（PKCE verifier 持久化/重叠流未写明，非阻塞 P1）、R4-04（zip 路径基准，P2）。本 Round 5/V1.4 已：① 将存储口径收敛为全计划唯一表述——code 原文禁落盘一切存储；access/refresh token 只允许由 SecureStore adapter 持久化、禁入 SQLite/AsyncStorage/日志；User Flow 4/5、Technical Approach/Session storage、DoD/Auth、HD-05 四处改到一字一致，DoD 判据改为可 grep 审计，关闭 R4-01；② 明确 Gate 的 blocking P1 仅指计划评审技术问题，HD-01～HD-05 移出 blocking P1、归 Human Decisions Needed 并在 WAITING 拍板，同步修订 P1 节与 Gate 自判口径，关闭 R4-02；③ 补写 PKCE `code_verifier` 由与 session 共用的 SecureStore adapter 持久化、默认单流策略与 T055/T056/T062 验证条目，关闭 R4-03；④ Appendix A zip 路径注明基准＝仓库根并附绝对路径，关闭 R4-04。Planner 自评四项均已关闭；R5 复核通过（90 分，建议 WAITING）。R6＝Human 决议微调（2026-09-18）：按 Human Gate 决议把 HD-01～HD-05 全部落字为已决，并同步 MVP Gate 为 TM 内部检查点（HD-01=B）、T062 双账号 mismatch 拆条降级为接受风险＋延后（HD-04）、HD-03 列为 Phase2 前置动作；改动面仅 HD 落字及相关同步句，免 R6 评审（无新增实质内容需独立复核）。
- PLAN_GATE：READY_FOR_HUMAN_REVIEW（HD-01～HD-05 已全部决出并落字；等用户最终 APPROVED）
