
# CODE REVIEW

- Task: TASK-DEV-16A（mobile记录链照抄PWA：draft草稿接力＋保存信号复位、ai-confirm两框分流＋跳过态文案、超时12s对齐服务端、未命中建标签、两处现场建标签、灯箱；新文件draft.ts/Lightbox.tsx＋单测；306=302+4）
- Commit: 工作树未提交（HEAD=f0a621c；diff含 mobile 8文件修改＋draft.ts/Lightbox.tsx等4新文件未跟踪＋HANDOFF）
- Reviewer: code-reviewer
- Result: 过（P0=0，P1=0；P2×2 backlog，不阻断进QA）

## P0 / P1 Findings

- 无P0/P1。草稿/信号语义正确：`setDraft`置位+`saved=false`；`takeDraft`只读不清空（ai-confirm惰性useState读一次+useEffect自动整理一次，重渲染不丢）；`clearDraft+markDraftSaved`在保存成功后执行；record侧`useFocusEffect+consumeDraftSaved`读后即清、只复位一次，防tab常驻重复保存。符合任务目标。
- 超时对齐有依据：`AI_API_TIMEOUT_MS=12000`，注释写明服务端单通道9s/全局13s、客户端8s掐断拿不到慢通道结果；`runOrganise`默认即12s，ai-confirm不再传8000。过。
- 越界检查过：`git diff --name-only`仅docs/handoff+mobile app/src共10文件；`mobile/android/`、`app.config`、`package.json`、包名/scheme/redirect零改动。过。
- 306纯增量过：实测`mobile` 36 suites/306 tests全绿；本次新增draft/lightbox/organise/recordActions单测即增量部分，无回归删除。

## P2 / P3 Backlog Findings

- P2：`takeDraft`命名 misleading（实为peek，只读不清空；clear靠`clearDraft`）。建议改名`peekDraft`或补注释，不改也行。
- P2：`createTagNamed`同名复用`created:false`时`opId=''`，调用方仅用id无影响；若后续有人用opId做依赖会埋坑，建议返回时注明或给既有op查询。
- P3：Lightbox空数组`return null`在hooks之后，当前hooks仅useEffect+useRef且条件在return前无提前return分支外的hooks，合规；后续加hooks注意顺序。

目标/剩P0/下一步：DEV-16A复核过/剩P0=0/下一步QA模拟器验证。

## P1修复复核（DEV-16A-P1：aiNextGate三态，2026-09-21）

- 范围：`mobile/src/features/form.ts:30-46` 新增 `aiNextGate`；`mobile/app/(tabs)/record.tsx:193-229,292-299,467` 按钮文案+disabled 同源；`mobile/src/features/__tests__/form.test.ts` 新增 7 例。只读复核，未改业务代码。
- 口径一致过：Web `src/pages/Record.tsx:39-41,161-162` 为 `hasPlace=selectedPlace||(newMode&&newName.trim())`、`hasContent=transcript.trim()||notePublic.trim()||photos.length`、`label=!hasPlace?…:!hasContent?…:…`；移动端 `form.ts:37-44` 逐项同义（`transcript`↔`notePrivate` 仅改名，语义同为私密感受框；`photos.length`↔`photoCount>0` 等价，调用方传 `assets.length` 非负）。公开理由单独可进一例已覆盖，防静默拦截的回归点成立。
- disabled 语义过：按钮 `disabled={!aiGate.canNext}`（record.tsx:467）与 Web `disabled={!canNext||busy}` 同源；移动端压缩中由 `busy/saving` 另行 guard（pick/saving 路径），`handleNextToAi` 内二次校验 `canNext` 兜竞态，与注释一致。`handleNextToAi` 未额外判 `saving`，但该按钮非保存按钮、无重复落库风险，最多重复 push 一次草稿页，P3 以下。
- 越界检查过：本次 diff 仅上述 2 改 + 1 新单测文件；`MAX_PHOTOS`、保存路径、draft 语义零改动；单测文件纯增量。
- P3 观察（不阻断）：`photoCount` 为负数时 `>0` 仍为 false，语义安全；若后续传入 `undefined` 会 `>0=false`，当前调用方恒传 `assets.length`，可接受。

- Result: 过（P0=0，P1=0；新增 P3×1 观察，不阻断进 QA）。

目标/剩P0/下一步：DEV-16A-P1 修复复核过/剩P0=0/下一步 QA（单测 313=306+7 待 QA 实跑确认）。
