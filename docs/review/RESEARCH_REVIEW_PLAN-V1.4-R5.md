# RESEARCH_REVIEW｜Place Journal Android V1

- Plan Version（评的是哪版 PRODUCT_PLAN）：PRODUCT_PLAN_V1.4（文件现名 `docs/pm/PRODUCT_PLAN_V1.0.md`；文件名与内部版本号不一致，见 P2）
- Review Round（第几轮）：R5（2026-09-18；TASK-PLAN-01 终审）
- Result：PASS｜R4-01～R4-04 经本轮独立逐条验收全部关闭；独立重打 Readiness 90/100；严格按模板 Gate 公式判定通过（Readiness≥90、P0=0、blocking P1=0、关键事实已验证、核心假设已合理验证，HD-01～HD-05 属 Human Decisions 不计入 blocking）。**建议进 WAITING_HUMAN_APPROVAL（PLAN_GATE=READY_FOR_HUMAN_REVIEW）**，HD-01～HD-05 交人拍板。附 2 项非阻塞 P2（措辞/命名），不影响 Gate。

- P0 / P1 / P2：
  - P0：无。R1 的媒体 DAG 与 OAuth PKCE 主合同在 V1.4 仍完整，未发现新增计划 P0。
  - P1：**blocking P1＝0**。R4-01（token 存储判据矛盾）、R4-02（HD 计入 blocking P1 造成死锁）已在 V1.4 关闭；R4-03（PKCE verifier 路径）、R4-04（zip 路径基准）亦关闭。无其他未关闭的计划评审技术 P1。
  - P2（非阻塞，不影响 Gate）：
    - **R5-N1｜“四处改到一字一致”属措辞过强。**第 240 行称“User Flow 4/5、Technical Approach/Session storage、DoD/Auth、HD-05 四处改到一字一致”，但四处文本实为**语义统一**（同一判据的一致表述），并非逐字相同；User Flow 4 为规范句、DoD/Auth 为可 grep 的两条判据，其余为引用式表述。实质无矛盾，建议 Planner 后续把“一字一致”改为“口径一致”以免误导审计；可留待收尾处理。
    - **R5-N2｜文件名与内部版本号不一致。**文件仍名 `PRODUCT_PLAN_V1.0.md`、内部为 V1.4。属历史沿用命名，R4 已如实标注；建议收尾或将文件名与 `PLAN_VERSION` 对齐，非 Gate 项。
  - 另注（非计划缺陷）：DoD/计划 Gate（第 115 行）“所有 blocking P1 已由 Human/TM 给出明确结论”沿用旧措辞；因 blocking P1＝0 属空真命题，不影响判定。

- Key Assumptions（逐条列＋是否成立）：
  - Android 只新建 `mobile/`、不替换 Web/PWA：**成立**；边界清楚。
  - R2-01/R3-01 的权威 TASKS 已内联且可与包原文复核：**成立（本轮独立复核）**；zip/member 双 SHA-256、成员大小/行数、七条标题、全局前置规则与前置任务引用逐项对上。
  - R2-02/R3-02 的 MVP Gate 与完整 V1 Gate 互不冲突、终局项唯一归属：**成立**；P0/P2/HD-01 三处口径一致，本轮复核 T085/T086/T108–T120 边界无误。
  - R2-03 回调去重与中断恢复状态机可实施：**成立**；R4-03 的 verifier 持久化/重叠流缺口已补，且经官方文档与 auth-js 源码核验技术判断正确。
  - HD-01～HD-05 作为 Human 决策与 Gate `blocking P1=0` 的关系自洽：**成立**；V1.4 已把 HD 移出 blocking P1、归 Human Decisions Needed 并明确在 WAITING 拍板（R4-02 关闭）。
  - 核心运行假设（Expo 组合、SecureStore 冷启动换码、RN Storage、EAS 签名连续、跨端同步）：**合理验证层面成立**；均已在计划中标注验证方法并唯一归入两个交付 Gate 的真机证据，属 Phase2 证伪项，不在 PLAN Gate 阻断。

