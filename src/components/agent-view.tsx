import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock,
  Copy,
  ExternalLink,
  File,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  LoaderCircle,
  Move,
  Paperclip,
  Pencil,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Terminal,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import {
  call,
  errorMessage,
  isTauri,
  pickFiles,
  pickFolders,
  RULE_FILE_NAME,
  type AgentActionDto,
  type AgentActionEdit,
  type AgentAiLogDto,
  type AgentEntryDto,
  type AgentExecProgress,
  type AgentPlanDto,
  type AgentProgress,
  type AgentRuleDraftDto,
  type UiFolderNode,
} from '../backend'
import { Badge, Button, Checkbox, TextInput } from './watermelon-ui'
import { TreeSelect, type TreeSelectNode } from './tree-select'
import { useI18n } from '../i18n'
import '../agent.css'

export type AgentLibrary = { id: string; name: string; color: string; status?: string; folders: UiFolderNode[] }

type Mode = 'copy' | 'move'
type Kind = 'classify' | 'rename'
type Attachment = { path: string; name: string; isDir: boolean; rootPath?: string }
type Busy = { kind: 'planning' } | { kind: 'updating' | 'executing' | 'undoing' | 'cleaning_duplicates'; planId: string } | null
type Draft = { libraryId: string | null; folder: string; newName: string }
type EditPatch = Partial<Omit<AgentActionEdit, 'id'>>
type ErrorBanner = { message: string; needsSettings?: boolean; needsLibraries?: boolean } | null

type AgentViewProps = {
  active?: boolean
  libraries: AgentLibrary[]
  defaultMode: Mode
  setToast: (message: string) => void
  onNeedTree: (libraryId: string) => void
  onExecuted: () => void
  onOpenSettings: () => void
  onOpenLibraries: () => void
}

const MAX_ATTACHMENTS = 200
const DEMO_ATTACHMENTS: Attachment[] = [
  { path: 'E:/www.98T.la@【AI真人短剧】少妇白洁1-32集玉渡黄河冰塞川拔剑四顾心茫然/www.98T.la@【AI真人短剧】少妇白洁1-32集 玉渡黄河冰塞川 拔剑四顾心茫然/www.98T.la@1.mp4', name: 'www.98T.la@1.mp4', isDir: false },
  { path: 'E:/www.98T.la@【AI真人短剧】少妇白洁1-32集玉渡黄河冰塞川拔剑四顾心茫然/www.98T.la@【AI真人短剧】少妇白洁1-32集 玉渡黄河冰塞川 拔剑四顾心茫然/www.98T.la@2.mp4', name: 'www.98T.la@2.mp4', isDir: false },
  { path: 'E:/www.98T.la@【AI真人短剧】少妇白洁1-32集玉渡黄河冰塞川拔剑四顾心茫然/www.98T.la@【AI真人短剧】少妇白洁1-32集 玉渡黄河冰塞川 拔剑四顾心茫然/www.98T.la@10.mp4', name: 'www.98T.la@10.mp4', isDir: false },
]

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const baseName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
const pathKey = (path: string) => path.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

const IGNORED_PARENT_DIRS = new Set([
  'users', 'desktop', 'downloads', 'download', 'documents', 'appdata', 'local', 'roaming', 'temp', 'tmp',
  '桌面', '下载', '文档', '115', '115download', '115网盘', '百度网盘', 'baidunetdiskdownload',
  '夸克网盘', 'quarkdownload', '迅雷下载', 'thundernetwork',
])

type FolderChainItem = {
  name: string
  fullPath: string
}

