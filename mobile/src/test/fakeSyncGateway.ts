// 录制型 fake `SyncGateway`（TASK-DEV-08 单测用）。
//
// 记录每次调用的完整参数并提供最小可用行为（分页/过滤/排序、可编排冲突与上传失败），
// 让单测能断言线上语义：`onConflict` 键、`expected revision` 条件、0 行分支、分页 range。
// 不触网、无凭据。放在 `src/test/` 以免被 jest 当成测试文件（需含测试）。

import type {
  GatewayError,
  GatewayFilter,
  GatewayResult,
  GatewaySelectOptions,
  GatewayUploadOptions,
  SyncGateway,
} from '../sync/gateway'

export interface FakeGatewayCall {
  op:
    | 'insert'
    | 'updateIfRevision'
    | 'upsert'
    | 'update'
    | 'remove'
    | 'select'
    | 'upload'
    | 'removeObjects'
    | 'publicUrl'
  table?: string
  row?: Record<string, unknown>
  rows?: Record<string, unknown>[]
  patch?: Record<string, unknown>
  onConflict?: string
  id?: string
  expectedRevision?: number
  filters?: GatewayFilter[]
  options?: GatewaySelectOptions
  bucket?: string
  path?: string
  data?: ArrayBuffer
  uploadOptions?: GatewayUploadOptions
}

export interface FakeGatewayOptions {
  /** SELECT 返回的远端表内容（表名 → 行）。 */
  remote?: Record<string, Record<string, unknown>[]>
  /** 条件 UPDATE 一律 0 行（模拟乐观锁冲突）。 */
  zeroRowUpdates?: boolean
  /** 首推 INSERT 返回唯一键冲突（重放校准路径）。 */
  insertConflict?: boolean
  /** INSERT 成功时回读的 revision。 */
  insertRevision?: number
  /** upsert 一律返回该错误。 */
  upsertError?: string | null
  /** 指定表 SELECT 返回错误（其余表正常）。 */
  selectErrorTable?: string | null
  /** 命中该路径的上传返回失败（其余成功）。 */
  uploadErrorPath?: string | null
  uploadErrorMessage?: string
  publicUrlBase?: string
}

export interface FakeGateway extends SyncGateway {
  readonly calls: FakeGatewayCall[]
  setRemote(table: string, rows: Record<string, unknown>[]): void
  reset(): void
}

function matches(row: Record<string, unknown>, filters: GatewayFilter[] | undefined): boolean {
  for (const filter of filters ?? []) {
    if (filter.op === 'eq') {
      if (row[filter.column] !== filter.value) return false
    } else if (!filter.values.includes(row[filter.column] as string | number)) {
      return false
    }
  }
  return true
}

function errorOf(message: string): GatewayError {
  return { message }
}

export function createFakeGateway(options: FakeGatewayOptions = {}): FakeGateway {
  const calls: FakeGatewayCall[] = []
  const remote = new Map<string, Record<string, unknown>[]>()
  for (const [table, rows] of Object.entries(options.remote ?? {})) remote.set(table, [...rows])

  const ok = <T>(data: T): GatewayResult<T> => ({ data, error: null })
  const fail = <T>(message: string): GatewayResult<T> => ({ data: null, error: errorOf(message) })

  return {
    calls,

    setRemote(table, rows) {
      remote.set(table, [...rows])
    },

    reset() {
      calls.length = 0
    },

    async insert(table, row) {
      calls.push({ op: 'insert', table, row })
      if (options.insertConflict) {
        return { data: null, error: { message: 'duplicate key value', code: '23505' } }
      }
      return ok([{ revision: options.insertRevision ?? (typeof row.revision === 'number' ? row.revision : 1) }])
    },

    async updateIfRevision(table, id, row, expectedRevision) {
      calls.push({ op: 'updateIfRevision', table, id, row, expectedRevision })
      if (options.zeroRowUpdates) return ok([])
      return ok([{ revision: expectedRevision + 1 }])
    },

    async upsert(table, rows, onConflict) {
      const list = Array.isArray(rows) ? rows : [rows]
      calls.push({ op: 'upsert', table, rows: list, onConflict })
      if (options.upsertError) return fail(options.upsertError)
      return ok(list)
    },

    async update(table, patch, filters) {
      calls.push({ op: 'update', table, patch, filters })
      return ok([])
    },

    async remove(table, filters) {
      calls.push({ op: 'remove', table, filters })
      return ok(null)
    },

    async select(table, selectOptions: GatewaySelectOptions = {}) {
      calls.push({ op: 'select', table, options: selectOptions })
      if (options.selectErrorTable && options.selectErrorTable === table) {
        return fail(`${table} select failed`)
      }
      let rows = [...(remote.get(table) ?? [])]
      rows = rows.filter((row) => matches(row, selectOptions.filters))
      if (selectOptions.orderBy) {
        const { column, ascending = true } = selectOptions.orderBy
        rows.sort((a, b) => {
          const av = a[column] as string | number
          const bv = b[column] as string | number
          if (av === bv) return 0
          return (av < bv ? -1 : 1) * (ascending ? 1 : -1)
        })
      }
      const offset = selectOptions.offset ?? 0
      if (selectOptions.limit != null) rows = rows.slice(offset, offset + selectOptions.limit)
      else if (offset > 0) rows = rows.slice(offset)
      return ok(rows)
    },

    async upload(bucket, path, data, uploadOptions) {
      calls.push({ op: 'upload', bucket, path, data, uploadOptions })
      if (options.uploadErrorPath && path === options.uploadErrorPath) {
        return fail(options.uploadErrorMessage ?? 'upload failed')
      }
      return ok({ path })
    },

    async removeObjects(bucket, paths) {
      calls.push({ op: 'removeObjects', bucket, rows: paths.map((path) => ({ path })) })
      return ok(null)
    },

    publicUrl(bucket, path) {
      calls.push({ op: 'publicUrl', bucket, path })
      return `${options.publicUrlBase ?? 'https://fake.local'}/${bucket}/${path}`
    },
  }
}
