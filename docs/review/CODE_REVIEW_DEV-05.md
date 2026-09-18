# CODE REVIEW

- Task: TASK-DEV-05 Auth 本地段（PKCE/回调去重/SecureStore/owner 绑定，mock 会话，真登留 T062）
- Commit: 未提交（`mobile/` 全目录 untracked 新建；HEAD 基线 V1.5 未动）
- Reviewer: code-reviewer（本窗口直派）
- Result: 过（无 P0、无 blocking P1；下述 P1 为非阻塞，记入 T057+/T062 集成前置；P2 收尾前清理）

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## P0 / P1 Findings

- P0：0。逐项对照基线（PRODUCT_PLAN_V1.5，R4-01 token 口径、R4-03 verifier、OAuth 状态机、owner binding）全部满足：
  1. redirect 精确串：`constants.ts:20` 由 `APP_SCHEME/AUTH_CALLBACK_HOST/AUTH_CALLBACK_PATH` 拼出 `com.wanghoufan.placejournal://auth/callback`，与派工要求逐字一致；`redirect.test.ts:11-15` 锁死该串并校验与 `app.config.ts` scheme 一致；`redirect.ts:57-65` 做 scheme/host/path 全等校验，`/callback/extra`、`evil host`、`https` 均拒绝（单测覆盖）。
  2. code 原文禁落盘：全仓 grep 无任何 `code` 写入存储路径；`code` 仅以函数参数形式经 `redirect.ts:107-110` → `auth.ts:190-202` 进入 `exchangeCodeForSession`（内存调用链）；持久化记录经 `fingerprint.ts:18-25` 限定六字段（hash/status/receivedAt/updatedAt/expiresAt/errorClass），`fingerprint.test.ts:28-43` 断言 `JSON.stringify(record)` 不含 code 原文、键集合精确六键；`callback.tsx` 无任何打印 URL/code/token 语句。
  3. token 只 SecureStore：`native.ts:51-60` 的 `auth.storage = createSecureStoreAdapter(SecureStore)` 为唯一 token 持久化路径，`flowType:'pkce'`、`detectSessionInUrl:false`、`skipBrowserRedirect:true` 三项与计划一致；全仓 grep 无 `AsyncStorage/localStorage/setSession/SQLite 存 token`；`secureStore.test.ts` 中的 `access_token/refresh_token` 为内存 adapter 形状测试的假值，非真实凭据。
  4. 指纹仅 hash＋TTL：`computeCallbackFingerprint` 为 `SHA-256("place-journal-oauth-v1"+callbackPath+code)` 小写 hex（自带纯 TS 实现规避 Hermes 无 `crypto.subtle`，`sha256.test.ts` 以 `''/abc/中文/😀` 四向量对齐 node:crypto）；TTL=`received_at+24h`（`constants.ts:29`），`sweep` 只删过期（单测覆盖 fresh 保留/stale 删除）。
  5. 中断 session-first：`recoverSession`（`auth.ts:278-292`）先 `safeGetSession`，有 session→`succeeded`＋继续 owner binding，无 session→`terminal_reauth`＋永不重用旧 code；`handleCallback` 对 `received/exchanging/succeeded/terminal_reauth` 四态一律不二次换码（迟到回调返回 `duplicate`），verifier 缺失（`missing_verifier`）与 session 不可再读（`session_not_persisted`）均进 `terminal_reauth` 且单测覆盖不重试。
  6. 单流：`login()` 无有效 session 时先 `markIncomplete('terminal_reauth','superseded')`＋`signOut({scope:'local'})` 丢弃旧 verifier，再建新 transaction；已有有效 session 直接 `already_signed_in` 不新建事务。无 `flowId`/并发流代码，符合 V1 默认单流。
  7. owner 不匹配阻断：`owner.ts` 仅 `match` 放行，`unbound/mismatch` 阻断 push/pull；`handleCallback` 成功后不自动绑定（`auth.test.ts:111-119` 断言 `getBound()` 仍 null，需 UI 显式 `bindOwner`）；`signOut` 不改 `boundOwner`（单测断言）；cancel/重启不改 owner（无任何旁路写 `setBoundOwner`，仅 `bindOwner/unbindOwner` 两个显式入口）。
  8. 无真凭据：`.env.example` 三键全空；grep 无 `service_role/JWT secret/私钥` 落仓；`AUTH_REDIRECT.md` 仅登记精确串与 Dashboard 操作路径，不含 code/token/完整 callback URL，与代码常量有单测对齐（`redirect.test.ts:17-20`）。
  9. 未碰根业务/治理：`git status` 显示根业务零修改；根目录 dirty 项均为治理迁移预留文件；`mobile/` 为纯新增目录，符合“只新增 `mobile/`”边界。
- P1（非阻塞，不打回，转 T057+/T062 集成前置）：
  - P1-1｜冷启动接线尚未落地：`sweepFingerprints/recoverSession/subscribeAuthCallbacks/getInitialAuthUrl/attachAuthAutoRefresh` 在 `native.ts` 已全部导出，但 `mobile/app/_layout.tsx` 内零引用——即“App 启动 sweep＋session-first 恢复＋存活期 scheme 监听”三件套尚未接入。若本 Task 范围确为“本地段纯逻辑＋mock 单测”，则记为 T057+/T062 集成必做项，不得以本轮单测 PASS 代替；QA/T062 验收时必须实证冷启动路径。
  - P1-2｜`OAUTH_EXCHANGE_UNCERTAIN_MS`（2 分钟）仅在 `constants.ts:32` 定义、全仓无任何逻辑引用。当前 `recoverSession` 对全部 incomplete 一视同仁转 `succeeded/terminal_reauth`（比计划更严，安全上可接受），但该常量悬空会造成“计划有数、代码无据”的追溯断点：要么在中断判定中真实使用它，要么删除并在 Plan 侧注明“冷启动不区分时长、一律按不确定处理”。留给 builder 二选一，不阻塞本轮。

## P2 / P3 Backlog Findings

- P2-1｜`callback.tsx:39` 的 `lastHandled` ref 以明文持有完整回调 URL（含一次性 code）直至组件卸载。虽属内存而非落盘、不违反 R4-01，但在 `handleCallback` 返回后即无再用价值，建议处理完后置 `null`，缩小 code 在内存中的存活窗口。
- P2-2｜`parseAuthCallback` 同时接受 query 与 fragment 中的 `code`。PKCE 回调取 query 即可；fragment 兼容扩大了 code 出现面（虽先处理 error、仍需精确 redirect）。建议注释说明保留 fragment 的原因，或收敛为仅 query（改动需同步单测）。
- P2-3｜`classifyExchangeError` 以错误文本含 `verifier` 子串判定 `missing_verifier`。对 supabase-js 英文错误稳定，但属启发式分类：若未来错误文案变化会误归为 `exchange_error`。两者同属 `terminal_reauth` 不重试，行为安全；仅建议补一行注释说明该映射的脆弱性与等价安全性。
- P3-1｜`secureStore.test.ts:20` 用键名 `'code-verifier'` 演示冷启动可读——仅为 adapter 透传演示，非真实 verifier 键（真实 verifier 键由 supabase-js 内部管理）。无安全问题；建议改名（如 `'opaque-key'`）以免后人误读。
