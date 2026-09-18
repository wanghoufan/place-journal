// 真网同步网关抽象（TASK-DEV-08；SDD 真接线段）。
//
// 目的：把 push/pull 需要的 PostgREST 与 Storage 原语收敛成一个可注入接口，
// 让真实现（`supabaseGateway.ts`，走 supabase-js）与单测录制型 fake
// （`src/test/fakeSyncGateway.ts`）共用同一合同。单测据 fake 记录的参数断言
// 线上语义：`onConflict` 键、`expected revision` 条件、0 行分支、分页 range。
//
// 口径（对齐 Web `src/lib/sync.ts`，CONTRACT_MATRIX §2/§A）：
//   - schema 固定 `habit_tracker`；
//   - 核心实体首推 INSERT、后续 `id + revision = expected` 条件 UPDATE，0 行 = 冲突；
//   - 辅助对象（media/share_items）走 `onConflict` 受控 upsert；
//   - 删除行不存在视为目的达成（网关不把 0 行当错误）。

export const DB_SCHEMA = 'habit_tracker'

export interface GatewayError {
  message: string
  /** PostgREST/Postgres 错误码（如唯一键冲突 23505）。 */
  code?: string
}

export interface GatewayResult<T> {
  data: T | null
  error: GatewayError | null
}

export type GatewayFilter =
  | { column: string; op: 'eq'; value: string | number | boolean | null }
  | { column: string; op: 'in'; values: (string | number)[] }

export interface GatewaySelectOptions {
  columns?: string
  filters?: GatewayFilter[]
  orderBy?: { column: string; ascending?: boolean }
  /** 分页条数（配 `offset` 映射 PostgREST `range(from, to)`）。 */
  limit?: number
  offset?: number
}

export interface GatewayUploadOptions {
  contentType: string
  upsert: boolean
}

export interface SyncGateway {
  /** 首推 INSERT，回读服务端 `revision`（冲突时返回 23505）。 */
  insert(table: string, row: Record<string, unknown>): Promise<GatewayResult<Record<string, unknown>[]>>
  /** 乐观锁条件 UPDATE：`id + revision = expectedRevision`；0 行返回空数组。 */
  updateIfRevision(
    table: string,
    id: string,
    row: Record<string, unknown>,
    expectedRevision: number,
  ): Promise<GatewayResult<Record<string, unknown>[]>>
  /** 受控 upsert（辅助对象/关联表），按 `onConflict` 幂等。 */
  upsert(
    table: string,
    rows: Record<string, unknown> | Record<string, unknown>[],
    onConflict: string,
  ): Promise<GatewayResult<Record<string, unknown>[]>>
  update(
    table: string,
    patch: Record<string, unknown>,
    filters: GatewayFilter[],
  ): Promise<GatewayResult<Record<string, unknown>[]>>
  remove(table: string, filters: GatewayFilter[]): Promise<GatewayResult<unknown>>
  select(table: string, options?: GatewaySelectOptions): Promise<GatewayResult<Record<string, unknown>[]>>
  upload(
    bucket: string,
    path: string,
    data: ArrayBuffer,
    options: GatewayUploadOptions,
  ): Promise<GatewayResult<{ path: string }>>
  removeObjects(bucket: string, paths: string[]): Promise<GatewayResult<unknown>>
  publicUrl(bucket: string, path: string): string | null
}

export function eqFilter(column: string, value: string | number | boolean | null): GatewayFilter {
  return { column, op: 'eq', value }
}

export function inFilter(column: string, values: (string | number)[]): GatewayFilter {
  return { column, op: 'in', values }
}

/** 是否唯一键冲突（重放校准用；对齐 Web 的 23505 / duplicate key 判定）。 */
export function isUniqueViolation(error: GatewayError | null | undefined): boolean {
  if (!error) return false
  if (error.code === '23505') return true
  return /duplicate key|unique/i.test(error.message)
}
