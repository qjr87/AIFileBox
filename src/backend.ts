import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

export type LibraryDto = {
  id: string
  name: string
  root_path: string
  purpose: string
  folder_depth: number
  availability: string
  profile_status: string
  file_count: number
}

export type FolderNodeDto = { name: string; path: string; count: number; children: FolderNodeDto[] }
export type UiFolderNode = { name: string; path: string; count: number; children: UiFolderNode[] }

export type ItemDto = {
  id: string
  name: string
  path: string
  source_type: string
  mode: string
  size: string
  modified: string
  recommendation: string
  recommendation_id?: string | null
  recommendation_folder_path?: string | null
  confidence: string
  status: string
  reason: string
  detail: string
  members?: string | null
}

export type OperationDto = {
  id: string
  item_id: string
  name: string
  mode: string
  state: string
  source_path: string
  destination_path: string
  created_at: string
  error?: string | null
  can_retry: boolean
  can_undo: boolean
}

export type AiSettingsDto = {
  enabled: boolean
  endpoint: string
  model: string
  has_api_key: boolean
}

export type RecoverySummaryDto = { recovered: number; needs_attention: number }

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('当前运行在浏览器演示模式')
  return invoke<T>(command, args)
}

export async function pickFiles() {
  const selected = await open({ multiple: true, directory: false })
  if (!selected) return []
  return Array.isArray(selected) ? selected : [selected]
}

export async function pickFolder() {
  const selected = await open({ directory: true, multiple: false })
  if (!selected || Array.isArray(selected)) return null
  return selected
}

export async function revealPath(path: string) {
  return call<void>('reveal_path', { path })
}

export function folderTreeToUi(nodes: FolderNodeDto[]): UiFolderNode[] {
  return nodes.map((node) => ({ name: node.name, path: node.path, count: node.count, children: folderTreeToUi(node.children) }))
}
