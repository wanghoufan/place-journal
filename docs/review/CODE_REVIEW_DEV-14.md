
# CODE REVIEW

- Task: TASK-DEV-14（首次绑定确认UI，HANDOFF §2 五条锁死范围）
- Commit: 未提交工作树（分支 wanghoufan/master，基线 e996cc6；本次 diff 为未提交改动）
- Reviewer: code-reviewer
- Result: 打回＋改法（P1×3 必改；改完可直接进 qa，无需重审范围外事项）

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## P0 / P1 Findings

- P1-1｜范围扩散：`mobile/package.json` 改动超出 5 条锁死。`expo-dev-client: ~57.0.19` 新增＋`scripts.android/ios` 由 `expo start --android/ios` 改为 `expo run:android/ios`（`mobile/package.json:10,52-53`）与绑定 UI 无关，且任务约束⑤未授权改脚本／加原生依赖。收敛改法：回退该文件两处（删 `expo-dev-client` 行、恢复两条 script 原文），dev-client 需求另起任务经用户拍板后再动。
- P1-2｜文案失实（同步未接线下宣称同步已开始）：`mobile/src/features/account.ts:56-58` `describeLogin` 在 `binding==='match'` 时返回「登录成功，已开始同步。」；而 `createNativeSyncEngines()` 全仓无调用方（HANDOFF §1.3 已登记同步引擎未接线），此时 push/pull 实际未跑。收敛改法（二选一，推荐 A）：A）match 分支改为「登录成功。本机已绑定该账号，同步接线后自动进行。」并同步改 `account.test.ts:65-67` 断言；B）保留原文案但必须在本任务内接线同步引擎——超出范围，不建议。
- P1-3｜自定口径「已登录即显示退出」超范围（技术分歧拍板：不接受现状，要求收敛）。任务②原文为「绑定后出现退出登录」；builder 在 `mobile/src/features/account.ts:27-36` 令 `showSignOut` 在 signed_in 下恒 true（含 unbound），并在注释 `16-20` 自行解释为“退路”。动机可理解，但属放宽②，且 `mine.tsx:184-186` 据此在未绑定态即渲染退出按钮。拍板：mismatch 保留退出（④“重登原账号”需先退，此为任务内隐含要求），unbound 不保留（登错账号退路可用“重装/清数据”或另起任务补“未绑定退出”，不得在本任务顺手加）。收敛改法：`account.ts:33` 改为 `showSignOut: state.binding !== 'unbound'`，注释 `16-20` 同步改为“仅 match/mismatch 显示退出；unbound 不显示”，并改 `account.test.ts:32-38` 用例期望 `showSignOut:false`（unbound），保留 `48-54` mismatch 用例 `showSignOut:true`。
- 非本任务引入（明确免责）：PKCE plain 退化警告（HANDOFF §1.7 `WebCrypto API is not supported…plain instead of sha256`）经核查为 supabase-js 在 Hermes/原生环境无 WebCrypto 时的既有行为，本次 diff 无任何 PKCE/`code_challenge` 改动（grep 仅命中既有注释与旧单测）。安全影响：code_intercept 风险略升，但属平台现状、非本任务回归，不列打回；建议 qa 在真机登录时顺带记录是否仍为 plain，另起任务跟进 S256。

## P2 / P3 Backlog Findings

- P2-1｜`getLoginState` 把“读 session 失败”吞成 signed_out（`mobile/src/supabase/auth.ts:327-333`，用例 `auth.test.ts:273-277` 把 secure store 不可用断言为 signed_out）。当前 Mine 侧 `mine.tsx:45-50` 对抛错本就有退避，service 层再吞错会把“存储故障”伪装成“未登录”，排障困难。建议后续任务改为抛错或返回 `{status:'unknown'}`，Mine 已有 null 分支可接。
- P2-2｜`describeUnboundHint`（`account.ts:79-81`）称“绑定后才会与该账号同步”——同步引擎未接线下仍属未来时承诺，虽比“已开始同步”诚实一个等级，建议后续与 P1-2 同一批改为“绑定是同步的前提；同步接线后自动进行”。
- P3-1｜`callback.tsx:29` mismatch 文案已收敛（删“导出后切号”，改走 `describeCallbackOwnerMismatch()`），符合④；无意见，仅登记。
