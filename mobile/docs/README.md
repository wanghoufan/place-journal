# mobile/docs

- `expo-dev-client` 已移除（TASK-DEV-09 微返工：避免 `expo start` 进 dev-client/update 模式、Expo Go 真机卡 Checking for new update）；待打 Development Build 时再加回（`eas.json` 的 `development.developmentClient` 已保留）。
- 空目录口径（TASK-DEV-13 ⑥，2026-09-19）：`mobile/src/services/` 是空目录（无任何文件、`git` 未跟踪、全仓无 `services` 引用）→ **删除**，不留 `.gitkeep`；其余目录均有实质文件，不动。后续若要新建服务层，按需重建 `src/services/` 并同步本行。