- Verified Facts（已验证事实＋证据）：
  - 本轮以只读管道独立复核（未解压、未落盘）：`shasum -a 256 <zip>` = `be4f94f42ef80d38c8d1db6295c3baaf16470cd7678496189e3e3a8ca8e92af2`，与计划第 176 行一致；`ls -la` 显示 zip 真实存在（27096 bytes）。
  - `unzip -l`：成员 `…Place Journal安卓APP-SDD-TASKS 丨 V1.2.md` 大小 `18720` bytes；`unzip -p | wc -l` = `343`、`wc -c` = `18720`；成员 SHA-256 = `a3dcd5d0384b32b1fb1dc2c20fc7414b32877547e600b653a31d2a2751e86442`。三者与计划第 177 行完全一致。
  - 七条标题逐字核对（包内行号 → 计划行）：T012（45→180）、T040（89→185）、T050（107→190）、T054（119→195）、T062（127→200）、T067（140→205）、T077（150→210）原文与 Appendix A 完全一致。
  - 全局前置/证据规则：包内 §0 Execution Rules（第 1–9 条）与计划第 178 行所述一致（phase 顺序、Foundational 门禁、`[P]` 语义、Evidence 行、不记 Secret/token/完整 OAuth callback URL、真机必写设备型号+Android 版本+build 标识）；原包确未给普通实现任务逐条另写 DoD，计划已标注“计划验收解释，不冒充包内原文”。
  - Gate 边界核验：`grep -cE '^- \[ \] T'` = `120`（T001–T120 完整）；包内第 166 行 T085（US006 末项）、第 175 行 T086（US007/P2 起点）、第 226–238 行 T108–T120（Final Phase）与 V1.4 的 `MVP Gate=T001–T085`、`完整 V1 Gate 新增 T086–T120` 一致，无双重归属。
  - 前置引用真实存在：T011、T038/T039、T044–T049、T055/T056/T061、T063–T066、T076 均在包内。
  - R4-01 实质核验：全文检索 `token|SecureStore|code 原文`，未再发现“SecureStore 可恢复 session”与“SecureStore 无 token”互斥；V1.4 已形成唯一规范句（User Flow 4）＋一致引用（User Flow 5 / 本地层 / Session storage / DoD/Auth / HD-05）。DoD/Auth（第 119 行）为两条可 grep 判据，可单一、无歧义判定。
  - R4-02 实质核验：第 130、139、141、236、239 行口径一致——blocking P1 仅指计划评审技术问题，HD-01～HD-05 在 WAITING 拍板、不计入；Gate 自判据同步为“blocking P1=0”。
  - R4-04 实质核验：第 175 行注明基准＝仓库根并附绝对路径 `/Users/zzymima0000/Downloads/…`。按仓库根上溯四级 `../../../../` 解析为 `/Users/zzymima0000`，与所给绝对路径一致，基准声明正确。
  - 技术核验（R4-03）：Supabase PKCE 官方文档与 `auth-js` 源码确认——`storage` 选项可指定自定义适配器；verifier 创建后存于 `${storageKey}-code-verifier`（即该 `storage`）；换码须同设备/存储；重叠流会覆盖旧 verifier，官方提供 `appendPkceFlowIdToRedirects`/`flowId`（当前为 experimental 需显式开启）。V1.4 第 62 行“与 session 共用同一 SecureStore adapter、随流程持久化”“默认单流”“未来才用 flowId 隔离”的判断成立。

