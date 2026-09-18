// 仅测试用：`node:sqlite` 的最小类型声明。
//
// 项目 tsconfig 的 `types: ["jest"]` 不引入 @types/node 全局类型（避免与 React Native
// 的 setTimeout/Buffer 等全局声明冲突）。测试适配器只需这里声明的子集。

declare module 'node:sqlite' {
  export type SQLInputValue = null | number | bigint | string | Uint8Array

  export interface StatementResultingChanges {
    changes: number | bigint
    lastInsertRowid: number | bigint
  }

  export interface StatementSync {
    run(...params: SQLInputValue[]): StatementResultingChanges
    all(...params: SQLInputValue[]): unknown[]
    get(...params: SQLInputValue[]): unknown
  }

  export class DatabaseSync {
    constructor(location: string, options?: Record<string, unknown>)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
