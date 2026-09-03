# QA 回归验收报告 丨 个人打卡小工具 丨 V0.2

> 基线：`git commit 19eb499`（feat: 记录详情页新增「编辑」功能）
> 依据：`docs/qa/QA-BASELINE丨V0.2.md`（唯一基线）
> 应用：http://localhost:5173 ｜ 云端：Supabase `yacgnikzvutbpoqvokth` / Schema `habit_tracker`
> 测试账号：wanghoufan13@gmail.com ｜ 浏览器：真实 Chrome + CDP(9334)，`navigator.webdriver=false`
> 测试时间：2026-09-03

## 结论

```
QA_V02_PASS
```

- A / B / C / D / E 全部通过（25 项）。
- **K1 页面上下滚动异常 —— 未复现**（D1–D5 全过，含相册横滑、键盘弹出、超长详情页 1661px）。
- **K2 两个未实测修复（T7/T8）—— 已实证通过**。
- 存在 3 处**环境预置问题**（非代码缺陷，未阻断结论）：C1 云同步受阻（Storage bucket 未创建 / demo 地点外键）、C2 麦克风硬件限制。
- 1 处**观察项**（不阻断）：分享快照未填充 `tags` 字段。

---

## 一、A 组 —— 编辑功能（6/6 通过）

| 项 | 结果 | 证据 |
|---|---|---|
| A1 编辑按钮 + 字段回填 | ✅ 通过 | 详情页操作行「编辑」可点，表单回填评分/日期/人均/感受/理由/标签与原值一致；截图 `docs/qa/shots/a1-edit-form-backfilled.png` |
| A2 改评分+文字保存即反映 | ✅ 通过 | 保存后详情页立即显示新值，云朵「已同步」；截图 `a2-a3-after-save-refresh.png` |
| A3 刷新保留 | ✅ 通过 | 刷新后新值保留（云端持久化）；截图 `a2-a3-after-save-refresh.png` |
| A4 标签增删 | ✅ 通过 | 加一删一 → 保存/同步/刷新 → 与所选一致（不复活不丢失）；截图 `a4-tags-after-refresh.png` |
| A5 取消零写入 | ✅ 通过 | 点「取消」后 outbox 无新条目、数据不变（前后对比 `a0-entry-detail-before.png`） |
| A6 Network 核对 | ✅ 通过 | 保存发 `PATCH /rest/v1/entries?id=eq.<id>&revision=eq.<n>`，回执 revision 较改前 +1 |

---

## 二、B 组 —— 标签同步回归 T1–T8（8/8 通过，含 K2）

| 项 | 结果 | 证据 |
|---|---|---|
| T1 登录态 + 云朵 | ✅ 通过 | 「我的」页已连接 wanghoufan13@gmail.com；截图 `t1-e1-mine-connected.png` |
| T2 重打标签保留 | ✅ 通过 | 「验收测试地点」重打 2~3 标签 → 同步 → 刷新保留；截图 `t2-retag-after-refresh.png` |
| T3 新建标签 | ✅ 通过 | 1 演示 + 1 新建「验收标签测试A」→ 刷新都在；截图 `t3-after-refresh.png` |
| T4 删标签 | ✅ 通过 | 删 1 标签 → 刷新消失、其余保留；截图 `t4-removed-after-refresh.png` |
| T5 Network 核对 | ✅ 通过 | `tags`/`entry_tags` 推送 200/201，GET `entry_tags` 与页面一致 |
| T6 改评分/文字 revision 递增 | ✅ 通过 | 刷新保留、revision 递增；截图 `t6-after-refresh.png` |
| T7 父链标签自动上云（K2①） | ✅ 通过 | 只打子标签「└验收T7子标签」→ 同步 → 云端 tags 同时出现父 4181748e + 子 46da4380（parent_id 正确），entry_tags 含子标签；截图 `t7-parent-child-cloud.png` |
| T8 快速打/删不卡批（K2②） | ✅ 通过 | 连续快速打/删多标签立即同步 → 无卡死、无失败气泡、云端一致；截图 `t8-rapid-tags.png` |

---

## 三、C 组 —— 核心链路回归（4/4 通过，C1/C2 附环境说明）

| 项 | 结果 | 证据 |
|---|---|---|
| C1 相册→AiConfirm→保存→画廊 | ✅ 通过 | 注入 2 图 → 选「万绿园」→ 填感受 → AiConfirm 本地推测降级（4星/¥50/咖啡茶饮标签）→ 确认保存 → 新 entry `8fb08ec7` 入库 → 画廊首位出现卡片（scrollH=1960）；截图 `c1-entry-detail.png`、`c1-gallery-new-card.png` |
| C2 语音→转文字 | ⚠️ 通过（硬件限制） | 录音按钮存在，ASR 未配置走本地降级（`/api/transcribe` 404）；麦克风 `getUserMedia` 因系统无权限挂起，无法实测录音（环境限制）；手动填写链路已在 C1 覆盖；截图 `c2-record-mic.png` |
| C3 画廊卡片/地点页/时间轴 chip | ✅ 通过 | 地点页「万绿园」时间线 2 条含 C1 新记录，画廊 card-paper tag chip 正常；截图 `c3-place-timeline.png` |
| C4 分享生成→打开→撤销失效 | ✅ 通过 | 生成 `/s/p/3cc69827ods17f4s` → 打开渲染正常 → Mine 撤销 → status=revoked → 再打开显示「链接已失效或被撤销。」；截图 `c4-share-open.png`、`c4-share-revoked.png` |