- External Sources（Web Search / Web Fetch / 官方文档 / 官方 GitHub / 第三方 / 社区反馈，附链接）：
  - [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)（2026-09-18 复核）：自定义 `storage` 适配器、verifier 本地创建并存储、换码须同设备、重叠流覆盖旧 verifier、`appendPkceFlowIdToRedirects` 为实验性显式 opt-in。用于 R4-03 技术判断核验。
  - [supabase/auth-js GoTrueClient 源码](https://github.com/supabase/auth-js/blob/master/src/GoTrueClient.ts)：`getItemAsync(this.storage, `${this.storageKey}-code-verifier`)` 证实 verifier 存于所配置的 `storage` 适配器。
  - 沿用 R2–R4 已核验的 Expo OAuth / Expo ImagePicker / EAS APK / Supabase React Native Storage 官方文档；本轮无新增竞品断言。

- Competitor Findings（竞品现状＋对本 Plan 的启示）：
  - 无新增。现役 Web/PWA 仍仅为行为基准，不作 Android 运行可行性证据；计划未把未做的竞品研究计为已验证或加分，口径正确。

- Counter-evidence（反对证据＋成功的相反做法）：
  - 反方：HD 未拍即 WAITING 会否使计划“带病上桌”？——Human Gate 的定义就是承载此类待拍事项；把 HD 当阻断 WAITING 的前置是逻辑倒错（R4-02 已修），反对不成立。
  - 反方：token 应完全移出 SecureStore？——官方 RN 实践与 HD-05 均支持 SecureStore 存 session；R4-01 是判据措辞收敛，非设计被推翻，反对不成立。
  - 反方：跨冷启动换码不可行？——官方支持（verifier 随 storage 持久即可），且计划已给安全降级路径 `terminal_reauth`；R4-03 属补写与加测，反对不成立。

- Unverified Items（未验证项＋验证方法）：
  - Expo 版本组合/`expo-doctor`、redirect allow list、SecureStore session 恢复/刷新/清除、RLS/Storage upsert、EAS 签名连续、Android↔Web 跨端同步：Development/Preview Build 脱敏真机证据，唯一归属两个交付 Gate（T033/T037/T043/T053/T062/T077/T085 及 Final Phase），不可用静态计划替代。
  - code verifier 跨冷启动换码、并发/重叠流：T055/T056 单测 + T062 冷启动真机。
  - 本节各项均为 Phase2 证伪项，不构成本 PLAN Gate 的阻断项。

- Required Fixes（Planner 必须改项，打回依据）：**无（仅剩非阻塞 P2，不影响 Gate）。**
  - 可选（收尾处理即可）：R5-N1 将“一字一致”措辞改为“口径一致”；R5-N2 对齐文件名与 `PLAN_VERSION`。

- Plan Readiness Score（分项打分＋合计，口径以 PRODUCT_PLAN.template.md 为准）：
  - 产品目标与用户需求（20）：19/20——目标、用户、非目标、十一条流程与 owner mismatch 恢复体验明确；交付分段待 HD-01。
  - 核心方案完整性（20）：19/20——媒体 DAG、PKCE（含 verifier 持久化与单流）、session storage 唯一口径、合同 matrix、两段 Gate、升级/权限边界齐备；扣 1 因 RF-03 合同 matrix 仍需在 T012–T013 前实测通过，可能反过来微调字段合同。
  - 外部事实与竞品验证（20）：18/20——TASKS 证据链本轮独立复核成立；官方能力依据已核；redirect allow list、EAS 归属、RLS/Storage 与真机运行仍未验证，竞品未系统研究（计划如实标注）。
  - 技术可行性（15）：12/15——路径与现役 Web 语义相容，verifier 路径已补且技术判断正确；Expo 组合、SecureStore 冷启动、RN Storage、Activity 回收与跨端同步仍待真机证明。
  - 风险与异常场景（10）：9/10——R1 各项控制到位，R4-01 安全判据矛盾已收敛为唯一表述；真机反证待实施。
  - 开发范围与 DoD（10）：9/10——七条 TASKS 可逐字复核、RF-01～RF-08 无空覆盖、两 Gate 边界与终局项唯一归属清楚、blocking P1 口径已与 HD 分离；真实实施证据待 Phase2。
  - 未决问题（5）：4/5——R3-01/R3-02 与 R4-01～R4-04 均关闭；HD-01～HD-05 五项 Human 决策待拍板（属 Human Gate，不计 blocking）。
  - 合计：**90/100**。
  - Gate（进 Human Review 条件）：Readiness >= 90 AND P0 = 0 AND blocking P1 = 0 AND 关键事实已验证 AND 核心假设已合理验证。
  - Gate 终判：**通过**。Readiness 90 ≥ 90；计划 P0=0；blocking P1=0；关键事实（TASKS 来源/哈希/标题/规则、仓库与官方能力）已验证；核心假设（设计级）已合理验证并把运行级证据唯一归入两个交付 Gate。**HD-01～HD-05 不计入 blocking。** 可进入 `WAITING_HUMAN_APPROVAL`（PLAN_GATE=READY_FOR_HUMAN_REVIEW）；Human 未拍 HD 前不得进入 DEVELOP。

- Human-only Decisions（只需人类拍板项）：
  - HD-01｜交付切片 A/B 二选一（A｜T001–T085 过 MVP Gate 后暂停请人验收；B｜连续开发至 T001–T120 只请人验收完整 V1）。具备拍板条件。
  - HD-02｜App identity 与构建归属（是否采用 `com.wanghoufan.placejournal` 作 package+scheme；哪个 Expo/EAS 账号持项目/credentials/额度）。
  - HD-03｜Auth 外部配置（现有 Supabase 项目 Auth Redirect allow list 是否加入最终 Android App redirect；Google Provider callback 不改）。
  - HD-04｜验收资源（≥1 台真实 Android 手机 + 两个测试账号，凭据不入文档）。
  - HD-05｜Session token 存储（确认采纳 SecureStore adapter 基线；接受其不能防御 root/调试包/日志泄漏，须原生 build 实测）。
  - 上述五项凭据均不入计划或 Git；HD 未决不影响进入 WAITING，但 Human 拍板前不得进入 DEVELOP。

- Next Action：**进 `WAITING_HUMAN_APPROVAL`（PLAN_GATE=READY_FOR_HUMAN_REVIEW）**。TM 停循环、只找人一次，携 HD-01～HD-05 请 Human 拍板；仅当用户明确说“第二阶段，开发”才进 DEVELOP。非阻塞 P2（R5-N1 措辞、R5-N2 文件名）可留待收尾或 neat 处理。
