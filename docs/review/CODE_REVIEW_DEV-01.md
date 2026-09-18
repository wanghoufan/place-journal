# CODE REVIEW

- Task: TASK-DEV-01（Setup 脚手架，SDD T001–T011 / PRODUCT_PLAN_V1.5 工程 DoD）
- Commit: N/A（`mobile/` 全为 untracked 新建，未 commit；`git status --short -- mobile` 仅 `?? mobile/`，无已跟踪根文件被 builder 改动）
- Reviewer: code-reviewer（本窗口直派，独立 Session 只读复核，未改任何文件、未起 dev、未 commit）
- Result: 过 — 不打回 builder，放行 qa（附 0 P0 / 0 P1 / 4 P2，证据缺口交 QA 执行验证）

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## P0 / P1 Findings

- 无。本轮七查均通过：
  1. DEV_BASELINE 一致：`scheme`/`android.package` 均为 `com.wanghoufan.placejournal`（HD-02 基线），与 Plan User Flow 4 / T054 前置一致；`blockedPermissions` 含 `RECORD_AUDIO`、`ACCESS_BACKGROUND_LOCATION`、`FOREGROUND_SERVICE_LOCATION` 三项，`expo-image-picker.microphonePermission=false`，`expo-location` 关闭后台/前台服务，与 Technical Approach/权限、DoD/安全权限一致。
  2. Requirement 覆盖（T001–T011 Setup 范围）：`mobile/package.json`（Expo ~57.0.23 / RN 0.86.3 / Router / SQLite / SecureStore / Network / ImagePicker / Location / WebBrowser 全齐）、`package-lock.json`（447KB 已落盘）、`tsconfig.json`（`extends expo/tsconfig.base` + `strict` + `@/*` 路径）、`app.config.ts`、`eas.json`（development/preview=APK + production=app-bundle 三 profile 齐全）、`__tests__/appConfig.test.ts`（2 用例锁定 package/scheme/blockedPermissions）、`app/` 四 tabs + entry/place/ai-confirm/tags/conflicts 路由与 Functional Scope 页面清单一致、`src/components/ScreenPlaceholder.tsx` 占位、`src/{db,domain,media,services,supabase,sync,test}` 目录预留、`assets/images` 六图齐全、`.env.example` + `.gitignore` 正确。
  3. 工程 DoD 达成（静态侧）：lockfile 有；typecheck/tests/doctor 脚本齐（`typecheck: tsc --noEmit` / `test: jest` + `jest-expo` preset / `doctor: expo-doctor`）；三 build profile 语义正确（development 含 `developmentClient:true` + APK，preview 为 internal APK，production 为 AAB + autoIncrement）。
  4. Diff 越界：无。`git diff --stat -- mobile` 为空（全新建）；rg 全仓 `mobile/` 内无 `service_role/DB password/Client Secret/token/exchangeCodeForSession/setSession/AsyncStorage/code_verifier/supabase.schema` 命中（exit 1 干净）；`.env.example` 仅 `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_PUBLISHABLE_KEY` / `EXPO_PUBLIC_WEB_BASE_URL`，无 Secret；未碰根 Web 业务文件（根 status 改动仅治理迁移文件，与 builder 无关）。
  5. 回归影响：无。builder 未改 `src/`、根 `package.json`、Vercel/`api/`、现役部署结构；`mobile/` 独立工程，符合“不替换不迁移 Web”基线。
  6. 可回滚性：好。删除 `mobile/` 即回滚，无 DB migration、无生产配置变更（`PRODUCTION_DB_MIGRATION=0` 未触及）。
  7. Scope creep：无。路由页全为占位 `ScreenPlaceholder`，未提前实现 T012+（类型/SQLite/Auth/Sync），`src` 空目录无超前代码，符合“Setup 先行”节奏。

## P2 / P3 Backlog Findings

- P2-1｜版本号不一致：`mobile/package.json: version=1.0.0` vs `app.config.ts: version=0.1.0`。无功能影响，建议收尾统一为 `0.1.0`（与 `versionCode: 1` 对齐），留 builder 下一 Task 顺手改。
- P2-2｜空目录不可提交：`src/db、domain、media、services、supabase、sync、test` 七个空目录在磁盘存在但不在 `git ls-files --others` 中（git 不跟踪空目录）。建议 T012 起有实质文件自然解决；若需占位请加 `.gitkeep`，否则此条可忽略。
- P2-3｜`lint: expo lint` 无配套 eslint 配置：`mobile/` 下无 `eslint.config.*` / `.eslintrc`，跑 `npm run lint` 会失败或提示缺配置。不阻塞 Setup（根计划未把 lint 列为工程 DoD），建议要么补 eslint 配置、要么删该 script，交 QA 记录实际行为。
- P2-4｜模板冗余依赖：`@expo/ui`、`expo-glass-effect` 为 Expo 模板默认带入，V1 用不上。当前无害（lockfile 已锁定），建议 Foundational 结束前评估移除以减包体积；不作为本轮打回项。
- 交 QA 的证据缺口（非评审问题，reviewer 按“只读不执行”约束未跑）：builder 自称 `doctor 21/21、tsc 0 错、jest 2 过、根 build 回归 PASS`，本复核仅做了静态一致性确认，未独立执行；请 QA 按 V1.5 DoD 实际运行 `npm run typecheck / npm test / npm run doctor`（mobile 内）与根 `npm run build` 并落证据；真机/EAS 构建属后续 Task，不在本轮断言。
