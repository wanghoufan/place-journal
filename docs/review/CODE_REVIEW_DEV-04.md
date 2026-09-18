# CODE REVIEW

- Task: TASK-DEV-04 媒体持久层本地段（T044–T050＋Record 占位接入；基线 PRODUCT_PLAN_V1.5）
- Commit: `mobile/` 全目录 untracked（`git status` 仅 `?? mobile/`，`git diff HEAD -- mobile/` 为空，无可审 commit；属新链首交预期内）
- Reviewer: code-reviewer（本窗口直派，只读不改）
- Result: 过（不打回；P0=0 / P1=0；下述 P2 留 Foundational 收尾或后续 Task 顺手收敛，不阻塞 DEV-04 进入 qa→supervisor）

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## P0 / P1 Findings

- 无。逐项对照结论：
  - 权限口径：`mobile/app.config.ts:43-48` `microphonePermission=false` ＋ `mobile/app.config.ts:21-25` 阻断 `RECORD_AUDIO/ACCESS_BACKGROUND_LOCATION/FOREGROUND_SERVICE_LOCATION`，与 Plan§Technical Approach/权限一致；`mobile/src/media/picker.ts:99-129` 相册路径（`pickFromLibrary`）不申请媒体库权限、相机先显式请求被拒抛 `MediaPickerError` 回手工填写，与 FR-029/RF-06“Photo Picker 优先、不主动申请广泛权限、拒绝保留文字能力”一致。`requestPermission('library')` 仅为接口保留能力，Record 页（`mobile/app/(tabs)/record.tsx:73-95`）相册分支未调用，不构成主动申请。
  - 临时 URI 必复制：`mediaService.ts:70-75` 每张 `process→copy display→copy thumb` 进 `place-journal/media/<entryId>/<mediaId>/` 后才落库；Record 缩略图渲染用 `localThumbPath`（`record.tsx:132`），无直接引用 `asset.uri`；测试证实持久路径断言（`mediaService.test.ts:89-94`）。
  - 尺寸：`processImage.ts:12-15` display 2560/0.85、thumb 640/0.7，不放大（`computeTargetSize:43-44`），与 Plan“对齐 Web `src/lib/image.ts`”一致；单测覆盖横/竖/小图/非法（`processImage.test.ts`）。
  - 顺序/封面：`LIBRARY_PICK_OPTIONS:39-46` `orderedSelection:true`；`mediaService.ts:64/87/91` 按选择顺序 `order` 落库＋默认首图封面经 `saveMediaBatch` 同事务回填（`repository.ts:195-225`）；单测覆盖顺序与 `cover_media_id=m1`（`mediaService.test.ts:101-137`）。
  - remote/storage 置空：`mediaService.ts:104-105` `remote_path/remote_thumb_path=null`、`sync_status='local'`，单测断言（`mediaService.test.ts:97-98`）；注释明示上传归 T051/T067，本轮不接网络（`mediaService.ts:10`）。
  - 失败回滚：处理/复制失败删已复制文件、不落 media/op/封面（`mediaService.ts:112-121`，单测 `mediaService.test.ts:139-155`）；DB 失败同样清文件后抛（`157-176`）。
  - 原子入队复用：复用 `Repository.saveMediaBatch` 同一 `withTransactionSync`（`repository.ts:199`），media 行＋逐条 `upload_media`（`dependsOn` 透传）＋封面回填全成全败；Record 侧 `dependsOn:[entryOpId]` 经 entry 间接依赖 place，符合 `Place→Entry→media` DAG 方向。
  - 越界/密钥：`mobile/src/media/` 四实现文件 import 仅 `expo-image-picker/expo-file-system/expo-image-manipulator`＋内部 `picker/localFiles/domain/ids/db/repository`；grep 全 `mobile/src` 无 media 对 `supabase/storage/upload/Auth/网络/service_role/API_KEY` 的真实调用（命中均为注释、类型注释与 outbox kind 字符串）；无 Secret 落盘。
  - 未碰根业务/治理：`git status` 除 `?? mobile/` 外干净；`docs/handoff/HANDOFF.md`、`docs/pm/`、`docs/review/` 均未改动。

## P2 / P3 Backlog Findings

- P2-1（小）：空选择仍进一次空事务。`mediaService.ts:64-109` `assets=[]` 时仍走 `saveMediaBatch([],…)`（单测 `mediaService.test.ts:178-186` 证无副作用）。建议 `drafts.length===0` 时提前 `return []`，省一次事务。非阻塞。
- P2-2（小）：回滚只删文件不删已建空目录。`ensureDirectory`（`localFiles.ts:64-66`）建的 `<entryId>/<mediaId>/` 在失败时残留空目录。孤儿空目录无数据风险，建议后续 Task 顺手补 `remove(dirUri)` 或 sweeper。非阻塞。
- P2-3（小）：`recoverPending`（T045）实现已接但 `picker.test.ts` 仅覆盖 `normalizePickerResult/permissionState`，无 `getPendingResultAsync→normalize` 的单测。建议补一例 mock。非阻塞，真机 Activity 回收仍归 T053。
- P2-4（提示）：`requestPermission('library')` 内 `requestMediaLibraryPermissionsAsync` 为降级保留能力，当前无调用方。进入 T108 前建议在调用处加注。非阻塞。
- P2-5（提示）：Record 占位 `ensureDraft` 每次冷启动首存新建父节点属占位语义，正式表单 Task 会替换。非阻塞。
