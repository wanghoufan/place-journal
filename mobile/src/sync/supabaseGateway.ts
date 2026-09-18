// Supabase 真网网关适配器（TASK-DEV-08）：把 `SyncGateway` 翻译成 supabase-js 调用。
//
// 本文件只 import supabase-js（不碰 Expo 原生模块），供 `nativeSync.ts` 在运行时组装；
// 单测不引用本文件，用同接口的录制型 fake 覆盖（`src/test/fakeSyncGateway.ts`）。
//
// 映射口径：
//   - 全部请求走 `client.schema('habit_tracker')`（CONTRACT_MATRIX §2，禁 business 表进 public）；
//   - INSERT 带 `.select('revision')` 回读服务端触发器结果；
//   - 条件 UPDATE 用 `.eq('id', id).eq('revision', expected)`，0 行即冲突（由 transport 判定）；
//   - 分页 SELECT 用 `.order(...).range(offset, offset + limit - 1)`；
//   - Storage 上传使用 ArrayBuffer body（RN 下 Blob/File/FormData 不可靠，R-06）。

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  DB_SCHEMA,
  type GatewayFilter,
  type GatewayResult,
  type GatewaySelectOptions,
  type GatewayUploadOptions,
  type SyncGateway,
} from './gateway'

interface PostgrestLike<T>
  extends PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }> {
  eq(column: string, value: unknown): PostgrestLike<T>
  in(column: string, values: unknown[]): PostgrestLike<T>
  order(column: string, options?: { ascending?: boolean }): PostgrestLike<T>
  range(from: number, to: number): PostgrestLike<T>
  select(columns?: string): PostgrestLike<T>
}

function applyFilters<T>(query: PostgrestLike<T>, filters: GatewayFilter[] | undefined): PostgrestLike<T> {
  let q = query
  for (const filter of filters ?? []) {
    q = filter.op === 'eq' ? q.eq(filter.column, filter.value) : q.in(filter.column, filter.values)
  }
  return q
}

async function settled<T>(
  query: PostgrestLike<T>,
): Promise<GatewayResult<T>> {
  const { data, error } = await query
  return { data: data ?? null, error: error ? { message: error.message, code: error.code } : null }
}

export function createSupabaseGateway(client: SupabaseClient, schema: string = DB_SCHEMA): SyncGateway {
  const scope = () => client.schema(schema)
  const asQuery = <T>(builder: unknown) => builder as PostgrestLike<T>

  return {
    insert(table, row) {
      return settled(
        asQuery<Record<string, unknown>[]>(
          scope().from(table).insert(row).select('revision'),
        ),
      )
    },

    updateIfRevision(table, id, row, expectedRevision) {
      return settled(
        asQuery<Record<string, unknown>[]>(
          scope().from(table).update(row).eq('id', id).eq('revision', expectedRevision).select('revision'),
        ),
      )
    },

    upsert(table, rows, onConflict) {
      return settled(
        asQuery<Record<string, unknown>[]>(
          scope().from(table).upsert(rows, { onConflict }),
        ),
      )
    },

    update(table, patch, filters) {
      return settled(
        applyFilters(asQuery<Record<string, unknown>[]>(scope().from(table).update(patch).select('id')), filters),
      )
    },

    remove(table, filters) {
      return settled(applyFilters(asQuery<unknown>(scope().from(table).delete()), filters))
    },

    select(table, options: GatewaySelectOptions = {}) {
      let query = asQuery<Record<string, unknown>[]>(scope().from(table).select(options.columns ?? '*'))
      query = applyFilters(query, options.filters)
      if (options.orderBy) query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? true })
      if (options.limit != null) {
        const from = options.offset ?? 0
        query = query.range(from, from + options.limit - 1)
      }
      return settled(query)
    },

    async upload(bucket, path, data, options: GatewayUploadOptions) {
      const { data: uploaded, error } = await client.storage.from(bucket).upload(path, data, {
        contentType: options.contentType,
        upsert: options.upsert,
      })
      return {
        data: uploaded ? { path: uploaded.path } : null,
        error: error ? { message: error.message } : null,
      }
    },

    async removeObjects(bucket, paths) {
      const { error } = await client.storage.from(bucket).remove(paths)
      return { data: null, error: error ? { message: error.message } : null }
    },

    publicUrl(bucket, path) {
      const { data } = client.storage.from(bucket).getPublicUrl(path)
      return data?.publicUrl ?? null
    },
  }
}