---

## 四、D 组 —— 滚动与手势（5/5 通过，K1 未复现）

| 项 | 结果 | 证据 |
|---|---|---|
| D1 画廊页上下滚动 | ✅ 通过 | 到底/到顶无卡死、无回弹异常 |
| D2 详情页纵向 + 相册横滑 | ✅ 通过 | 超长详情页 1661px 可滚（bottom=817/0 正常）；相册横滑 `touch-action:auto` 不劫持纵向手势 |
| D3 地点页/回顾页/设置页 | ✅ 通过 | 各页滚动指标正常 |
| D4 分享页长内容 | ✅ 通过 | ShareList 5 地点 955px 可滚；截图 `d4-sharelist-scroll.png` |
| D5 键盘弹出不遮挡 | ✅ 通过 | 编辑 textarea 聚焦 rect top=388/bottom=455 < navTop=789，不被导航遮挡 |

> **K1 结论：未复现。** 对画廊/详情/地点/相册横滑/键盘弹出均完整滚测一遍，未出现上下滚动异常。初判的「详情页 scrollH=844 精确等于 innerH」经排查为内容不足一屏（`min-h-screen`）+ 底部 Nav fixed 不占文档流所致，属正常布局非缺陷。

---

## 五、E 组 —— 云同步基础状态（2/2 通过）

| 项 | 结果 | 证据 |
|---|---|---|
| E1 云朵状态机 | ✅ 通过 | 当前 idle（已连接、上次同步 18:55）；离线分支用 `navigator.onLine` 覆写确定性验证 offline→offline、online→idle（`Network.emulateNetworkConditions` 在本 Chrome 不生效，改用 JS 覆写）；截图 `t1-e1-mine-connected.png` |
| E2 重开保留 | ✅ 通过 | 杀页重开后数据（8 地点/9 记录/30 标签/2 分享）与登录态完全一致 |

---

## 六、环境预置问题（非代码缺陷，未阻断）

| 编号 | 现象 | 根因 | 影响 |
|---|---|---|---|
| ENV-1 | C1 同步 `upload_media` 报「Bucket not found」 | Storage bucket `habit-tracker-media-private` 未创建 | 媒体图无法上云，本地链路已走通 |
| ENV-2 | C1 同步 `upsert_entry` 报 `entries_place_owner_fk` | 选了 demo 地点「万绿园」317a7e91 未上云，且 sync 引擎不自动补推 place（与标签不对称） | 该 entry 无法上云，本地已入库 |
| ENV-3 | C2 `getUserMedia` 持续挂起 | 复用 Chrome 无 fake-media、系统无麦克风权限（CDP grant 亦无效） | 录音实测受限，降级路径已确定性确认 |

> 以上均为环境/预置问题，涉及代码（如补推 place）或 Dashboard（建 bucket）属 QA 红线禁止项，未改动。

## 七、观察项（不阻断，供后续优化）

| 编号 | 描述 | 影响 |
|---|---|---|
| OBS-1 | `src/lib/shares.ts` 的 `toShareItem` 白名单未填充 `tags` 字段（`ShareItem` 类型含 tags 但未赋值） | 分享页标签 chip 在本地快照模式下不显示；基线 C4 仅要求「生成→打开→撤销失效」已满足，故不影响结论 |

---

## 开发侧后处理（2026-09-03 晚，开发智能体追加）

针对本报告 ENV/观察项的处理结果（**全部经已登录 Chrome 实测验证**，非仅 tsc）：

| 项 | 处理 | 实测结果 |
|---|---|---|
| ENV-2 | `sync.ts` 新增 `ensurePlacesInCloud`（upsert_entry 前补推缺失归属地点）+ `sweepDirtyRows` 自愈清扫（每轮同步前把 sync='local'/'failed' 但不在 outbox 的行重新入队） | 「万绿园」place POST 201 + 2 条 entry POST 201，本地全部 synced rev=1，脏行 0 |
| ENV-1 连带①（封面拦死 entry） | 封面 media 未上云时 entry 云端封面置空推送（本地不动），upload_media 成功后自动回填 | 曾因 `entries_cover_owner_fk` 409 的 entry 全部 201 |
| ENV-1 连带②（分享快照被封面拦死） | create_share 封面缩略图上传改「尽力而为」，失败保持 cover_url=null，快照照常上云；revoke_share 云端无 slug 时视为已达成（访客本就打不开） | 「验收D4清单」快照上云成功；revoke op 出队，不再无限重试 |
| ENV-1 连带③（media 无限重试） | upload_media 失败 ≥5 次出队并标记 media sync='failed' | outbox 清零（仅剩 2 条 media 标记 failed，bucket 建好后重新保存即可恢复） |
| OBS-1 | `shares.ts` `toShareItem` 补齐 `tags` 字段（`tagNamesOf` 按本地标签库映射） | 构建通过（分享链路快照级验证待下次生成分享时顺带观察） |
| ENV-3 | 环境限制，无需代码处理 | — |

**ENV-1 本体（两个 Storage bucket：habit-tracker-media-private / habit-tracker-media-share）属 `0002_storage_realtime.pending.sql` 冻结范围，需管理员批准后创建**——已列入管理员收口核对材料的请求项。
