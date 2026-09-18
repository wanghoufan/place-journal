# BUGS

- Task: TASK-DEV-01（Setup 脚手架，SDD T001–T011 / PRODUCT_PLAN_V1.5 工程 DoD）
- QA 通道/Runtime: opencode 本窗口直驱（用户指定模型，经 opencode 通道执行；亲手执行命令，非只读）
- Node/npm: PATH node `v24.19.0`（`/Users/zzymima0000/.nvm/versions/node/v24.19.0/bin/node`）／npm `11.17.0`
- 时间: 2026-09-18 13:45–13:52
- 范围: 工程静态验证（typecheck/test/doctor/根 build/lint/Secret 抽查）。真机、EAS 构建不在本轮。
- **Verdict: PASS — 0 blocking bug（P0=0／P1=0）＋1 条非阻塞 P2（lint 脚本副作用，见 P2-3）＋1 条 QA 过程备注（见下）。**

## 执行证据（独立执行，命令＋exit 码＋关键行）

| # | 命令（工作目录） | Exit | 关键输出 |
|---|---|---:|---|
| 1 | `npm run typecheck`（mobile/） | 0 | `tsc --noEmit`，无任何输出（0 错） |
| 2 | `npm test`（mobile/） | 0 | `PASS __tests__/appConfig.test.ts`；`Test Suites: 1 passed`；`Tests: 2 passed, 2 total`（keeps approved package/scheme、blocks audio+background location） |
| 3 | `npm run doctor`（mobile/） | 0 | `Running 21 checks on your project...` `21/21 checks passed. No issues detected!` |
| 4 | `npm run build`（根） | 0 | `tsc -b && vite build`；`✓ 108 modules transformed`；`✓ built in 933ms`；PWA `precache 13 entries (544.99 KiB)`。仅静态复核已记录的 chunk>500kB 与 dynamic/static import 复用警告，无新错误 |
| 5 | `npm run lint`（mobile/，首次） | **1** | 见 P2-3：自动配置后 `Error: Cannot find module 'eslint'`（完整栈见下） |
| 6 | `npm run lint`（mobile/，二次） | 0 | 配置已存在，`expo lint` 无输出、exit 0（即：lint 配置补齐后可过） |
| 7 | Secret 抽查（rg，mobile/ 内） | 1（无命中） | `service_role|password|secret|SERVICE_ROLE|DB_PASSWORD|apikey|api_key|PRIVATE_KEY|token`：仅 `package-lock.json` 中 `js-tokens` 依赖名 4 处误报，无真实 Secret；`mobile/.env*` 仅 `.env.example`，字段全为 `EXPO_PUBLIC_*`，值留空 |
| 8 | `git status --short`（根） | 0 | 根业务文件（`src/`、`api/`、根 `package.json`、`index.html`、`vite.config.ts`、`public`）无改动（`git status --short -- <上述>` 为空）；`mobile/` 为整体 untracked；被改的跟踪文件仅治理迁移件（`AGENTS.md`、`docs/handoff/HANDOFF.md`、软链 `USER_MODEL_OVERRIDE.md`），与 builder 无关 |

### 命令 5 原始错误摘要（贴错）

```
> place-journal-mobile@1.0.0 lint
> expo lint

No ESLint config found. Configuring automatically.
ESLint is required to lint your project. Installing eslint@^9.0.0, eslint-config-expo@~57.0.2
... npm install ... added 209 packages ...
ESLint has been configured 🎉
Error: Cannot find module 'eslint'
Require stack:
- .../mobile/node_modules/expo/node_modules/@expo/cli/build/src/lint/lintAsync.js
- .../mobile/node_modules/expo/node_modules/@expo/cli/build/src/lint/index.js
- .../mobile/node_modules/expo/node_modules/@expo/cli/build/bin/cli
- .../mobile/node_modules/expo/bin/cli
    at Module._resolveFilename (node:internal/modules/cjs/loader:1517:15)
    at lintAsync (.../@expo/cli/build/src/lint/lintAsync.js:108:28)
```

## Bug 表

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| P2-3 | P2 | No | `cd mobile && npm run lint`（全新无 eslint 配置时） | Open（非阻塞，留 builder 收尾） | TASK-DEV-01 | `expo lint` 首跑自动装 eslint＋生成 `eslint.config.js`＋改 `package.json`/`package-lock.json`，随后仍报 `Cannot find module 'eslint'` exit 1；二次跑 exit 0。lint 不在 Setup 工程 DoD，不阻塞 |

- P2-1（review 遗留，本轮未复测）：`mobile/package.json: version=1.0.0` vs `app.config.ts: version=0.1.0`，非阻塞，留 builder 下一 Task 顺手统一。
- P2-2（review 遗留，本轮未复测）：`src/{db,domain,media,services,supabase,sync,test}` 空目录不被 git 跟踪，非阻塞。
- P2-4（review 遗留，本轮未复测）：`@expo/ui`、`expo-glass-effect` 模板冗余依赖，非阻塞。

## QA 过程备注（重要：工作区被命令副作用改动，非 builder 改动）

- 执行命令 5 `npm run lint` 时，`expo lint` 在无配置状态下**自动改动**了 `mobile/`：
  - `mobile/package.json`：`devDependencies` 新增 `eslint@^9.0.0`、`eslint-config-expo@~57.0.2`；
  - 新建 `mobile/eslint.config.js`（10 行，`eslint-config-expo/flat`）；
  - `mobile/package-lock.json` 由 447,824B 增至 579,795B；`node_modules` +209 包。
- 这些是 QA 跑测试命令引入的副作用，**不是 builder 的交付内容**；QA 未 commit（遵守禁 commit），亦未另行改动业务代码。是否保留该 eslint 配置（等于顺手解掉 P2-3）或回退，请 TM/builder 定夺。
- 除上述 lint 副作用外，QA 仅新增本文件 `docs/qa/BUGS_DEV-01.md`，未改动任何其他文件。

## 真机QA会话能力预检结果（本轮不适用）

> 本轮为工程静态验证，无真机/EAS 用例；按 qa 卡“Mac 预检不代 Android/iPhone 验收”，不填预检、不宣称真机能力。

- 最终结论：`NOT_VERIFIED`（真机/EAS 构建留后续 Task；本轮无真机断言）
- 是否允许进入正式真机QA：N/A（本轮非真机会话）

## Fix Attempt Fingerprint

- Task ID: TASK-DEV-01
- Root Cause Hypothesis: 无代码缺陷需修。唯一 P2 为 `expo lint`（@expo/cli）首跑的自动配置流程在同一进程内 require eslint 失败（工具链 bootstrap 时序/模块解析问题），非业务代码问题。
- Approach: 不修（QA 不改代码）；P2 留 builder 收尾决定补齐配置或删 `lint` script。
- Files Changed: 无业务代码改动（仅 QA 新增本报告；lint 副作用文件见上节）。
- Verification: 见执行证据表 #1–#8。
- Failure Reason: 无（P0/P1 全过）。
- Difference From Previous Attempt: N/A（本轮首次 QA 执行）。
