# AUTH_REDIRECT｜OAuth App 回调精确串（T054 / HD-02 / HD-03）

> 本文只登记 App redirect 的**唯一精确串**与配置路径；不含任何凭据、`code`、token。
> 真源常量：`mobile/src/supabase/constants.ts` 的 `AUTH_REDIRECT_URI`（与本串逐字一致）。

## 1. 精确 redirect 串（HD-02 基线）

```text
com.wanghoufan.placejournal://auth/callback
```

组成（三者任一变化即 OAuth 回跳漂移，禁止临时 scheme）：

| 部分 | 值 |
|---|---|
| scheme | `com.wanghoufan.placejournal`（与 `app.config.ts` 的 `scheme`/`android.package` 一致） |
| host | `auth` |
| path | `/callback` |
| 去重指纹用路径串 | `auth/callback` |

回调校验口径（`src/supabase/redirect.ts`）：只接受上表 scheme/host/path 全等，错误
redirect 一律返回 `invalid` 且不换码；回调先处理 `error/error_description`，再取一次性 `code`。

## 2. HD-03 待办（用户自助，Phase2 前置，不计 blocking）

Console 操作路径：Supabase Dashboard → 目标项目 → **Authentication → URL Configuration → Redirect URLs**
→ 添加上方精确串并保存。

- Provider callback 与 App redirect 分层：Google Provider 层继续使用现有 Supabase callback，
  **不要把 App redirect 填到 Google Provider 层**。
- 本项目无 Management API token、无 CLI 登录态，实施方无法代加 allow list；allow list 生效前
  只能完成不绑定真实外部配置的实现与单测，不得宣称真机 PASS（真机收口见 T062）。
- 凭据、完整 callback URL、`code`、token 一律不入本文档与 git。

## 3. 客户端环境变量（只允许 publishable，禁 service_role）

`mobile/.env.example` → 复制为 `mobile/.env` 后填真实值（`.env*` 已 gitignore）：

```text
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

`EXPO_PUBLIC_*` 会打进客户端包，只放 publishable key；缺省时 `isSupabaseConfigured()` 为 false，
App 不发起真实登录（本 Task 真登录留 T062）。
