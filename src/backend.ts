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
  /** 文件库根目录有「_规则.md」 */
  has_rules: boolean
}

export type FolderNodeDto = { name: string; path: string; count: number; children: FolderNodeDto[]; has_rules: boolean }
export type UiFolderNode = { name: string; path: string; count: number; children: UiFolderNode[]; has_rules?: boolean }

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
  protocol?: 'openai' | 'anthropic' | 'gemini' | 'ollama' | string
  endpoint: string
  model: string
  api_key?: string
  has_api_key: boolean
}

export type AgentActionDto = {
  id: string
  seq: number
  source_path: string
  source_name: string
  source_type: 'file' | 'folder' | string
  target_library_id: string | null
  target_library_name: string
  target_folder: string
  creates_folder: boolean
  new_name: string
  final_name: string
  destination_path: string
  /** 移动和改名可以分别取消 */
  move_selected: boolean
  rename_selected: boolean
  has_move: boolean
  has_rename: boolean
  /** 分类依据 / 命名依据 */
  move_reason: string
  rename_reason: string
  rule_source: string
  /** 「需要确认」的原因，空字符串表示无需特别确认 */
  review_note: string
  warnings: string[]
  blocking: string | null
  /** "" | "duplicate" | "auto_numbered" */
  conflict_kind?: 'duplicate' | 'auto_numbered' | string
  /** 当 conflict_kind === "duplicate" 时指向已存在的相同内容文件路径 */
  duplicate_of?: string
  has_change: boolean
  /** 按当前勾选会被执行 */
  selected: boolean
  has_rule_draft: boolean
  /** proposed | running | done | skipped | failed | undone | undo_failed */
  state: string
  result_path: string
  error: string
}

export type AgentRuleDraftDto = {
  id: string
  library_id: string
  library_name: string
  folder_path: string
  content: string
  selected: boolean
  in_use: boolean
  /** proposed | done | skipped | failed | undone | undo_failed */
  state: string
  error: string
}

export type AgentAiLogDto = {
  stage: string
  model: string
  elapsed_ms: number
  input_tokens?: number
  output_tokens?: number
  cached_tokens?: number
  total_tokens?: number
  system_prompt: string
  request_body: string
  response_body: string
  ok: boolean
}

export type AiRequestLogDto = {
  id: string
  created_at: string
  stage: string
  endpoint: string
  model: string
  protocol: string
  status_code: number
  ok: boolean
  elapsed_ms: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  total_tokens: number
  system_prompt: string
  request_body: string
  response_body: string
  error: string
}

export type AgentPlanDto = {
  id: string
  /** classify | rename */
  kind: 'classify' | 'rename' | string
  instruction: string
  reply: string
  /** draft | partially_executed | executed | partially_undone | undone */
  state: string
  mode: 'copy' | 'move' | string
  notices: string[]
  elapsed_ms?: number
  ai_logs?: AgentAiLogDto[]
  created_at: string
  updated_at: string
  actions: AgentActionDto[]
  rule_drafts: AgentRuleDraftDto[]
}

export type AgentActionEdit = { id: string; moveSelected: boolean; renameSelected: boolean; targetLibraryId: string | null; targetFolder: string; newName: string }

export type AgentEntryDto = { path: string; name: string; is_dir: boolean; root_path?: string }

export type AgentProgress = { stage: string; message: string }

export type AgentExecProgress = {
  planId: string
  phase: string
  currentIndex: number
  totalItems: number
  currentName: string
  isCrossDrive: boolean
  transferredBytes: number
  totalBytes: number
  elapsedMs: number
}

export type RuleDocDto = {
  scope: 'global' | 'folder' | string
  library_id: string | null
  folder_path: string
  path: string
  exists: boolean
  content: string
  error: string | null
}

export type OverviewDto = {
  library_id: string
  library_name: string
  overview: string
  rule_count: number
  generated_at: string
  stale: boolean
  error: string
}

export type RecoverySummaryDto = { recovered: number; needs_attention: number }

export const RULE_FILE_NAME = '_规则.md'

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Tauri commands reject with the plain `Err(String)` from Rust, not an Error
// instance, so `error instanceof Error` would discard the backend message.
export function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') return (error as { message: string }).message
  return fallback
}

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

export async function pickFolders() {
  const selected = await open({ directory: true, multiple: true })
  if (!selected) return []
  return Array.isArray(selected) ? selected : [selected]
}

export async function revealPath(path: string) {
  return call<void>('reveal_path', { path })
}

export function folderTreeToUi(nodes: FolderNodeDto[]): UiFolderNode[] {
  return nodes.map((node) => ({ name: node.name, path: node.path, count: node.count, has_rules: node.has_rules, children: folderTreeToUi(node.children) }))
}
