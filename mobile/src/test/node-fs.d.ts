// 仅测试用：`node:fs` / `node:path` 的最小类型声明（与 node-sqlite.d.ts 同策略，
// 避免 tsconfig `types: ["jest"]` 引入 @types/node 全局类型与 RN 声明冲突）。

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
}

declare module 'node:path' {
  export function join(...parts: string[]): string
}

declare const __dirname: string