function extractFolderChain(rawPath: string, rootPath?: string): FolderChainItem[] {
  const cleaned = rawPath
    .replace(/^\\\\\?\\UNC\\/i, '\\\\')
    .replace(/^\\\\\?\\/, '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
  const isUnc = cleaned.startsWith('//')
  const parts = cleaned.split('/').filter(Boolean)
  parts.pop()
  const rootKey = rootPath ? pathKey(rootPath) : ''
  const rawKey = pathKey(rawPath)
  const isSingleFilePick = Boolean(rootKey && rootKey === rawKey)
  const maxDepth = isSingleFilePick ? 1 : 3

  const folders: FolderChainItem[] = []
  for (let idx = parts.length - 1; idx >= 0; idx--) {
    const seg = parts[idx].trim()
    if (!seg || /^[a-zA-Z]:$/.test(seg) || IGNORED_PARENT_DIRS.has(seg.toLowerCase())) {
      break
    }
    const prefixParts = parts.slice(0, idx + 1)
    const fullPath = (isUnc ? '//' : '') + prefixParts.join('/')
    folders.push({ name: seg, fullPath })
    // 如果到达了用户拖入/选择的顶层文件夹路径，立即停止向上回溯，绝不把外层父目录（如 E:\115）带进来
    if (rootKey && !isSingleFilePick && pathKey(fullPath) === rootKey) {
      break
    }
    if (folders.length >= maxDepth) break
  }
  return folders.reverse()
}

type AttachmentTreeNode = {
  key: string
  name: string
  openPath?: string
  isDir: boolean
  file?: Attachment
  children: AttachmentTreeNode[]
  allPaths: string[]
}

function buildAttachmentTree(items: Attachment[]): AttachmentTreeNode[] {
  const sorted = [...items].sort((l, r) => naturalCompare(l.path, r.path))
  const root: AttachmentTreeNode[] = []
  const ensureFolder = (list: AttachmentTreeNode[], key: string, name: string, openPath: string): AttachmentTreeNode => {
    let found = list.find((node) => node.isDir && node.key === key)
    if (!found) {
      found = { key, name, openPath, isDir: true, children: [], allPaths: [] }
      list.push(found)
    }
    return found
  }
  for (const item of sorted) {
    if (item.isDir) {
      root.push({ key: `dir:${pathKey(item.path)}`, name: item.name, openPath: item.path, isDir: true, file: item, children: [], allPaths: [item.path] })
      continue
    }
    const chain = extractFolderChain(item.path, item.rootPath)
    if (chain.length === 0) {
      root.push({ key: `file:${pathKey(item.path)}`, name: item.name, openPath: item.path, isDir: false, file: item, children: [], allPaths: [item.path] })
      continue
    }
    let currentList = root
    let prefix = ''
    for (const seg of chain) {
      prefix = prefix ? `${prefix}/${seg.name.toLowerCase()}` : seg.name.toLowerCase()
      const folderNode = ensureFolder(currentList, `folder:${prefix}`, seg.name, seg.fullPath)
      folderNode.allPaths.push(item.path)
      currentList = folderNode.children
    }
    currentList.push({ key: `file:${pathKey(item.path)}`, name: item.name, openPath: item.path, isDir: false, file: item, children: [], allPaths: [item.path] })
  }
  return root
}

type PlanFolderGroup = {
  key: string
  sourceChain: FolderChainItem[]
  files: AgentActionDto[]
}

function buildPlanGroups(
  actions: AgentActionDto[],
  attachments: Attachment[] = [],
): { groups: PlanFolderGroup[]; rootFiles: AgentActionDto[]; allGroupKeys: string[] } {
  const groups: PlanFolderGroup[] = []
  const rootFiles: AgentActionDto[] = []
  const byKey = new Map<string, PlanFolderGroup>()
  const rootByFile = new Map<string, string>()
  for (const att of attachments) {
    if (att.rootPath) {
      rootByFile.set(pathKey(att.path), att.rootPath)
    }
  }

  for (const action of actions) {
    const rootPath = rootByFile.get(pathKey(action.source_path))
    const chain = action.source_type === 'folder' ? [] : extractFolderChain(action.source_path, rootPath)
    if (chain.length === 0) {
      rootFiles.push(action)
      continue
    }
    const key = `plan-group:${chain.map((s) => s.name.toLowerCase()).join('/')}`
    let group = byKey.get(key)
    if (!group) {
      group = { key, sourceChain: chain, files: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.files.push(action)
  }

  for (const group of groups) {
    group.files.sort((l, r) => naturalCompare(l.source_name, r.source_name))
  }
  rootFiles.sort((l, r) => naturalCompare(l.source_name, r.source_name))

  return { groups, rootFiles, allGroupKeys: groups.map((g) => g.key) }
}

function targetValue(libraryId: string, folderPath: string) {
  return JSON.stringify({ libraryId, folderPath })
}

function buildTargetNodes(
  libraries: AgentLibrary[],
  t: (zhKey: string, params?: Record<string, string | number>) => string,
) {
  const values = new Set<string>(['none'])
  const folderNodes = (library: AgentLibrary, nodes: UiFolderNode[], parent = ''): TreeSelectNode[] => nodes.map((node) => {
    const path = (node.path || (parent ? `${parent}/${node.name}` : node.name)).replace(/\\/g, '/')
    const value = targetValue(library.id, path)
    values.add(value)
    return { value, label: node.has_rules ? t('{name}（有规则）', { name: node.name }) : node.name, searchText: `${library.name} / ${path}`, kind: 'folder', children: node.children?.length ? folderNodes(library, node.children, path) : undefined }
  })
  const nodes: TreeSelectNode[] = [
    { value: 'none', label: t('不移动（保持在原位置）'), kind: 'none' },
    ...libraries.map((library) => {
      const value = targetValue(library.id, '')
      values.add(value)
      return { value, label: library.name, kind: 'library' as const, color: library.color, children: folderNodes(library, library.folders) }
    }),
  ]
  return { nodes, values }
}

function actionEdit(action: AgentActionDto, patch: EditPatch = {}): AgentActionEdit {
  return { id: action.id, moveSelected: action.move_selected, renameSelected: action.rename_selected, targetLibraryId: action.target_library_id, targetFolder: action.target_folder, newName: action.new_name, ...patch }
}

function isChecked(action: AgentActionDto) {
  return (action.has_move && action.move_selected) || (action.has_rename && action.rename_selected)
}

function planCounts(plan: AgentPlanDto) {
  return {
    moves: plan.actions.filter((action) => action.has_move).length,
    renames: plan.actions.filter((action) => action.has_rename).length,
    newFolders: new Set(plan.actions.filter((action) => action.creates_folder).map((action) => `${action.target_library_id}:${action.target_folder}`)).size,
    review: plan.actions.filter((action) => action.review_note).length,
    duplicates: plan.actions.filter((action) => action.conflict_kind === 'duplicate').length,
    pendingDuplicates: plan.actions.filter((action) => action.conflict_kind === 'duplicate' && (action.state === 'pending' || action.state === 'failed')).length,
    autoNumbered: plan.actions.filter((action) => action.conflict_kind === 'auto_numbered').length,
    done: plan.actions.filter((action) => action.state === 'done').length,
    failed: plan.actions.filter((action) => ['failed', 'skipped', 'undo_failed'].includes(action.state)).length,
    undone: plan.actions.filter((action) => action.state === 'undone').length,
  }
}

function formatDuration(ms?: number) {
  if (!ms || ms <= 0) return '0.0s'
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(2)}s`
  const mins = Math.floor(seconds / 60)
  const rem = (seconds % 60).toFixed(1)
  return `${mins}m ${rem}s`
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let val = bytes
  let idx = 0
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024
    idx += 1
  }
  return `${val >= 100 || idx === 0 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)} ${units[idx]}`
}

// ───────── 浏览器演示模式：不接触真实文件，只模拟计划的生成、修改、执行和撤销 ─────────

function withDerived(action: AgentActionDto): AgentActionDto {
  const hasMove = Boolean(action.target_library_id)
  const hasRename = Boolean(action.new_name)
  const moveSelected = action.move_selected && hasMove
  const renameSelected = action.rename_selected && hasRename
  const hasChange = moveSelected || renameSelected
  return { ...action, has_move: hasMove, has_rename: hasRename, move_selected: moveSelected, rename_selected: renameSelected, has_change: hasChange, selected: action.state !== 'done' && hasChange, final_name: renameSelected ? action.new_name : action.source_name }
}

function mockPlan(attachments: Attachment[], instruction: string, kind: Kind, libraries: AgentLibrary[]): AgentPlanDto {
  const actions = attachments.map((attachment, index) => {
    const library = kind === 'classify' && libraries.length ? libraries[0] : undefined
    const extension = attachment.isDir ? '' : attachment.name.match(/\.[^.]+$/)?.[0] ?? ''
    const epMatch = attachment.name.match(/(\d+)/)
    const epNum = epMatch ? epMatch[1].padStart(2, '0') : String(index + 1).padStart(2, '0')
    const newName = `少妇白洁 S01E${epNum}${extension}`
    const folder = '少妇白洁1-32集 玉渡黄河冰塞川 拔剑四顾心茫然'
    return withDerived({
      id: newId(),
      seq: index + 1,
      source_path: attachment.path,
      source_name: attachment.name,
      source_type: attachment.isDir ? 'folder' : 'file',
      target_library_id: library?.id ?? null,
      target_library_name: library?.name ?? 'ai短剧',
      target_folder: kind === 'classify' ? folder : '',
      creates_folder: kind === 'classify',
      new_name: newName,
      final_name: newName || attachment.name,
      destination_path: '',
      move_selected: true,
      rename_selected: true,
      has_move: false,
      has_rename: false,
      move_reason: '',
      rename_reason: '',
      rule_source: '',
      review_note: '',
      warnings: [],
      blocking: null,
      has_change: false,
      selected: false,
      has_rule_draft: false,
      state: 'proposed',
      result_path: '',
      error: '',
    })
  })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const demoLogs: AgentAiLogDto[] = [
    {
      stage: '第 1 阶段：匹配目标文件库',
      model: 'auto/gpt-6.1-sol (openai)',
      elapsed_ms: 840,
      input_tokens: 1420,
      output_tokens: 380,
      cached_tokens: 896,
      total_tokens: 1800,
      system_prompt: '根据文件与源目录名称匹配目标文件库。',
      request_body: JSON.stringify({ instruction, items: attachments.map((item) => item.name) }, null, 2),
      response_body: JSON.stringify({ reply: '已归入 ai短剧 库并清理文件名。' }, null, 2),
      ok: true,
    },
  ]
  return {
    id: newId(),
    kind,
    instruction,
    reply: '已识别为同一部剧集，自动合并冗余子目录、剔除网址广告前缀并统一剧集命名。',
    state: 'draft',
    mode: 'move',
    notices: [],
    elapsed_ms: 840,
    ai_logs: demoLogs,
    created_at: timestamp,
    updated_at: timestamp,
    actions,
    rule_drafts: [],
  }
}

function mockUpdate(plan: AgentPlanDto, edits: AgentActionEdit[], libraries: AgentLibrary[]): AgentPlanDto {
  const byId = new Map(edits.map((edit) => [edit.id, edit]))
  return {
    ...plan,
    actions: plan.actions.map((action) => {
      const edit = byId.get(action.id)
      if (!edit) return action
      const library = libraries.find((candidate) => candidate.id === edit.targetLibraryId)
      return withDerived({ ...action, move_selected: edit.moveSelected, rename_selected: edit.renameSelected, target_library_id: library?.id ?? null, target_library_name: library?.name ?? '', target_folder: library ? edit.targetFolder : '', new_name: edit.newName === action.source_name ? '' : edit.newName })
    }),
  }
}

function mockExecute(plan: AgentPlanDto, mode: Mode): AgentPlanDto {
  return { ...plan, mode, state: 'executed', actions: plan.actions.map((action) => action.selected ? { ...action, state: 'done', selected: false, result_path: `${action.target_library_name || '原位置'} / ${action.final_name}` } : action) }
}

function mockUndo(plan: AgentPlanDto): AgentPlanDto {
  return { ...plan, state: 'undone', actions: plan.actions.map((action) => action.state === 'done' ? { ...action, state: 'undone' } : action) }
}

// ───────────────────────────── 子组件 ─────────────────────────────

function PlanStateBadge({ state }: { state: string }) {
  const { t } = useI18n()
  if (state === 'draft') return <Badge variant="warning">{t('待确认执行')}</Badge>
  if (state === 'executed') return <Badge>{t('已执行完成')}</Badge>
  if (state === 'partially_executed') return <Badge variant="warning">{t('部分已执行')}</Badge>
  if (state === 'undone') return <Badge variant="neutral">{t('已撤销')}</Badge>
  if (state === 'partially_undone') return <Badge variant="danger">{t('撤销未完成')}</Badge>
  return <Badge variant="outline">{state}</Badge>
}

const STATE_LABELS: Record<string, { label: string; variant: 'default' | 'warning' | 'danger' | 'neutral' | 'outline' }> = {
  skipped: { label: '已跳过', variant: 'warning' },
  failed: { label: '失败', variant: 'danger' },
  running: { label: '中断', variant: 'danger' },
  undo_failed: { label: '撤销失败', variant: 'danger' },
}

function StateLine({ state, error }: { state: string; error: string }) {
  const { t } = useI18n()
  const entry = STATE_LABELS[state]
  if (!entry && !error) return null
  return <div className="agent-action-state">{entry && <Badge variant={entry.variant}>{t(entry.label)}</Badge>}{error ? <span>{error}</span> : null}</div>
}

function ActionEditor({ action, libraries, busy, onCancel, onSave }: { action: AgentActionDto; libraries: AgentLibrary[]; busy: boolean; onCancel: () => void; onSave: (draft: Draft) => void }) {
  const { t } = useI18n()
  const [libraryId, setLibraryId] = useState<string | null>(action.target_library_id)
  const [folder, setFolder] = useState(action.target_folder)
  const [newName, setNewName] = useState(action.new_name || action.source_name)
  const available = useMemo(() => libraries.filter((lib) => lib.status !== '不可用'), [libraries])
  const { nodes, values } = useMemo(() => buildTargetNodes(available, t), [available, t])
  const normalizedFolder = folder.replace(/\\/g, '/').split('/').map((part) => part.trim()).filter(Boolean).join('/')
  const exact = libraryId ? targetValue(libraryId, normalizedFolder) : 'none'
  const treeValue = !libraryId ? 'none' : values.has(exact) ? exact : targetValue(libraryId, '')
  const unknownFolder = Boolean(libraryId && normalizedFolder && !values.has(exact))
  return (
    <div className="agent-editor">
      <div className="agent-editor-field">
        <span>{t('目标文件库')}</span>
        <TreeSelect value={treeValue} nodes={nodes} placeholder={t('选择文件库或文件夹')} onChange={(value) => {
          if (value === 'none') { setLibraryId(null); setFolder(''); return }
          try { const target = JSON.parse(value) as { libraryId: string; folderPath: string }; setLibraryId(target.libraryId); setFolder(target.folderPath) } catch { /* 忽略 */ }
        }} />
      </div>
      <label className="agent-editor-field">
        <span>{t('库内子文件夹')}</span>
        <TextInput value={folder} disabled={!libraryId} onChange={(event) => setFolder(event.target.value)} placeholder={libraryId ? t('留空表示根目录，或输入子文件夹名') : t('不移动时无需填写')} />
        {unknownFolder && <small className="agent-editor-hint"><FolderPlus size={12} />{t('执行时将自动新建此文件夹')}</small>}
      </label>
      <label className="agent-editor-field">
        <span>{t('新名称')}</span>
        <TextInput value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={action.source_name} />
        <small className="agent-editor-hint">{action.source_type === 'file' ? t('与原名相同即不改名；请保留扩展名') : t('与原名相同即不改名')}</small>
      </label>
      <div className="agent-editor-actions">
        <Button variant="ghost" size="sm" onClick={onCancel}>{t('取消')}</Button>
        <Button size="sm" disabled={busy} onClick={() => onSave({ libraryId, folder: libraryId ? normalizedFolder : '', newName: newName.trim() === action.source_name ? '' : newName.trim() })}><Check size={14} />{t('保存修改')}</Button>
      </div>
    </div>
  )
}

function CompareFileRow({
  action,
  libraries,
  editable,
  busy,
  editing,
  inFolderGroup = false,
  hideRedundantMoveTarget = false,
  isLastChild = false,
  setEditing,
  onEdit,
  onOpenPath,
  onSave,
}: {
  action: AgentActionDto
  libraries: AgentLibrary[]
  editable: boolean
  busy: boolean
  editing: boolean
  inFolderGroup?: boolean
  hideRedundantMoveTarget?: boolean
  isLastChild?: boolean
  setEditing: (id: string | null) => void
  onEdit: (action: AgentActionDto, patch: EditPatch) => void
  onOpenPath?: (path: string) => void
  onSave: (action: AgentActionDto, draft: Draft) => Promise<boolean>
}) {
  const { t } = useI18n()
  const library = libraries.find((candidate) => candidate.id === action.target_library_id)
  const canEdit = editable && action.state !== 'done'
  const hasAction = action.has_move || action.has_rename
  const checked = isChecked(action)
  const libName = action.target_library_name || library?.name || ''
  const targetFolderText = action.target_folder ? `${libName} / ${action.target_folder}` : libName
  const isDuplicate = action.conflict_kind === 'duplicate'
  const isAutoNumbered = action.conflict_kind === 'auto_numbered'
  const finalFileName =
    action.final_name ||
    (action.has_rename && action.rename_selected ? action.new_name : (action.new_name || action.source_name))
  const hasAlerts = Boolean(action.review_note || action.warnings.length > 0 || (canEdit && action.blocking) || STATE_LABELS[action.state] || action.error)
  const openTarget = action.state === 'done' && action.result_path ? action.result_path : action.source_path

  return (
    <div className={`wb-item-wrap ${canEdit && action.selected ? 'selected' : ''} ${canEdit && action.blocking ? 'blocked' : ''}`}>
      <div className={`wb-compare-row ${inFolderGroup ? 'child-row' : 'root-row'}`} role="row">
        {/* 第 1 列：勾选框 */}
        <div className="wb-col-check">
          {canEdit && hasAction ? (
            <Checkbox
              checked={checked}
              disabled={busy}
              onChange={(value) => onEdit(action, { moveSelected: value && action.has_move, renameSelected: value && action.has_rename })}
              aria-label={action.source_name}
            />
          ) : action.state === 'done' ? (
            <span className="agent-done-mark"><Check size={12} /></span>
          ) : null}
        </div>

        {/* 第 2 列：移动前（原文件） */}
        <div className="wb-col-before">
          {inFolderGroup && (
            <span className="wb-tree-branch" aria-hidden="true">
              {isLastChild ? '└─' : '├─'}
            </span>
          )}
          <span className={`agent-object-icon ${action.source_type === 'folder' ? 'folder' : ''}`}>
            {action.source_type === 'folder' ? <Folder size={14} /> : <File size={14} />}
          </span>
          <div className="wb-before-text">
            <span className="wb-file-old-name" title={action.source_path}>{action.source_name}</span>
            {onOpenPath && openTarget && (
              <button
                type="button"
                className="agent-open-btn"
                onClick={() => onOpenPath(openTarget)}
                title={openTarget}
                aria-label={action.source_name}
              >
                <ExternalLink size={12} />
              </button>
            )}
          </div>
        </div>

        {/* 第 3 列：方向箭头 */}
        <div className="wb-col-arrow" aria-hidden="true">
          <ArrowRight size={14} className={hasAction ? 'active' : ''} />
        </div>

        {/* 第 4 列：移动后（目标文件夹 + 新文件名） */}
        <div className="wb-col-after">
          {hasAction ? (
            <div className="wb-after-main">
              <div className="wb-after-name-line">
                {isDuplicate ? (
                  <>
                    <span className="wb-badge-dup">{t('真重复 · 内容完全一致')}</span>
                    <strong className="wb-file-new-name dup">{finalFileName}</strong>
                  </>
                ) : action.has_rename || isAutoNumbered ? (
                  <>
                    <span className={`wb-badge-rename ${action.rename_selected ? '' : 'off'}`}>{t('改名')}</span>
                    {isAutoNumbered && <span className="wb-badge-autonum">{t('撞名自动编号')}</span>}
                    <strong className={`wb-file-new-name ${action.rename_selected || isAutoNumbered ? '' : 'off'}`}>{finalFileName}</strong>
                  </>
                ) : (
                  <span className="wb-file-keep-name">{t('{name}（保持原名）', { name: action.source_name })}</span>
                )}
              </div>
              {isDuplicate && (
                <div className="wb-after-dest-line dup-line">
                  <span className="wb-dup-hint-text">
                    {action.state === 'done'
                      ? t('已清理源位置重复文件（保留已有副本）')
                      : t('目标已有相同内容文件 · 执行或点下方「一键清理源位置重复」自动删除源重复件')}
                  </span>
                  {onOpenPath && action.duplicate_of && (
                    <button
                      type="button"
                      className="wb-open-dup-btn"
                      onClick={() => onOpenPath(action.duplicate_of!)}
                      title={action.duplicate_of}
                    >
                      <ExternalLink size={11} />{t('查看已有文件')}
                    </button>
                  )}
                </div>
              )}
              {action.has_move && targetFolderText && !hideRedundantMoveTarget && !isDuplicate && (
                <div className={`wb-after-dest-line ${action.move_selected ? '' : 'off'}`}>
                  <span className={`library-mark ${library?.color ?? 'mint'}`} aria-hidden="true" />
                  <span className="wb-dest-path-text">{t('移动到：{path}', { path: targetFolderText })}</span>
                  {action.creates_folder && !inFolderGroup && <em className="agent-new-tag">{t('新建目录')}</em>}
                </div>
              )}
            </div>
          ) : (
            <span className="agent-change-none">{t('保持原位置与原文件名不变')}</span>
          )}
        </div>

        {/* 第 5 列：操作 */}
        <div className="wb-col-ops">
          {canEdit && (
            <button
              type="button"
              className={`icon-button small ${editing ? 'active' : ''}`}
              disabled={busy}
              onClick={() => setEditing(editing ? null : action.id)}
              title={t('手动修改目标位置或文件名')}
              aria-label={action.source_name}
            >
              <Pencil size={14} />
            </button>
          )}
        </div>
      </div>

      {hasAlerts && (
        <div className="wb-row-alerts">
          {action.review_note && <span className="agent-note review"><CircleAlert size={12} />{action.review_note}</span>}
          {action.warnings.map((warning) => <span key={warning} className="agent-note warning"><CircleAlert size={12} />{warning}</span>)}
          {canEdit && action.blocking && <span className="agent-note danger"><CircleAlert size={12} />{action.blocking}</span>}
          <StateLine state={action.state} error={action.error} />
        </div>
      )}

      {editing && canEdit && (
        <ActionEditor
          action={action}
          libraries={libraries}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={async (draft) => { if (await onSave(action, draft)) setEditing(null) }}
        />
      )}
    </div>
  )
}

function CompareFolderGroup({
  group,
  isOpen,
  onToggleExpand,
  libraries,
  editable,
  busy,
  editing,
  setEditing,
  onEdit,
  onToggleBatch,
  onRenameFolderGroup,
  onOpenPath,
  onSave,
}: {
  group: PlanFolderGroup
  isOpen: boolean
  onToggleExpand: () => void
  libraries: AgentLibrary[]
  editable: boolean
  busy: boolean
  editing: string | null
  setEditing: (id: string | null) => void
  onEdit: (action: AgentActionDto, patch: EditPatch) => void
  onToggleBatch: (actions: AgentActionDto[], selected: boolean) => void
  onRenameFolderGroup: (actions: AgentActionDto[], libraryId: string, newFolderPath: string) => Promise<boolean>
  onOpenPath?: (path: string) => void
  onSave: (action: AgentActionDto, draft: Draft) => Promise<boolean>
}) {
  const { t } = useI18n()
  const [editingFolder, setEditingFolder] = useState(false)
  const [folderDraft, setFolderDraft] = useState('')
  const folderInputRef = useRef<HTMLInputElement>(null)

  const selectable = group.files.filter((act) => act.state !== 'done' && (act.has_move || act.has_rename))
  const allChecked = selectable.length > 0 && selectable.every((act) => isChecked(act))
  const allDone = group.files.length > 0 && group.files.every((act) => act.state === 'done')

  const moveTargets = useMemo(() => {
    const map = new Map<string, { key: string; libId: string; libName: string; folderPath: string; color: string; createsFolder: boolean }>()
    for (const act of group.files) {
      if (!act.has_move || !act.target_library_id) continue
      const lib = libraries.find((candidate) => candidate.id === act.target_library_id)
      const libName = act.target_library_name || lib?.name || t('未知文件库')
      const key = `${act.target_library_id}:${act.target_folder}`
      const existing = map.get(key)
      map.set(key, {
        key,
        libId: act.target_library_id,
        libName,
        folderPath: act.target_folder,
        color: lib?.color ?? 'mint',
        createsFolder: Boolean(existing?.createsFolder || act.creates_folder),
      })
    }
    return Array.from(map.values())
  }, [group.files, libraries, t])

  const singleTarget = moveTargets.length === 1 ? moveTargets[0] : null
  const outerItem = group.sourceChain[0]
  const outerSource = outerItem?.name ?? ''
  const nestedRedundant = group.sourceChain.slice(1)
  const renameCount = group.files.filter((act) => act.has_rename).length
  const canEditFolder = Boolean(editable && singleTarget && selectable.length > 0)

  const startFolderEdit = () => {
    if (!singleTarget || busy) return
    setFolderDraft(singleTarget.folderPath || '')
    setEditingFolder(true)
    window.setTimeout(() => {
      folderInputRef.current?.focus()
      folderInputRef.current?.select()
    }, 0)
  }

  const submitFolderEdit = async () => {
    if (!singleTarget || busy) return
    const normalized = folderDraft
      .replace(/\\/g, '/')
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean)
      .join('/')
    if (normalized === singleTarget.folderPath) {
      setEditingFolder(false)
      return
    }
    const ok = await onRenameFolderGroup(group.files, singleTarget.libId, normalized)
    if (ok) {
      setEditingFolder(false)
    }
  }

  return (
    <div className="wb-folder-group">
      {/* 文件夹级对比行：左边原目录结构 ──→ 右边新归档目录 */}
      <div className="wb-compare-row folder-row" role="row">
        <div className="wb-col-check">
          {editable && selectable.length > 0 ? (
            <Checkbox
              checked={allChecked}
              disabled={busy}
              onChange={(value) => onToggleBatch(group.files, value)}
              aria-label={outerSource}
            />
          ) : allDone ? (
            <span className="agent-done-mark"><Check size={12} /></span>
          ) : null}
        </div>

        {/* 左列：整理前（原文件夹层级 + 被合并删除的多余子文件夹） */}
        <div className="wb-col-before folder-before" onClick={onToggleExpand}>
          <div className="wb-folder-tree-head">
            <ChevronRight size={15} className={`agent-tree-chevron ${isOpen ? 'open' : ''}`} />
            <span className="agent-object-icon folder">
              <Folder size={15} />
            </span>
            <strong className="wb-folder-old-title">{outerSource}</strong>
            <span className="agent-folder-badge">{t('{count} 个文件', { count: group.files.length })}</span>
            {onOpenPath && outerItem?.fullPath && (
              <button
                type="button"
                className="agent-open-btn"
                onClick={(event) => {
                  event.stopPropagation()
                  onOpenPath(outerItem.fullPath)
                }}
                title={outerItem.fullPath}
                aria-label={outerSource}
              >
                <ExternalLink size={12} />
              </button>
            )}
          </div>
          {nestedRedundant.map((seg, idx) => (
            <div key={`${idx}-${seg.name}`} className="wb-redundant-sub">
              <span className="wb-tree-branch">└─</span>
              <Folder size={13} className="wb-redundant-icon" />
              <del title={t('该多层嵌套子文件夹将在移动后自动合并清理')}>{seg.name}</del>
              <span className="agent-flattened-tag">{t('移除此层多余子文件夹')}</span>
              {onOpenPath && seg.fullPath && (
                <button
                  type="button"
                  className="agent-open-btn"
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenPath(seg.fullPath)
                  }}
                  title={seg.fullPath}
                  aria-label={seg.name}
                >
                  <ExternalLink size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* 中间箭头 */}
        <div className="wb-col-arrow" aria-hidden="true">
          <ArrowRight size={15} className="active" />
        </div>

        {/* 右列：整理后（目标文件库 / 新子文件夹路径，支持直接点击修改新文件夹名称） */}
        <div className="wb-col-after folder-after">
          {singleTarget ? (
            <div className="wb-folder-target-box">
              <div className="wb-folder-target-line">
                <span className={`library-mark ${singleTarget.color}`} aria-hidden="true" />
                <span className="wb-target-lib">{singleTarget.libName}</span>
                <span className="agent-folder-sep">/</span>
                {editingFolder && canEditFolder ? (
                  <div className="wb-folder-inline-edit">
                    <Folder size={14} className="wb-target-folder-icon" />
                    <input
                      ref={folderInputRef}
                      type="text"
                      className="wb-folder-inline-input"
                      value={folderDraft}
                      disabled={busy}
                      placeholder={t('输入新文件夹名称（留空则直接放入文件库根目录）')}
                      aria-label={t('修改新文件夹名称')}
                      onChange={(event) => setFolderDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                          event.preventDefault()
                          void submitFolderEdit()
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          setEditingFolder(false)
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="wb-folder-inline-btn save"
                      disabled={busy}
                      onClick={() => void submitFolderEdit()}
                      title={t('保存新文件夹名称（Enter）')}
                    >
                      <Check size={13} />{t('保存')}
                    </button>
                    <button
                      type="button"
                      className="wb-folder-inline-btn cancel"
                      disabled={busy}
                      onClick={() => setEditingFolder(false)}
                      title={t('取消')}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : canEditFolder ? (
                  <button
                    type="button"
                    className="wb-folder-name-trigger"
                    disabled={busy}
                    onClick={startFolderEdit}
                    title={t('点击直接修改新文件夹名称（将同步应用到全部子文件）')}
                  >
                    <Folder size={14} className="wb-target-folder-icon" />
                    {singleTarget.folderPath ? (
                      <strong className="wb-target-folder-name">{singleTarget.folderPath}</strong>
                    ) : (
                      <span className="wb-target-root">{t('（文件库根目录 · 点击设置文件夹名）')}</span>
                    )}
                    <Pencil size={12} className="wb-folder-edit-icon" />
                  </button>
                ) : singleTarget.folderPath ? (
                  <>
                    <Folder size={14} className="wb-target-folder-icon" />
                    <strong className="wb-target-folder-name">{singleTarget.folderPath}</strong>
                  </>
                ) : (
                  <span className="wb-target-root">{t('（文件库根目录）')}</span>
                )}
                {!editingFolder && singleTarget.createsFolder && <em className="agent-new-tag">{t('新建文件夹')}</em>}
              </div>
              <div className="wb-folder-target-meta">
                <span>{t('归档 {count} 个子文件', { count: group.files.length })}</span>
                {renameCount > 0 && <span>{t('· 自动规范重命名 {count} 个文件', { count: renameCount })}</span>}
                {nestedRedundant.length > 0 && <span>{t('· 合并清理 {count} 层嵌套目录', { count: nestedRedundant.length })}</span>}
              </div>
            </div>
          ) : moveTargets.length > 1 ? (
            <span className="wb-target-multi">{t('子文件将分别归入 {count} 个目标目录', { count: moveTargets.length })}</span>
          ) : (
            <span className="wb-target-multi">{t('在原文件夹内改名（共 {count} 项）', { count: renameCount })}</span>
          )}
        </div>

        {/* 右侧展开/收起按钮 */}
        <div className="wb-col-ops">
          <button
            type="button"
            className={`agent-tree-expand-chip ${isOpen ? 'open' : ''}`}
            onClick={onToggleExpand}
            aria-expanded={isOpen}
          >
            <span>{isOpen ? t('收起') : t('展开')}</span>
            <ChevronRight size={12} className={`agent-tree-chevron ${isOpen ? 'open' : ''}`} />
          </button>
        </div>
      </div>

      {/* 展开的子文件对比列表 */}
      {isOpen && (
        <div className="wb-folder-children">
          {group.files.map((action, idx) => (
            <CompareFileRow
              key={action.id}
              action={action}
              libraries={libraries}
              editable={editable}
              busy={busy}
              editing={editing === action.id}
              inFolderGroup
              hideRedundantMoveTarget={Boolean(singleTarget)}
              isLastChild={idx === group.files.length - 1}
              setEditing={setEditing}
              onEdit={onEdit}
              onOpenPath={onOpenPath}
              onSave={onSave}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AttachmentTreeBranch({
  nodes,
  depth = 0,
  onOpenPath,
  onRemovePaths,
}: {
  nodes: AttachmentTreeNode[]
  depth?: number
  onOpenPath?: (path: string) => void
  onRemovePaths?: (paths: string[]) => void
}) {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  return (
    <div className={`agent-att-tree-level ${depth > 0 ? 'nested' : ''}`}>
      {nodes.map((node) => {
        if (!node.isDir) {
          return (
            <div key={node.key} className="agent-att-tree-file" title={node.file?.path}>
              <File size={13} className="agent-att-tree-icon file" />
              <span className="agent-att-tree-name">{node.name}</span>
              {onOpenPath && node.openPath && (
                <button
                  type="button"
                  className="agent-open-btn"
                  onClick={() => onOpenPath(node.openPath!)}
                  title={node.openPath}
                  aria-label={node.name}
                >
                  <ExternalLink size={12} />
                </button>
              )}
              {onRemovePaths && (
                <button
                  type="button"
                  className="agent-att-tree-remove"
                  onClick={() => onRemovePaths(node.allPaths)}
                  aria-label={node.name}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )
        }
        const isOpen = !collapsed[node.key]
        return (
          <div key={node.key} className="agent-att-tree-folder">
            <div className="agent-att-tree-folder-row">
              <button
                type="button"
                className="agent-att-tree-toggle"
                onClick={() => setCollapsed((cur) => ({ ...cur, [node.key]: !cur[node.key] }))}
                aria-expanded={isOpen}
              >
                <ChevronRight size={14} className={`agent-tree-chevron ${isOpen ? 'open' : ''}`} />
                <Folder size={14} className="agent-att-tree-icon folder" />
                <strong className="agent-att-tree-name" title={node.openPath || node.name}>{node.name}</strong>
                {node.allPaths.length > 0 && <span className="agent-att-tree-count">{t('{count} 个文件', { count: node.allPaths.length })}</span>}
              </button>
              {onOpenPath && node.openPath && (
                <button
                  type="button"
                  className="agent-open-btn"
                  onClick={() => onOpenPath(node.openPath!)}
                  title={node.openPath}
                  aria-label={node.name}
                >
                  <ExternalLink size={12} />
                </button>
              )}
              {onRemovePaths && (
                <button
                  type="button"
                  className="agent-att-tree-remove"
                  onClick={() => onRemovePaths(node.allPaths)}
                  aria-label={node.name}
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {isOpen && node.children.length > 0 && (
              <AttachmentTreeBranch nodes={node.children} depth={depth + 1} onOpenPath={onOpenPath} onRemovePaths={onRemovePaths} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function RuleDraftItem({ draft, editable, busy, onUpdate }: { draft: AgentRuleDraftDto; editable: boolean; busy: boolean; onUpdate: (draft: AgentRuleDraftDto, selected: boolean, content: string) => Promise<boolean> }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(draft.content)
  useEffect(() => { setText(draft.content) }, [draft.content])
  const canEdit = editable && draft.state !== 'done'
  const label = `${draft.library_name} / ${draft.folder_path} / ${RULE_FILE_NAME}`
  return <div className={`agent-draft ${open ? 'open' : ''}`}>
    <div className="agent-draft-head">
      {canEdit ? <Checkbox checked={draft.selected} disabled={busy} onChange={(value) => void onUpdate(draft, value, draft.content)} aria-label={label} /> : <span className="agent-draft-icon"><FileText size={13} /></span>}
      <button type="button" className="agent-draft-title" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronRight size={13} className="agent-draft-chevron" /><span title={label}>{label}</span>
      </button>
      {!draft.in_use && canEdit && <Badge variant="neutral">{t('对应的移动未勾选')}</Badge>}
      <StateLine state={draft.state} error={draft.error} />
    </div>
    {open && <div className="agent-draft-body">
      <textarea value={text} onChange={(event) => setText(event.target.value)} readOnly={!canEdit} spellCheck={false} aria-label={label} />
      {canEdit && <div className="agent-draft-actions">
        {text !== draft.content && <Button variant="ghost" size="sm" onClick={() => setText(draft.content)}>{t('还原')}</Button>}
        <Button size="sm" disabled={busy || text === draft.content || !text.trim()} onClick={() => void onUpdate(draft, draft.selected, text)}><Check size={14} />{t('保存草稿')}</Button>
      </div>}
    </div>}
  </div>
}

function AiLogsBody({ logs }: { logs: AgentAiLogDto[] }) {
  const { t } = useI18n()
  const summary = useMemo(() => {
    let input = 0
    let output = 0
    let cached = 0
    let total = 0
    for (const log of logs) {
      const inp = log.input_tokens ?? 0
      const out = log.output_tokens ?? 0
      const cac = log.cached_tokens ?? 0
      const tot = log.total_tokens || inp + out
      input += inp
      output += out
      cached += cac
      total += tot
    }
    return { input, output, cached, total }
  }, [logs])

  return (
    <div className="agent-logs-body">
      {logs.length === 0 ? (
        <div className="agent-logs-empty">{t('此计划未保存 AI 请求与响应原始报文。')}</div>
      ) : (
        <>
          <div className="agent-logs-token-summary">
            <div className="agent-token-stat primary">
              <span>{t('总消耗 Token')}</span>
              <strong>{summary.total.toLocaleString()}</strong>
            </div>
            <div className="agent-token-stat">
              <span>{t('输入（Input）')}</span>
              <strong>{summary.input.toLocaleString()}</strong>
            </div>
            <div className="agent-token-stat cached">
              <span>{t('缓存命中（Cached）')}</span>
              <strong>
                {summary.cached.toLocaleString()}
                {summary.input > 0 && summary.cached > 0
                  ? ` (${Math.round((summary.cached / summary.input) * 100)}%)`
                  : ''}
              </strong>
            </div>
            <div className="agent-token-stat">
              <span>{t('输出（Output）')}</span>
              <strong>{summary.output.toLocaleString()}</strong>
            </div>
          </div>

          {logs.map((log, index) => {
            const roundInput = log.input_tokens ?? 0
            const roundOutput = log.output_tokens ?? 0
            const roundCached = log.cached_tokens ?? 0
            const roundTotal = log.total_tokens || roundInput + roundOutput
            return (
              <div key={`${index}-${log.stage}`} className="agent-log-round">
                <div className="agent-log-round-head">
                  <div className="agent-log-round-title">
                    <span className="agent-log-step-badge">{t('第 {round} 轮', { round: index + 1 })}</span>
                    <strong>{log.stage}</strong>
                  </div>
                  <div className="agent-log-round-badges">
                    <span className="agent-log-token-pill">
                      {t('输入')} <b>{roundInput.toLocaleString()}</b> · {t('缓存')} <b>{roundCached.toLocaleString()}</b> · {t('输出')} <b>{roundOutput.toLocaleString()}</b> · {t('合计')} <b>{roundTotal.toLocaleString()}</b> tokens
                    </span>
                    {log.model && <Badge variant="outline">{log.model}</Badge>}
                    <Badge variant={log.ok ? 'default' : 'danger'}>
                      <Clock size={11} />
                      {formatDuration(log.elapsed_ms)} · {log.ok ? t('成功') : t('异常')}
                    </Badge>
                  </div>
                </div>
                {log.system_prompt && (
                  <details className="agent-log-sys">
                    <summary>{t('系统提示词（System Prompt）')}</summary>
                    <pre>{log.system_prompt}</pre>
                  </details>
                )}
                <div className="agent-log-io-grid">
                  <div className="agent-log-box">
                    <div className="agent-log-box-head">
                      <span>{t('请求（Request JSON）')}</span>
                    </div>
                    <pre>{log.request_body || t('（空）')}</pre>
                  </div>
                  <div className="agent-log-box">
                    <div className="agent-log-box-head">
                      <span>{t('返回（Response）')}</span>
                    </div>
                    <pre>{log.response_body || t('（空）')}</pre>
                  </div>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

type ConflictResolutionStrategy = 'dedup' | 'rename' | 'skip'

type ConflictItemDraft = {
  strategy: ConflictResolutionStrategy
  customName: string
}

function suggestNumberedName(name: string, isFolder: boolean): string {
  if (isFolder) {
    return /\(\d+\)$/.test(name.trim()) ? name : `${name} (1)`
  }
  const dot = name.lastIndexOf('.')
  if (dot > 0) {
    const stem = name.slice(0, dot)
    const ext = name.slice(dot)
    return /\(\d+\)$/.test(stem.trim()) ? name : `${stem} (1)${ext}`
  }
  return `${name} (1)`
}

function validateCustomFileName(
  name: string,
  t: (zhKey: string, params?: Record<string, string | number>) => string,
): string | null {
  const trimmed = name.trim()
  if (!trimmed) return t('目标文件名不能为空')
  if (trimmed === '.' || trimmed === '..') return t('文件名无效')
  if (/[\\/:*?"<>|]/.test(trimmed)) return t('文件名不能包含 \\ / : * ? " < > | 字符')
  if (trimmed.endsWith('.') || trimmed.endsWith(' ')) return t('文件名不能以句点或空格结尾')
  return null
}

function ConflictConfirmModal({
  conflicts,
  mode,
  busy,
  onOpenPath,
  onCancel,
  onConfirm,
}: {
  conflicts: AgentActionDto[]
  mode: Mode
  busy: boolean
  onOpenPath?: (path: string) => void
  onCancel: () => void
  onConfirm: (resolutions: Record<string, ConflictItemDraft>) => void
}) {
  const { t } = useI18n()
  const [drafts, setDrafts] = useState<Record<string, ConflictItemDraft>>(() => {
    const initial: Record<string, ConflictItemDraft> = {}
    for (const item of conflicts) {
      const baseTargetName = item.final_name || item.new_name || item.source_name
      if (item.conflict_kind === 'duplicate') {
        initial[item.id] = {
          strategy: 'dedup',
          customName: suggestNumberedName(baseTargetName, item.source_type === 'folder'),
        }
      } else {
        initial[item.id] = {
          strategy: 'rename',
          customName: baseTargetName,
        }
      }
    }
    return initial
  })

  const duplicateCount = conflicts.filter((item) => item.conflict_kind === 'duplicate').length
  const collisionCount = conflicts.filter((item) => item.conflict_kind === 'auto_numbered').length

  const validationError = useMemo(() => {
    for (const item of conflicts) {
      const d = drafts[item.id]
      if (!d || d.strategy !== 'rename') continue
      const err = validateCustomFileName(d.customName, t)
      if (err) return `"${item.source_name}": ${err}`
    }
    return null
  }, [conflicts, drafts, t])

  const updateItem = (id: string, patch: Partial<ConflictItemDraft>) => {
    setDrafts((cur) => ({
      ...cur,
      [id]: { ...cur[id], ...patch },
    }))
  }

  const applyRecommendedAll = () => {
    const next: Record<string, ConflictItemDraft> = {}
    for (const item of conflicts) {
      const baseTargetName = item.final_name || item.new_name || item.source_name
      next[item.id] = {
        strategy: item.conflict_kind === 'duplicate' ? 'dedup' : 'rename',
        customName:
          item.conflict_kind === 'duplicate'
            ? suggestNumberedName(baseTargetName, item.source_type === 'folder')
            : baseTargetName,
      }
    }
    setDrafts(next)
  }

  const skipAllConflicts = () => {
    setDrafts((cur) => {
      const next: Record<string, ConflictItemDraft> = {}
      for (const item of conflicts) {
        next[item.id] = {
          ...(cur[item.id] ?? { customName: item.final_name || item.new_name || item.source_name }),
          strategy: 'skip',
        }
      }
      return next
    })
  }

  return (
    <div className="wb-modal-backdrop" role="dialog" aria-modal="true" aria-label={t('确认冲突文件处理方式')}>
      <div className="wb-conflict-modal">
        <header className="wb-conflict-modal-head">
          <div className="wb-conflict-head-main">
            <span className="wb-conflict-head-icon">
              <CircleAlert size={18} />
            </span>
            <div>
              <h3>{t('发现 {count} 个文件存在冲突，请确认处理方式', { count: conflicts.length })}</h3>
              <p>
                {collisionCount > 0 && t('撞名冲突 {count} 项（内容不同，已默认自动编号）', { count: collisionCount })}
                {collisionCount > 0 && duplicateCount > 0 && ' · '}
                {duplicateCount > 0 &&
                  (mode === 'move'
                    ? t('真重复 {count} 项（SHA-256 内容完全一致，默认清理源重复文件）', { count: duplicateCount })
                    : t('真重复 {count} 项（SHA-256 内容完全一致，默认跳过重复复制）', { count: duplicateCount }))}
              </p>
            </div>
          </div>
          <div className="wb-conflict-head-actions">
            <Button variant="ghost" size="sm" disabled={busy} onClick={applyRecommendedAll}>
              {t('全部按推荐方式')}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={skipAllConflicts}>
              {t('全部跳过冲突项')}
            </Button>
            <button type="button" className="icon-button small" disabled={busy} onClick={onCancel} aria-label={t('关闭')}>
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="wb-conflict-modal-list">
          {conflicts.map((item) => {
            const isDup = item.conflict_kind === 'duplicate'
            const draft = drafts[item.id] ?? {
              strategy: isDup ? 'dedup' : 'rename',
              customName: item.final_name || item.new_name || item.source_name,
            }
            const targetFolderLabel = [item.target_library_name, item.target_folder].filter(Boolean).join(' / ') || t('原文件夹')
            const nameErr = draft.strategy === 'rename' ? validateCustomFileName(draft.customName, t) : null

            return (
              <div key={item.id} className={`wb-conflict-item ${draft.strategy === 'skip' ? 'is-skipped' : ''}`}>
                <div className="wb-conflict-item-top">
                  <div className="wb-conflict-item-info">
                    {isDup ? (
                      <span className="wb-badge-dup">{t('真重复 · 内容完全一致')}</span>
                    ) : (
                      <span className="wb-badge-autonum">{t('撞名冲突 · 内容不同')}</span>
                    )}
                    <strong className="wb-conflict-src-name" title={item.source_path}>
                      {item.source_name}
                    </strong>
                    {onOpenPath && (
                      <button
                        type="button"
                        className="agent-open-btn"
                        onClick={() => onOpenPath(item.source_path)}
                        title={item.source_path}
                      >
                        <ExternalLink size={12} />
                      </button>
                    )}
                    <span className="wb-conflict-dest-tag" title={targetFolderLabel}>
                      → {targetFolderLabel}
                    </span>
                  </div>

                  {/* 处理方式切换 */}
                  <div className="segmented wb-conflict-strategy">
                    {isDup ? (
                      <>
                        <button
                          type="button"
                          className={draft.strategy === 'dedup' ? 'active' : ''}
                          disabled={busy}
                          onClick={() => updateItem(item.id, { strategy: 'dedup' })}
                        >
                          {mode === 'move' ? t('清理源重复件') : t('跳过重复复制')}
                        </button>
                        <button
                          type="button"
                          className={draft.strategy === 'rename' ? 'active' : ''}
                          disabled={busy}
                          onClick={() => updateItem(item.id, { strategy: 'rename' })}
                        >
                          {t('改名并保留两份')}
                        </button>
                        <button
                          type="button"
                          className={draft.strategy === 'skip' ? 'active' : ''}
                          disabled={busy}
                          onClick={() => updateItem(item.id, { strategy: 'skip' })}
                        >
                          {t('跳过不处理')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={draft.strategy === 'rename' ? 'active' : ''}
                          disabled={busy}
                          onClick={() => updateItem(item.id, { strategy: 'rename' })}
                        >
                          {t('修改文件名执行')}
                        </button>
                        <button
                          type="button"
                          className={draft.strategy === 'skip' ? 'active' : ''}
                          disabled={busy}
                          onClick={() => updateItem(item.id, { strategy: 'skip' })}
                        >
                          {t('跳过不处理')}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* 冲突详情与目标文件名编辑框 */}
                <div className="wb-conflict-item-body">
                  {isDup && item.duplicate_of && (
                    <div className="wb-conflict-dup-detail">
                      <span>{t('已存在相同内容文件：{name}', { name: baseName(item.duplicate_of) })}</span>
                      {onOpenPath && (
                        <button
                          type="button"
                          className="wb-open-dup-btn"
                          onClick={() => onOpenPath(item.duplicate_of!)}
                          title={item.duplicate_of}
                        >
                          <ExternalLink size={11} />{t('查看已有文件')}
                        </button>
                      )}
                    </div>
                  )}

                  {draft.strategy === 'rename' ? (
                    <div className="wb-conflict-rename-row">
                      <label className="wb-conflict-rename-label">{t('目标文件名：')}</label>
                      <input
                        type="text"
                        className={`wb-conflict-name-input ${nameErr ? 'has-error' : ''}`}
                        value={draft.customName}
                        disabled={busy}
                        onChange={(e) => updateItem(item.id, { customName: e.target.value })}
                        placeholder={t('输入不冲突的目标新文件名')}
                      />
                      {item.new_name && (
                        <span className="wb-conflict-orig-prop" title={item.new_name}>
                          {t('原拟名：{name}', { name: item.new_name })}
                        </span>
                      )}
                      {nameErr && <span className="wb-conflict-err-text">{nameErr}</span>}
                    </div>
                  ) : draft.strategy === 'dedup' ? (
                    <div className="wb-conflict-action-desc">
                      {mode === 'move'
                        ? t('执行时将校验 SHA-256 一致后删除源位置重复文件，只保留目标目录已有副本（支持撤销还原）。')
                        : t('复制模式下目标已有完全相同的文件，将自动跳过重复写入。')}
                    </div>
                  ) : (
                    <div className="wb-conflict-action-desc muted">{t('已设为跳过：本次执行将保留原文件在原位置不动。')}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <footer className="wb-conflict-modal-foot">
          <div className="wb-conflict-foot-hint">
            {validationError ? (
              <span className="wb-conflict-err-text">
                <CircleAlert size={13} />
                {validationError}
              </span>
            ) : (
              <span>{t('确认后将按上述设定与修改后的文件名立即执行整理')}</span>
            )}
          </div>
          <div className="wb-conflict-foot-btns">
            <Button variant="outline" size="sm" disabled={busy} onClick={onCancel}>
              {t('取消返回')}
            </Button>
            <Button
              size="sm"
              disabled={busy || Boolean(validationError)}
              onClick={() => onConfirm(drafts)}
            >
              {busy ? <LoaderCircle size={14} className="agent-spin" /> : <Check size={14} />}
              {t('确认并立即执行')}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ───────────────────────────── 分类范围下拉多选器（支持搜索与海量文件库） ─────────────────────────────

function ScopeSelectPopover({
  libraries,
  selectedIds,
  disabled,
  onChange,
}: {
  libraries: AgentLibrary[]
  selectedIds: string[]
  disabled?: boolean
  onChange: (nextIds: string[]) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return libraries
    return libraries.filter((lib) => lib.name.toLowerCase().includes(q))
  }, [libraries, query])

  const isAll = selectedIds.length === 0
  const selectedLibs = useMemo(
    () => libraries.filter((lib) => selectedIds.includes(lib.id)),
    [libraries, selectedIds],
  )

  const toggleItem = (id: string) => {
    if (selectedIds.includes(id)) {
      const next = selectedIds.filter((item) => item !== id)
      onChange(next)
    } else if (libraries.length <= 2) {
      onChange([id])
    } else {
      onChange([...selectedIds, id])
    }
  }

  return (
    <div className="wb-scope-dropdown" ref={wrapRef}>
      <button
        type="button"
        className={`wb-scope-trigger ${open ? 'open' : ''} ${!isAll ? 'filtered' : ''}`}
        disabled={disabled}
        onClick={() => setOpen((cur) => !cur)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t('指定参与 AI 分析的文件库范围，只发送所选文件库的目录与规则，节省 Token 并提高准确率')}
      >
        <span className="wb-scope-trigger-prefix">{t('分类范围：')}</span>
        {isAll ? (
          <span className="wb-scope-trigger-val">{t('全部文件库 ({count})', { count: libraries.length })}</span>
        ) : selectedLibs.length === 1 ? (
          <span className="wb-scope-trigger-val">
            <span className={`library-mark ${selectedLibs[0].color}`} aria-hidden="true" />
            <span className="wb-scope-trigger-name">{selectedLibs[0].name}</span>
          </span>
        ) : (
          <span className="wb-scope-trigger-val">
            <span className={`library-mark ${selectedLibs[0]?.color ?? 'mint'}`} aria-hidden="true" />
            <span className="wb-scope-trigger-name">{selectedLibs[0]?.name}</span>
            <span className="wb-scope-trigger-count">{t('等 {count} 个库', { count: selectedLibs.length })}</span>
          </span>
        )}
        {!isAll && (
          <span
            role="button"
            tabIndex={-1}
            className="wb-scope-clear-btn"
            title={t('重置为全部文件库')}
            onClick={(event) => {
              event.stopPropagation()
              onChange([])
            }}
          >
            <X size={12} />
          </span>
        )}
        <ChevronDown size={14} className={`wb-scope-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="wb-scope-popover" role="dialog" aria-label={t('选择分类文件库范围')}>
          <div className="wb-scope-popover-search">
            <Search size={13} />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('搜索文件库（共 {count} 个）…', { count: libraries.length })}
              aria-label={t('搜索文件库')}
            />
            {query && (
              <button type="button" className="wb-scope-search-clear" onClick={() => setQuery('')}>
                <X size={12} />
              </button>
            )}
          </div>

          <div className="wb-scope-popover-bar">
            <button
              type="button"
              className={`wb-scope-all-row ${isAll ? 'active' : ''}`}
              onClick={() => {
                onChange([])
                setOpen(false)
              }}
            >
              <span className={`wb-scope-check ${isAll ? 'checked' : ''}`}>
                {isAll && <Check size={11} />}
              </span>
              <strong>{t('全部文件库（默认）')}</strong>
              <small>{t('{count} 个库', { count: libraries.length })}</small>
            </button>
          </div>

          <div className="wb-scope-popover-list" role="listbox" aria-multiselectable="true">
            {filtered.length === 0 ? (
              <div className="wb-scope-empty">{t('未找到匹配「{query}」的文件库', { query })}</div>
            ) : (
              filtered.map((lib) => {
                const checked = !isAll && selectedIds.includes(lib.id)
                return (
                  <div
                    key={lib.id}
                    className={`wb-scope-item ${checked ? 'checked' : ''}`}
                    onClick={() => toggleItem(lib.id)}
                  >
                    <span className={`wb-scope-check ${checked ? 'checked' : ''}`}>
                      {checked && <Check size={11} />}
                    </span>
                    <span className={`library-mark ${lib.color}`} aria-hidden="true" />
                    <span className="wb-scope-item-name" title={lib.name}>{lib.name}</span>
                    <button
                      type="button"
                      className="wb-scope-only-btn"
                      onClick={(event) => {
                        event.stopPropagation()
                        onChange([lib.id])
                        setOpen(false)
                      }}
                      title={t('只选「{name}」并立即收起', { name: lib.name })}
                    >
                      {t('仅选')}
                    </button>
                  </div>
                )
              })
            )}
          </div>

          <div className="wb-scope-popover-tip">
            {t('💡 勾选指定文件库，更省 Token 且分类更准')}
          </div>

          <div className="wb-scope-popover-foot">
            <span>
              {isAll
                ? t('当前发送全部 {count} 个文件库', { count: libraries.length })
                : t('已限定 {selected} / {total} 个文件库（节省 Token）', { selected: selectedLibs.length, total: libraries.length })}
            </span>
            {!isAll && (
              <button type="button" className="agent-link" onClick={() => onChange([])}>
                {t('恢复全部')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────────── 主工作台组件 ─────────────────────────────

export function AgentView({ active = true, libraries, defaultMode, setToast, onNeedTree, onExecuted, onOpenSettings, onOpenLibraries }: AgentViewProps) {
  const { t } = useI18n()
  const live = isTauri()
  const availableLibraries = useMemo(() => libraries.filter((lib) => lib.status !== '不可用'), [libraries])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [activePlan, setActivePlan] = useState<AgentPlanDto | null>(null)
  const [viewTab, setViewTab] = useState<'pending' | 'plan'>('pending')
  const [input, setInput] = useState('')
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([])
  const [busy, setBusy] = useState<Busy>(null)
  const [progress, setProgress] = useState('')
  const [progressSteps, setProgressSteps] = useState<string[]>([])
  const [planningElapsedMs, setPlanningElapsedMs] = useState(0)
  const [execProgress, setExecProgress] = useState<AgentExecProgress | null>(null)
  const [dragging, setDragging] = useState(false)
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [errorBanner, setErrorBanner] = useState<ErrorBanner>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({})
  const [conflictModalOpen, setConflictModalOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setMode(defaultMode) }, [defaultMode])
  useEffect(() => { availableLibraries.forEach((library) => { if (!library.folders.length) onNeedTree(library.id) }) }, [availableLibraries])

  useEffect(() => {
    if (!live) return
    let disposed = false
    let unlisten: (() => void) | undefined
    let unlistenExec: (() => void) | undefined
    void listen<AgentProgress>('agent-progress', (event) => {
      const msg = event.payload.message
      setProgress(msg)
      setProgressSteps((current) => (current[current.length - 1] === msg ? current : [...current, msg]))
    }).then((stop) => { if (disposed) stop(); else unlisten = stop })
    void listen<AgentExecProgress>('agent-exec-progress', (event) => {
      setExecProgress(event.payload)
    }).then((stop) => { if (disposed) stop(); else unlistenExec = stop })
    return () => { disposed = true; unlisten?.(); unlistenExec?.() }
  }, [live])

  useEffect(() => {
    if (busy?.kind !== 'planning') {
      setPlanningElapsedMs(0)
      return
    }
    const start = Date.now()
    const timer = window.setInterval(() => {
      setPlanningElapsedMs(Date.now() - start)
    }, 100)
    return () => window.clearInterval(timer)
  }, [busy?.kind])

  const addAttachments = (next: Attachment[]) => {
    let truncated = false
    setAttachments((current) => {
      const seen = new Set(current.map((item) => pathKey(item.path)))
      const merged = [...current]
      for (const item of next) {
        const key = pathKey(item.path)
        if (seen.has(key) || item.name.toLowerCase() === RULE_FILE_NAME.toLowerCase()) continue
        seen.add(key)
        merged.push(item)
      }
      truncated = merged.length > MAX_ATTACHMENTS
      return merged.slice(0, MAX_ATTACHMENTS)
    })
    setErrorBanner(null)
    setViewTab('pending')
    if (truncated) setToast(t('一次最多整理 {max} 个文件，多出的部分没有加入', { max: MAX_ATTACHMENTS }))
  }

  const dropStateRef = useRef({ active, busy, addAttachments, setToast, t })
  dropStateRef.current = { active, busy, addAttachments, setToast, t }

  useEffect(() => {
    if (!live) return
    let disposed = false
    let unlisten: (() => void) | undefined
    void getCurrentWebview().onDragDropEvent((event) => {
      const { active: isActive, busy: currentBusy, addAttachments: push, setToast: notify, t: tr } = dropStateRef.current
      if (!isActive || currentBusy) { setDragging(false); return }
      if (event.payload.type === 'enter' || event.payload.type === 'over') {
        setDragging(true)
      } else if (event.payload.type === 'leave') {
        setDragging(false)
      } else if (event.payload.type === 'drop') {
        setDragging(false)
        if (!event.payload.paths.length) return
        void call<AgentEntryDto[]>('agent_inspect_paths', { paths: event.payload.paths })
          .then((entries) => {
            if (!entries.length) { notify(tr('拖入的对象暂不支持整理（例如规则文件或快捷方式）')); return }
            push(entries.map((entry) => ({ path: entry.path, name: entry.name, isDir: entry.is_dir, rootPath: entry.root_path })))
          })
          .catch((error) => notify(errorMessage(error, tr('读取拖入的文件失败'))))
      }
    }).then((stop) => { if (disposed) stop(); else unlisten = stop })
    return () => { disposed = true; unlisten?.() }
  }, [live])

  const addFiles = async () => {
    if (!live) { addAttachments(DEMO_ATTACHMENTS); return }
    try {
      const files = await pickFiles()
      if (!files.length) return
      addAttachments(files.map((path) => ({ path, name: baseName(path), isDir: false, rootPath: path })))
    } catch (error) { setToast(errorMessage(error, t('选择文件失败'))) }
  }

  const addFolders = async () => {
    if (!live) { addAttachments(DEMO_ATTACHMENTS); return }
    try {
      const folders = await pickFolders()
      if (!folders.length) return
      const entries = await call<AgentEntryDto[]>('agent_inspect_paths', { paths: folders })
      if (!entries.length) { setToast(t('所选文件夹中没有可整理的文件')); return }
      addAttachments(entries.map((entry) => ({ path: entry.path, name: entry.name, isDir: entry.is_dir, rootPath: entry.root_path })))
    } catch (error) { setToast(errorMessage(error, t('读取文件夹失败'))) }
  }

  const activeScopeIds = useMemo(() => {
    const validSet = new Set(availableLibraries.map((lib) => lib.id))
    return selectedLibraryIds.filter((id) => validSet.has(id))
  }, [availableLibraries, selectedLibraryIds])

  const startAnalysis = async () => {
    if (busy) return
    if (!attachments.length) {
      setToast(t('请先拖入或选择要整理的文件/文件夹'))
      return
    }
    if (!availableLibraries.length) {
      setErrorBanner({ message: t('当前没有可用的文件库，请先在「文件库」页面添加至少一个文件库。'), needsLibraries: true })
      return
    }
    const defaultInstruction = '按规则分类归档这些文件，自动清理广告前缀并规范文件夹与文件命名'
    const text = input.trim() || defaultInstruction
    const initialMsg = t('正在检查分类规则…')
    const scopedLibraries = activeScopeIds.length > 0
      ? availableLibraries.filter((lib) => activeScopeIds.includes(lib.id))
      : availableLibraries
    setErrorBanner(null)
    setProgress(initialMsg)
    setProgressSteps([initialMsg])
    setBusy({ kind: 'planning' })
    try {
      const plan = live
        ? await call<AgentPlanDto>('agent_create_plan', {
            paths: attachments.map((item) => item.path),
            instruction: text,
            includeSnippets: false,
            kind: 'classify',
            libraryIds: activeScopeIds,
          })
        : await new Promise<AgentPlanDto>((resolve) => window.setTimeout(() => resolve(mockPlan(attachments, text, 'classify', scopedLibraries)), 900))
      setActivePlan(plan)
      setCollapsedFolders({})
      setLogsOpen(false)
      setViewTab('plan')
    } catch (error) {
      const message = errorMessage(error, t('生成整理方案失败'))
      setErrorBanner({
        message,
        needsSettings: message.includes('设置') || message.includes('API') || message.includes('密钥'),
        needsLibraries: message.includes('文件库'),
      })
    } finally {
      setBusy(null)
      setProgress('')
      setProgressSteps([])
    }
  }

  const applyEdits = async (plan: AgentPlanDto, edits: AgentActionEdit[]) => {
    setBusy({ kind: 'updating', planId: plan.id })
    try {
      const updated = live ? await call<AgentPlanDto>('agent_update_plan', { planId: plan.id, edits }) : mockUpdate(plan, edits, libraries)
      setActivePlan(updated)
      return true
    } catch (error) { setToast(errorMessage(error, t('修改方案失败'))); return false }
    finally { setBusy(null) }
  }

  const editAction = (plan: AgentPlanDto, action: AgentActionDto, patch: EditPatch) => { void applyEdits(plan, [actionEdit(action, patch)]) }
  const openPathOnDisk = (targetPath: string) => {
    if (!targetPath) return
    if (!live) {
      setToast(targetPath)
      return
    }
    void call('open_path', { path: targetPath }).catch((error) => setToast(errorMessage(error, t('打开失败'))))
  }
  const toggleBatch = (plan: AgentPlanDto, targetActions: AgentActionDto[], selected: boolean) => {
    const edits = targetActions
      .filter((action) => action.state !== 'done' && (action.has_move || action.has_rename))
      .map((action) => actionEdit(action, { moveSelected: selected && action.has_move, renameSelected: selected && action.has_rename }))
      .filter((edit) => { const action = plan.actions.find((item) => item.id === edit.id); return Boolean(action && (action.move_selected !== edit.moveSelected || action.rename_selected !== edit.renameSelected)) })
    if (edits.length) void applyEdits(plan, edits)
  }
  const toggleAll = (plan: AgentPlanDto, selected: boolean) => {
    toggleBatch(plan, plan.actions, selected)
  }
  const renameFolderGroup = (plan: AgentPlanDto, targetActions: AgentActionDto[], libraryId: string, newFolderPath: string) => {
    const edits = targetActions
      .filter((action) => action.state !== 'done')
      .map((action) => actionEdit(action, {
        targetLibraryId: libraryId,
        targetFolder: newFolderPath,
        moveSelected: true,
      }))
    if (!edits.length) return Promise.resolve(false)
    return applyEdits(plan, edits)
  }
  const saveDraft = (plan: AgentPlanDto, action: AgentActionDto, draft: Draft) => {
    const targetChanged = draft.libraryId !== action.target_library_id || draft.folder !== action.target_folder
    const nameChanged = draft.newName !== action.new_name
    const moveSelected = Boolean(draft.libraryId) && (targetChanged ? true : action.move_selected)
    const renameSelected = Boolean(draft.newName) && (nameChanged ? true : action.rename_selected)
    return applyEdits(plan, [actionEdit(action, { targetLibraryId: draft.libraryId, targetFolder: draft.folder, newName: draft.newName, moveSelected, renameSelected })])
  }

  const updateRuleDraft = async (plan: AgentPlanDto, draft: AgentRuleDraftDto, selected: boolean, content: string) => {
    if (!live) { setActivePlan({ ...plan, rule_drafts: plan.rule_drafts.map((item) => item.id === draft.id ? { ...item, selected, content } : item) }); return true }
    setBusy({ kind: 'updating', planId: plan.id })
    try { setActivePlan(await call<AgentPlanDto>('agent_update_draft', { planId: plan.id, draftId: draft.id, selected, content })); return true }
    catch (error) { setToast(errorMessage(error, t('修改规则草稿失败'))); return false }
    finally { setBusy(null) }
  }

  const execute = async (plan: AgentPlanDto, keepDuplicateIds: string[] = []) => {
    const selectedCount = plan.actions.filter((action) => action.selected && action.state !== 'done' && !action.blocking).length
    setExecProgress({
      planId: plan.id,
      phase: 'executing',
      currentIndex: 1,
      totalItems: Math.max(1, selectedCount),
      currentName: t('正在准备执行…'),
      isCrossDrive: false,
      transferredBytes: 0,
      totalBytes: 0,
      elapsedMs: 0,
    })
    setBusy({ kind: 'executing', planId: plan.id })
    try {
      const next = live
        ? await call<AgentPlanDto>('agent_execute_plan', { planId: plan.id, mode, keepDuplicateIds })
        : mockExecute(plan, mode)
      setActivePlan(next)
      const doneKeys = new Set(next.actions.filter((action) => action.state === 'done').map((action) => pathKey(action.source_path)))
      if (doneKeys.size) {
        setAttachments((current) => current.filter((item) => !doneKeys.has(pathKey(item.path))))
      }
      const counts = planCounts(next)
      const writtenDrafts = next.rule_drafts.filter((draft) => draft.state === 'done').length
      setToast([
        counts.failed
          ? t('已完成 {done} 项，{failed} 项未完成', { done: counts.done, failed: counts.failed })
          : t('已完成 {done} 项整理', { done: counts.done }),
        writtenDrafts ? t('写入 {count} 份规则草稿', { count: writtenDrafts }) : '',
      ].filter(Boolean).join(', '))
      onExecuted()
    } catch (error) { setToast(errorMessage(error, t('执行失败'))) }
    finally {
      setBusy(null)
      setExecProgress(null)
    }
  }

  const requestExecute = (plan: AgentPlanDto) => {
    const conflicts = plan.actions.filter(
      (action) =>
        action.selected &&
        action.state !== 'done' &&
        (action.conflict_kind === 'duplicate' || action.conflict_kind === 'auto_numbered'),
    )
    if (conflicts.length > 0) {
      setConflictModalOpen(true)
      return
    }
    void execute(plan)
  }

  const confirmConflictModalAndExecute = async (
    plan: AgentPlanDto,
    resolutions: Record<string, ConflictItemDraft>,
  ) => {
    const edits: AgentActionEdit[] = []
    const keepDuplicateIds: string[] = []
    const conflicts = plan.actions.filter(
      (action) =>
        action.selected &&
        action.state !== 'done' &&
        (action.conflict_kind === 'duplicate' || action.conflict_kind === 'auto_numbered'),
    )

    for (const item of conflicts) {
      const res = resolutions[item.id]
      if (!res) continue
      if (res.strategy === 'skip') {
        edits.push(actionEdit(item, { moveSelected: false, renameSelected: false }))
      } else if (res.strategy === 'rename') {
        const trimmedName = res.customName.trim()
        if (item.conflict_kind === 'duplicate') {
          keepDuplicateIds.push(item.id)
        }
        const currentEffectiveName = item.new_name || item.source_name
        if (trimmedName && trimmedName !== currentEffectiveName) {
          edits.push(
            actionEdit(item, {
              newName: trimmedName,
              renameSelected: trimmedName !== item.source_name,
              moveSelected: item.has_move ? item.move_selected : false,
            }),
          )
        }
      }
    }

    setConflictModalOpen(false)
    let targetPlan = plan
    if (edits.length > 0) {
      setBusy({ kind: 'updating', planId: plan.id })
      try {
        targetPlan = live
          ? await call<AgentPlanDto>('agent_update_plan', { planId: plan.id, edits })
          : mockUpdate(plan, edits, libraries)
        setActivePlan(targetPlan)
      } catch (error) {
        setBusy(null)
        setToast(errorMessage(error, t('更新冲突文件名失败')))
        return
      }
      setBusy(null)
    }

    const stillExecutable = targetPlan.actions.filter((act) => act.selected && act.state !== 'done' && !act.blocking)
    if (stillExecutable.length === 0) {
      setToast(t('所有冲突项已设为跳过，当前没有需要执行的项目'))
      return
    }
    await execute(targetPlan, keepDuplicateIds)
  }

  const cleanDuplicates = async (plan: AgentPlanDto) => {
    const dupCount = plan.actions.filter((action) => action.conflict_kind === 'duplicate' && (action.state === 'pending' || action.state === 'failed')).length
    if (!dupCount) return
    if (!window.confirm(t('一键清理源位置重复 ({count} 项)', { count: dupCount }) + '?')) return
    setBusy({ kind: 'cleaning_duplicates', planId: plan.id })
    try {
      const next = live
        ? await call<AgentPlanDto>('agent_clean_duplicates', { planId: plan.id })
        : {
            ...plan,
            state: 'partially_executed',
            actions: plan.actions.map((action) =>
              action.conflict_kind === 'duplicate' && action.state === 'pending'
                ? { ...action, state: 'done', selected: false, error: '' }
                : action,
            ),
          }
      setActivePlan(next)
      const doneKeys = new Set(next.actions.filter((action) => action.state === 'done').map((action) => pathKey(action.source_path)))
      if (doneKeys.size) {
        setAttachments((current) => current.filter((item) => !doneKeys.has(pathKey(item.path))))
      }
      const cleanedNow = next.actions.filter((action) => action.conflict_kind === 'duplicate' && action.state === 'done').length
      setToast(t('已安全清理 {count} 项源位置真重复文件', { count: cleanedNow }))
      onExecuted()
    } catch (error) {
      setToast(errorMessage(error, t('清理真重复文件失败')))
    } finally {
      setBusy(null)
    }
  }

  const undo = async (planId: string) => {
    if (!window.confirm(t('确定撤销这次整理吗？已移动或改名的文件会回到原来的位置和名称。'))) return
    setBusy({ kind: 'undoing', planId })
    try {
      const next = live ? await call<AgentPlanDto>('agent_undo_plan', { planId }) : (activePlan ? mockUndo(activePlan) : null)
      if (next) setActivePlan(next)
      setToast(next?.state === 'undone' ? t('已撤销本次整理') : t('部分项目未能撤销，请查看表格状态'))
      onExecuted()
    } catch (error) { setToast(errorMessage(error, t('撤销失败'))) }
    finally { setBusy(null) }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing && attachments.length > 0 && !busy) {
      event.preventDefault()
      void startAnalysis()
    }
  }

  const attachmentTree = useMemo(() => buildAttachmentTree(attachments), [attachments])
  const planData = useMemo(() => activePlan ? buildPlanGroups(activePlan.actions, attachments) : { groups: [], rootFiles: [], allGroupKeys: [] }, [activePlan, attachments])

  const editable = Boolean(activePlan && (activePlan.state === 'draft' || activePlan.state === 'partially_executed'))
  const isBusy = Boolean(busy)
  const thisBusy = busy !== null && 'planId' in busy && activePlan && busy.planId === activePlan.id ? busy.kind : null
  const pendingActions = activePlan ? activePlan.actions.filter((action) => action.state !== 'done') : []
  const selectableActions = pendingActions.filter((action) => action.has_move || action.has_rename)
  const executableActions = pendingActions.filter((action) => action.selected && !action.blocking)
  const allSelected = selectableActions.length > 0 && selectableActions.every((action) => (!action.has_move || action.move_selected) && (!action.has_rename || action.rename_selected))
  const canUndo = Boolean(activePlan && ['executed', 'partially_executed', 'partially_undone'].includes(activePlan.state))
  const drafts = activePlan ? activePlan.rule_drafts.filter((draft) => editable || draft.state !== 'proposed') : []
  const aiLogs = activePlan?.ai_logs ?? []
  const totalElapsedMs = activePlan ? (activePlan.elapsed_ms ?? aiLogs.reduce((sum, item) => sum + (item.elapsed_ms || 0), 0)) : 0
  const totalTokens = useMemo(
    () => aiLogs.reduce((sum, item) => sum + (item.total_tokens || (item.input_tokens ?? 0) + (item.output_tokens ?? 0)), 0),
    [aiLogs],
  )
  const counts = activePlan ? planCounts(activePlan) : null
  const allFoldersCollapsed = planData.allGroupKeys.length > 0 && planData.allGroupKeys.every((key) => collapsedFolders[key])

  const showingPlan = Boolean(activePlan && viewTab === 'plan')

  return (
    <div className={`agent-page wb-mode ${dragging ? 'dragging' : ''}`}>
      {/* 顶部工具栏：分类范围选择 + 补充要求 + 开始分析 */}
      <header className="wb-toolbar">
        <div className="wb-toolbar-left">
          <ScopeSelectPopover
            libraries={availableLibraries}
            selectedIds={activeScopeIds}
            disabled={isBusy}
            onChange={setSelectedLibraryIds}
          />
        </div>

        <div className="wb-toolbar-center">
          <input
            ref={inputRef}
            type="text"
            className="wb-instruction-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={isBusy}
            placeholder={t('补充要求（可留空，默认按规则自动分类、清理广告前缀并重命名）')}
            aria-label={t('补充整理要求')}
          />
        </div>

        <div className="wb-toolbar-right">
          {(attachments.length > 0 || activePlan) && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isBusy}
              onClick={() => {
                setAttachments([])
                setActivePlan(null)
                setErrorBanner(null)
                setViewTab('pending')
              }}
            >
              <Trash2 size={14} />{t('清空重置')}
            </Button>
          )}
          {activePlan && attachments.length > 0 && (
            <div className="segmented wb-view-switch">
              <button
                type="button"
                className={viewTab === 'pending' ? 'active' : ''}
                onClick={() => setViewTab('pending')}
              >
                {t('待分析 ({count})', { count: attachments.length })}
              </button>
              <button
                type="button"
                className={viewTab === 'plan' ? 'active' : ''}
                onClick={() => setViewTab('plan')}
              >
                {t('分析结果 ({count})', { count: activePlan.actions.length })}
              </button>
            </div>
          )}
          <Button
            size="sm"
            onClick={() => void startAnalysis()}
            disabled={!attachments.length || isBusy}
          >
            {busy?.kind === 'planning' ? <LoaderCircle size={14} className="agent-spin" /> : <Sparkles size={14} />}
            {busy?.kind === 'planning'
              ? t('分析中 {sec}s', { sec: (planningElapsedMs / 1000).toFixed(1) })
              : activePlan && viewTab === 'plan'
                ? t('重新分析')
                : attachments.length
                  ? t('开始 AI 分析 ({count})', { count: attachments.length })
                  : t('开始 AI 分析')}
          </Button>
        </div>
      </header>

      {/* 拖拽提示横幅 */}
      {dragging && (
        <div className="wb-drop-overlay">
          <FolderInput size={22} />
          <strong>{t('松开鼠标，立即将文件或文件夹内的子文件加入待整理列表')}</strong>
        </div>
      )}

      {/* 主工作区 */}
      <div className="wb-body">
        {/* 实时分析进度条 */}
        {busy?.kind === 'planning' && (
          <div className="wb-planning-banner">
            <div className="wb-planning-main">
              <LoaderCircle size={16} className="agent-spin" />
              <strong>{progress ? t(progress) : t('正在分析 {count} 个文件…', { count: attachments.length })}</strong>
              <span className="agent-thinking-timer">
                <Clock size={12} />{t('已用时 {sec}s', { sec: (planningElapsedMs / 1000).toFixed(1) })}
              </span>
            </div>
            {progressSteps.length > 1 && (
              <div className="wb-planning-steps">
                {progressSteps.slice(0, -1).map((step, idx) => (
                  <span key={`${idx}-${step}`} className="wb-planning-step-done">
                    <Check size={12} />{t(step)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 实时文件执行/跨盘搬运进度横幅 */}
        {thisBusy === 'executing' && execProgress && (() => {
          const pct = execProgress.totalBytes > 0
            ? Math.min(100, Math.round((execProgress.transferredBytes / execProgress.totalBytes) * 100))
            : Math.min(100, Math.round((execProgress.currentIndex / Math.max(1, execProgress.totalItems)) * 100))
          const speedBps = execProgress.elapsedMs >= 200 && execProgress.transferredBytes > 0
            ? (execProgress.transferredBytes * 1000) / execProgress.elapsedMs
            : 0
          return (
            <div className="wb-exec-progress-banner">
              <div className="wb-exec-progress-head">
                <div className="wb-exec-progress-left">
                  <LoaderCircle size={15} className="agent-spin" />
                  <strong>
                    {mode === 'move'
                      ? t('正在移动文件 ({cur} / {total} 项 · {pct}%)', { cur: execProgress.currentIndex, total: execProgress.totalItems, pct })
                      : t('正在复制文件 ({cur} / {total} 项 · {pct}%)', { cur: execProgress.currentIndex, total: execProgress.totalItems, pct })}
                  </strong>
                  {execProgress.isCrossDrive && (
                    <span className="wb-exec-cross-badge">{t('跨盘高速搬运中')}</span>
                  )}
                  <span className="wb-exec-current-file" title={execProgress.currentName}>
                    {t('当前：{name}', { name: execProgress.currentName })}
                  </span>
                </div>
                <div className="wb-exec-progress-right">
                  {execProgress.totalBytes > 0 && (
                    <span>
                      {formatBytes(execProgress.transferredBytes)} / {formatBytes(execProgress.totalBytes)}
                    </span>
                  )}
                  {speedBps > 0 && (
                    <span className="wb-exec-speed">{formatBytes(speedBps)}/s</span>
                  )}
                  <span>{t('已用时 {sec}s', { sec: (execProgress.elapsedMs / 1000).toFixed(1) })}</span>
                </div>
              </div>
              <div className="wb-exec-progress-track">
                <div className="wb-exec-progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })()}

        {/* 错误提示横幅 */}
        {errorBanner && (
          <div className="wb-error-banner">
            <CircleAlert size={16} />
            <span>{errorBanner.message}</span>
            <div className="wb-error-actions">
              {errorBanner.needsSettings && <Button variant="outline" size="sm" onClick={onOpenSettings}><Settings size={13} />{t('前往设置')}</Button>}
              {errorBanner.needsLibraries && <Button variant="outline" size="sm" onClick={onOpenLibraries}><Folder size={13} />{t('前往文件库')}</Button>}
              <Button variant="ghost" size="sm" onClick={() => setErrorBanner(null)}><X size={13} /></Button>
            </div>
          </div>
        )}

        {/* 视图 A：AI 分析结果确认表（移动前 vs 移动后对比表格） */}
        {showingPlan && activePlan ? (
          <section className="wb-plan-card" aria-label={t('整理结果确认表')}>
            {/* 结果顶部摘要栏 */}
            <div className="wb-plan-topbar">
              <div className="wb-plan-topbar-left">
                <PlanStateBadge state={activePlan.state} />
                <span className="wb-plan-stat">
                  {t('共')} <strong>{activePlan.actions.length}</strong> {t('项')}
                  {counts ? ` ${t('· 移动 {moves} 项 · 改名 {renames} 项', { moves: counts.moves, renames: counts.renames })}` : ''}
                </span>
                {counts && counts.duplicates > 0 && (
                  <span className="wb-stat-chip dup">{t('真重复 {count} 项', { count: counts.duplicates })}</span>
                )}
                {counts && counts.autoNumbered > 0 && (
                  <span className="wb-stat-chip autonum">{t('撞名自动编号 {count} 项', { count: counts.autoNumbered })}</span>
                )}
                {activePlan.reply && <span className="wb-plan-reply">{activePlan.reply}</span>}
              </div>

              <div className="wb-plan-topbar-right">
                {planData.allGroupKeys.length > 0 && (
                  <button
                    type="button"
                    className="agent-link"
                    onClick={() => {
                      if (allFoldersCollapsed) {
                        setCollapsedFolders({})
                      } else {
                        setCollapsedFolders(Object.fromEntries(planData.allGroupKeys.map((key) => [key, true])))
                      }
                    }}
                  >
                    {allFoldersCollapsed ? t('展开全部目录') : t('收起全部目录')}
                  </button>
                )}
                {(aiLogs.length > 0 || totalElapsedMs > 0) && (
                  <button
                    type="button"
                    className={`agent-log-chip ${logsOpen ? 'active' : ''}`}
                    onClick={() => setLogsOpen((current) => !current)}
                    aria-expanded={logsOpen}
                  >
                    <Terminal size={12} />
                    <span>
                      {t('AI 日志 ({rounds}轮 · {duration}{tokens})', {
                        rounds: aiLogs.length || 1,
                        duration: formatDuration(totalElapsedMs),
                        tokens: totalTokens > 0 ? ` · ${totalTokens.toLocaleString()} tokens` : '',
                      })}
                    </span>
                    <ChevronRight size={12} className="agent-logs-chevron" />
                  </button>
                )}
              </div>
            </div>

            {/* 可展开的 AI 原始请求/响应日志面板 */}
            {logsOpen && <AiLogsBody logs={aiLogs} />}

            {/* 移动前 vs 移动后 双栏对比表头 */}
            <div className="wb-table-head" role="row">
              <div className="wb-col-check">
                {editable && selectableActions.length > 0 && (
                  <Checkbox
                    checked={allSelected}
                    disabled={isBusy}
                    onChange={(val) => toggleAll(activePlan, val)}
                    aria-label={t('全选所有项')}
                  />
                )}
              </div>
              <div className="wb-col-before">{t('整理前（原文件夹层级 / 原文件名）')}</div>
              <div className="wb-col-arrow" />
              <div className="wb-col-after">{t('整理后（目标文件库 / 新文件夹 / 新文件名）')}</div>
              <div className="wb-col-ops">{t('操作')}</div>
            </div>

            {/* 移动前 vs 移动后 对比表内容 */}
            <div className="wb-table-body" role="table">
              {planData.groups.map((group) => (
                <CompareFolderGroup
                  key={group.key}
                  group={group}
                  isOpen={!collapsedFolders[group.key]}
                  onToggleExpand={() => setCollapsedFolders((cur) => ({ ...cur, [group.key]: !cur[group.key] }))}
                  libraries={libraries}
                  editable={editable}
                  busy={isBusy}
                  editing={editing}
                  setEditing={setEditing}
                  onEdit={(item, patch) => editAction(activePlan, item, patch)}
                  onToggleBatch={(items, selected) => toggleBatch(activePlan, items, selected)}
                  onRenameFolderGroup={(items, libId, newFolder) => renameFolderGroup(activePlan, items, libId, newFolder)}
                  onOpenPath={openPathOnDisk}
                  onSave={(item, draft) => saveDraft(activePlan, item, draft)}
                />
              ))}
              {planData.rootFiles.map((action) => (
                <CompareFileRow
                  key={action.id}
                  action={action}
                  libraries={libraries}
                  editable={editable}
                  busy={isBusy}
                  editing={editing === action.id}
                  setEditing={setEditing}
                  onEdit={(item, patch) => editAction(activePlan, item, patch)}
                  onOpenPath={openPathOnDisk}
                  onSave={(item, draft) => saveDraft(activePlan, item, draft)}
                />
              ))}
            </div>

            {drafts.length > 0 && (
              <div className="agent-drafts">
                <div className="agent-drafts-head"><FileText size={14} /><strong>{t('新文件夹规则草稿')}</strong></div>
                {drafts.map((draft) => (
                  <RuleDraftItem
                    key={draft.id}
                    draft={draft}
                    editable={editable}
                    busy={isBusy}
                    onUpdate={(item, selected, content) => updateRuleDraft(activePlan, item, selected, content)}
                  />
                ))}
              </div>
            )}

            {/* 底部执行确认栏（常驻显示） */}
            <footer className="wb-plan-footer">
              <div className="wb-footer-left">
                {editable && (
                  <div className="agent-mode">
                    <span>{t('执行方式')}</span>
                    <div className="segmented">
                      <button type="button" className={mode === 'move' ? 'active' : ''} disabled={isBusy} onClick={() => setMode('move')}>
                        <Move size={13} />{t('移动（清理原文件）')}
                      </button>
                      <button type="button" className={mode === 'copy' ? 'active' : ''} disabled={isBusy} onClick={() => setMode('copy')}>
                        <Copy size={13} />{t('复制（保留原文件）')}
                      </button>
                    </div>
                  </div>
                )}
                <span className="wb-footer-hint">
                  {editable
                    ? executableActions.length > 0
                      ? t('已勾选 {count} 项待执行', { count: executableActions.length })
                      : t('当前没有勾选可执行的变更项（可点击右侧铅笔图标手动指定目标文件夹或新名称）')
                    : t('当前状态：{state}', {
                        state: activePlan.state === 'executed' ? t('已全部执行完成') : activePlan.state === 'undone' ? t('已撤销还原') : activePlan.state,
                      })}
                </span>
              </div>

              <div className="wb-footer-right">
                {canUndo && (
                  <Button variant="outline" size="sm" disabled={isBusy} onClick={() => void undo(activePlan.id)}>
                    {thisBusy === 'undoing' ? <LoaderCircle size={14} className="agent-spin" /> : <Undo2 size={14} />}
                    {t('撤销本次整理')}
                  </Button>
                )}
                {editable && counts && counts.pendingDuplicates > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void cleanDuplicates(activePlan)}
                    title={t('校验 SHA-256 内容完全一致后，直接清理源位置的重复文件（支持撤销还原）')}
                  >
                    {thisBusy === 'cleaning_duplicates' ? <LoaderCircle size={14} className="agent-spin" /> : <Trash2 size={14} />}
                    {thisBusy === 'cleaning_duplicates' ? t('正在清理重复…') : t('一键清理源位置重复 ({count} 项)', { count: counts.pendingDuplicates })}
                  </Button>
                )}
                {editable && (
                  <Button
                    size="sm"
                    disabled={!executableActions.length || isBusy}
                    onClick={() => requestExecute(activePlan)}
                  >
                    {thisBusy === 'executing' ? <LoaderCircle size={14} className="agent-spin" /> : <Check size={14} />}
                    {thisBusy === 'executing'
                      ? execProgress
                        ? t('正在执行 {cur}/{total}…', { cur: execProgress.currentIndex, total: execProgress.totalItems })
                        : t('正在执行…')
                      : t('确认执行 ({count} 项)', { count: executableActions.length })}
                  </Button>
                )}
              </div>
            </footer>
          </section>
        ) : attachments.length > 0 ? (
          /* 视图 B：已添加文件/文件夹（分析前树状目录预览） */
          <section className="wb-pending-card" aria-label={t('待整理文件列表')}>
            <header className="wb-pending-head">
              <div className="wb-pending-head-left">
                <Folder size={16} />
                <strong>{t('待整理文件列表（共 {count} 个文件）', { count: attachments.length })}</strong>
                <span>{t('已自动展开文件夹内部的所有子文件，点击右上角「开始 AI 分析」生成移动与改名方案')}</span>
              </div>
              <div className="wb-pending-head-right">
                <Button variant="outline" size="sm" onClick={() => void addFiles()} disabled={isBusy}>
                  <Paperclip size={13} />{t('继续加文件')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void addFolders()} disabled={isBusy}>
                  <Folder size={13} />{t('继续加文件夹')}
                </Button>
                <Button size="sm" onClick={() => void startAnalysis()} disabled={isBusy}>
                  <Sparkles size={14} />{t('开始 AI 分析 ({count} 项)', { count: attachments.length })}
                </Button>
              </div>
            </header>
            <div className="wb-pending-tree">
              <AttachmentTreeBranch
                nodes={attachmentTree}
                onOpenPath={openPathOnDisk}
                onRemovePaths={(pathsToRemove) => {
                  const removeSet = new Set(pathsToRemove.map(pathKey))
                  setAttachments((current) => current.filter((candidate) => !removeSet.has(pathKey(candidate.path))))
                }}
              />
            </div>
          </section>
        ) : (
          /* 视图 C：初始空状态（大号拖拽区） */
          <div className="wb-empty-state">
            <div className="wb-drop-zone">
              <div className="wb-drop-icon">
                <FolderInput size={30} />
              </div>
              <h2>{t('拖入文件或文件夹开始整理')}</h2>
              <p>{t('支持直接拖入整个剧集、项目或下载文件夹，将自动扫描文件夹内的全部子文件进行分类归档、清理多余嵌套目录与批量重命名')}</p>
              <div className="wb-drop-buttons">
                <Button variant="outline" onClick={() => void addFiles()} disabled={isBusy}>
                  <Paperclip size={15} />{t('选择文件')}
                </Button>
                <Button onClick={() => void addFolders()} disabled={isBusy}>
                  <Folder size={15} />{t('选择文件夹')}
                </Button>
              </div>
              {activePlan && (
                <button type="button" className="wb-reopen-plan" onClick={() => setViewTab('plan')}>
                  <RotateCcw size={13} />{t('查看刚才的分析结果（{count} 项）', { count: activePlan.actions.length })}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 点击「确认执行」时的文件冲突确认与改名弹窗 */}
      {conflictModalOpen && activePlan && (
        <ConflictConfirmModal
          conflicts={activePlan.actions.filter(
            (action) =>
              action.selected &&
              action.state !== 'done' &&
              (action.conflict_kind === 'duplicate' || action.conflict_kind === 'auto_numbered'),
          )}
          mode={mode}
          busy={isBusy}
          onOpenPath={openPathOnDisk}
          onCancel={() => setConflictModalOpen(false)}
          onConfirm={(resolutions) => void confirmConflictModalAndExecute(activePlan, resolutions)}
        />
      )}
    </div>
  )
}
