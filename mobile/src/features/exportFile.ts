// 导出文件落盘 + 系统分享（真机侧；对标 Web 的下载动作）。
//
// 架构（新 expo-file-system）：`File(Paths.cache, name)` → `create({ overwrite:true })` → `write()`。
// 分享用 React Native 内置 `Share`：iOS 可带 `url` 附件，Android 只认 `message`
// （未装 expo-sharing 时不能直接投递文件），故把导出正文一并放进 message 兜底——
// 用户可发到微信/邮箱/备忘录；同时返回缓存文件 uri，便于页面提示「已写入本机」。
//
// 与 `export.ts` 分开：本文件 import Expo，纯序列化单测不依赖它。

import { File, Paths } from 'expo-file-system'
import { Share } from 'react-native'

import type { ExportFile } from './export'

export interface SharedExport {
  /** 本机缓存文件 uri（Android 上 content:// 兼容路径）。 */
  uri: string
  /** 用户是否真的选择了分享目标（取消为 false）。 */
  shared: boolean
}

export async function shareExportFile(file: ExportFile): Promise<SharedExport> {
  const target = new File(Paths.cache, file.filename)
  target.create({ overwrite: true })
  target.write(file.content)
  const result = await Share.share({
    title: file.filename,
    message: file.content,
    url: target.uri,
  })
  return { uri: target.uri, shared: result.action === Share.sharedAction }
}
