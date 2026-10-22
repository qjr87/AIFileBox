import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { call, folderTreeToUi, isTauri, pickFiles, pickFolder, revealPath, type AiSettingsDto, type FolderNodeDto, type ItemDto, type LibraryDto, type OperationDto, type UiFolderNode } from './backend'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, TextInput } from './components/watermelon-ui'
import { TreeSelect, type TreeSelectNode } from './components/tree-select'
import { FolderTree as SharedFolderTree, type FolderTreeNode } from './components/folder-tree'

type IconName =
  | 'archive'
  | 'inbox'
  | 'folder'
  | 'history'
  | 'settings'
  | 'plus'
  | 'search'
  | 'filter'
  | 'pause'
  | 'play'
  | 'check'
  | 'chevron'
  | 'file'
  | 'image'
  | 'spark'
  | 'arrow'
  | 'shield'
  | 'copy'
  | 'move'
  | 'upload'
  | 'info'
  | 'more'
  | 'refresh'
  | 'sliders'
  | 'external'
  | 'close'

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  const paths: Record<IconName, ReactNode> = {
    archive: <><path d="M4 7.5h16" /><path d="M5.5 7.5 6.5 19h11l1-11.5" /><path d="M3.5 4.5h17v3h-17z" /><path d="M9 11.5h6" /></>,
    inbox: <><path d="M4 5.5h16v13H4z" /><path d="m4 14 4 0 1.5 2h5L16 14h4" /></>,
    folder: <><path d="M3.5 6.5h6l1.7 2H20.5v9.2a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8z" /><path d="M3.5 9h17" /></>,
    history: <><path d="M4.5 5.5v4h4" /><path d="M5 9a7.5 7.5 0 1 1-.2 5" /><path d="M12 8.2v4l2.6 1.5" /></>,
    settings: <><path d="M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z" /><path d="m19.4 13.5 1.1.8-1.5 2.6-1.3-.5a7.8 7.8 0 0 1-1.8 1l-.2 1.4h-3l-.2-1.4a7.8 7.8 0 0 1-1.8-1l-1.3.5-1.5-2.6 1.1-.8a7.3 7.3 0 0 1 0-2.8l-1.1-.8 1.5-2.6 1.3.5a7.8 7.8 0 0 1 1.8-1l.2-1.4h3l.2 1.4a7.8 7.8 0 0 1 1.8 1l1.3-.5 1.5 2.6-1.1.8a7.3 7.3 0 0 1 0 2.8Z" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.2" /><path d="m16 16 4 4" /></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    play: <path d="m8 5 11 7-11 7z" />,
    check: <path d="m5 12 4.2 4.2L19 6.5" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    file: <><path d="M6 3.5h8l4 4V20H6z" /><path d="M14 3.5V8h4" /><path d="M9 12h6M9 15.5h4" /></>,
    image: <><rect x="4" y="4" width="16" height="16" rx="2" /><circle cx="9" cy="9" r="1.2" /><path d="m5 17 4.5-4.5 3.2 3.2 2-2 4.3 4.3" /></>,
    spark: <><path d="m12 3 1.3 5.7L19 10l-5.7 1.3L12 17l-1.3-5.7L5 10l5.7-1.3z" /><path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6z" /></>,
    arrow: <><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>,
    shield: <><path d="M12 3.5 19 6v5.2c0 4.4-2.8 7.8-7 9.3-4.2-1.5-7-4.9-7-9.3V6z" /><path d="m9 12 2 2 4-4" /></>,
    copy: <><rect x="8" y="8" width="11" height="12" rx="1.5" /><path d="M5 16V5.5A1.5 1.5 0 0 1 6.5 4H16" /></>,
    move: <><path d="M5 12h14M15 8l4 4-4 4M9 8l-4 4 4 4" /></>,
    upload: <><path d="M12 16V4M8 8l4-4 4 4" /><path d="M5 14v4h14v-4" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 10.5v5M12 7.5h.01" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-3L4 10" /><path d="M4 5v5h5" /><path d="M4 13a8 8 0 0 0 14.8 3L20 14" /><path d="M20 19v-5h-5" /></>,
    sliders: <><path d="M4 6h8M16 6h4M4 12h3M11 12h9M4 18h9M17 18h3" /><circle cx="14" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="15" cy="18" r="2" /></>,
    external: <><path d="M14 5h5v5" /><path d="m19 5-8 8" /><path d="M18 13v5.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H11" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  }
  return <svg {...common}>{paths[name]}</svg>
}

type ItemStatus = 'queued' | 'ready' | 'review' | 'unmatched' | 'archived' | 'analyzing' | 'failed'
type ItemType = 'folder' | 'document' | 'image' | 'archive'
type View = 'queue' | 'libraries' | 'history' | 'settings'
type Filter = 'all' | 'review' | 'ready' | 'archived'

type ArchiveItem = {
  id: string
  name: string
  path: string
  type: ItemType
  mode: '整体归档' | '单个文件' | '展开分类'
  size: string
  modified: string
  recommendation: string
  recommendationPath?: string
  confidence: string
  status: ItemStatus
  source?: string
  reason: string
  detail: string
  members?: string
}

type UiLibrary = {
  id: string
  name: string
  count: number
  color: string
  status: string
  profile: string
  rootPath?: string
  purpose?: string
  folderDepth: number
  folders: FolderNode[]
}

type ImportProgress = {
  stage: string
  value: number
}

const demoLibraries = [
  {
    name: '项目资料', count: 248, color: 'mint', status: '可用', profile: '说明已发布', folders: [
      { name: '2025', count: 122, children: [{ name: 'Q3 品牌更新', count: 42, children: [{ name: '01 需求', count: 8 }, { name: '02 设计稿', count: 19 }, { name: '03 交付', count: 15 }] }, { name: '运营素材', count: 31 }] },
      { name: '2024', count: 86, children: [{ name: '网站改版', count: 54 }, { name: '年度复盘', count: 32 }] },
      { name: '待归档', count: 40 },
    ],
  },
  {
    name: '个人学习', count: 86, color: 'blue', status: '可用', profile: '说明已发布', folders: [
      { name: '产品设计', count: 48, children: [{ name: '交互', count: 21 }, { name: '视觉', count: 17 }, { name: '研究方法', count: 10 }] },
      { name: '编程', count: 25, children: [{ name: 'Rust', count: 11 }, { name: '前端', count: 14 }] },
      { name: '待读', count: 13 },
    ],
  },
  {
    name: '发票与收据', count: 132, color: 'amber', status: '可用', profile: '说明已发布', folders: [
      { name: '2025', count: 132, children: [{ name: '08 月', count: 18 }, { name: '07 月', count: 27 }, { name: '06 月', count: 22 }, { name: '01-05 月', count: 65 }] },
    ],
  },
  {
    name: '灵感收藏', count: 57, color: 'plum', status: '可用', profile: '需要更新', folders: [
      { name: 'UI 参考', count: 34, children: [{ name: '导航', count: 12 }, { name: '表格', count: 9 }, { name: '空状态', count: 13 }] },
      { name: '配色与字体', count: 23 },
    ],
  },
]

type FolderNode = UiFolderNode

function folderNodesToTreeNodes(nodes: FolderNode[], parent = ''): FolderTreeNode[] {
  return nodes.map((node) => {
    const path = (node.path || (parent ? `${parent}/${node.name}` : node.name)).replace(/\\/g, '/')
    return { value: path, label: node.name, path, kind: 'folder', count: node.count, children: node.children?.length ? folderNodesToTreeNodes(node.children, path) : undefined }
  })
}

function libraryColor(index: number) {
  return ['mint', 'blue', 'amber', 'plum'][index % 4]
}

function toUiLibrary(library: LibraryDto, index = 0): UiLibrary {
  return { id: library.id, name: library.name, count: library.file_count, color: libraryColor(index), status: library.availability === 'available' ? '可用' : '不可用', profile: library.profile_status === 'published' ? '说明已发布' : '需要完善', rootPath: library.root_path, purpose: library.purpose, folderDepth: library.folder_depth, folders: [] }
}

function limitFolderDepth(nodes: FolderNode[], folderDepth: number, depth = 1): FolderNode[] {
  if (folderDepth <= 0) return nodes
  return nodes.map((node) => ({ ...node, children: depth < folderDepth ? limitFolderDepth(node.children ?? [], folderDepth, depth + 1) : [] }))
}

const fallbackLibraries: UiLibrary[] = demoLibraries.map((library, index) => ({ ...library, id: `demo-${index}`, folderDepth: 0, folders: library.folders as FolderNode[] }))

function itemTypeFromDto(item: ItemDto): ItemType {
  if (item.source_type === 'folder') return 'folder'
  if (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(item.name)) return 'image'
  if (/\.(zip|rar|7z|tar|gz)$/i.test(item.name)) return 'archive'
  return 'document'
}

function displayPath(path: string) {
  const pieces = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return pieces.length > 3 ? `${pieces.slice(-3, -1).join(' / ')} / ${pieces[pieces.length - 1]}` : pieces.join(' / ')
}

function toUiItem(item: ItemDto): ArchiveItem {
  const mode = item.mode === 'whole_folder' ? '整体归档' : item.mode === 'single_file' ? '单个文件' : '展开分类'
  return { id: item.id, name: item.name, path: displayPath(item.path), type: itemTypeFromDto(item), mode, size: item.size, modified: item.modified ? new Date(Number(item.modified) * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '未知', recommendation: item.recommendation || '暂不归档', recommendationPath: item.recommendation_folder_path || undefined, confidence: item.confidence || '等待分析', status: item.status as ItemStatus, reason: item.reason || '尚未开始分析。', detail: item.detail || '分析完成后会显示归档说明。', members: item.members ?? undefined, source: item.path }
}

function recommendationLabel(item: Pick<ArchiveItem, 'recommendation' | 'recommendationPath'>) {
  return item.recommendationPath ? `${item.recommendation} / ${item.recommendationPath.replace(/\\/g, '/')}` : item.recommendation
}

const initialItems: ArchiveItem[] = [
  {
    id: 'brand-kit', name: 'Q3 品牌更新', path: '下载 / Q3 品牌更新', type: 'folder', mode: '整体归档', size: '1.8 GB', modified: '今天 09:42', recommendation: '项目资料', confidence: '高匹配', status: 'ready', members: '42 个文件 · 6 个子文件夹',
    reason: '目录中的需求、设计稿和交付文件围绕同一个品牌项目组织，适合保持原目录结构整体归档。', detail: '将保留文件夹内部结构，目标为“项目资料 / Q3 品牌更新”。',
  },
  {
    id: 'contract', name: '供应商合作协议.pdf', path: '桌面 / 待整理', type: 'document', mode: '单个文件', size: '2.4 MB', modified: '昨天 18:16', recommendation: '项目资料', confidence: '需要确认', status: 'review', source: '客户项目 / 供应商资料',
    reason: '文件名表明它与供应商合作有关，但当前没有足够信息确认所属项目。', detail: '建议查看摘要并确认它是否属于当前的项目资料库。',
  },
  {
    id: 'receipts', name: '2025-08 报销票据', path: '下载 / 2025-08 报销票据', type: 'archive', mode: '整体归档', size: '86 MB', modified: '昨天 14:08', recommendation: '发票与收据', confidence: '高匹配', status: 'ready', members: '18 个文件',
    reason: '文件夹名称和内容类型都与已发布的“发票与收据”说明一致。', detail: '会作为一个文件夹归档，不会把票据散落到文件库根目录。',
  },
  {
    id: 'reading-list', name: '产品设计阅读清单.md', path: '文稿 / 稍后整理', type: 'document', mode: '单个文件', size: '18 KB', modified: '周一 11:24', recommendation: '个人学习', confidence: '高匹配', status: 'ready', source: '文稿 / 稍后整理',
    reason: '内容是产品设计资料索引，符合个人学习库的用途说明。', detail: '文件会被复制到“个人学习”库根目录，原文件会保留。',
  },
  {
    id: 'moodboard', name: 'moodboard-01.png', path: '桌面 / 临时素材', type: 'image', mode: '单个文件', size: '4.2 MB', modified: '周日 20:03', recommendation: '灵感收藏', confidence: '需要确认', status: 'review', source: '桌面 / 临时素材',
    reason: '图片内容无法提取，当前推荐主要依据文件名和所在目录。', detail: '可以手动改选目标，或跳过这项，之后再处理。',
  },
]

function LibraryMark({ color }: { color: string }) {
  return <span className={`library-mark ${color}`} aria-hidden="true" />
}

function ObjectIcon({ type }: { type: ItemType }) {
  const icon = type === 'folder' ? 'folder' : type === 'image' ? 'image' : type === 'archive' ? 'archive' : 'file'
  return <span className={`object-icon object-${type}`}><Icon name={icon} size={17} /></span>
}

function SidebarLibraryTree({
  libraries,
  onDoubleClick,
  onOpen,
}: {
  libraries: UiLibrary[]
  onDoubleClick: (libraryId: string) => void
  onOpen: (library: UiLibrary) => void
}) {
  const nodes: FolderTreeNode[] = libraries.map((library) => ({ value: library.id, label: library.name, kind: 'library', color: library.color, count: library.count, children: folderNodesToTreeNodes(library.folders, library.id) }))
  return <SharedFolderTree nodes={nodes} className="library-list sidebar-library-tree" nodeClassName="sidebar-library-node" empty={<span className="sidebar-tree-empty">还没有文件库</span>} onNodeDoubleClick={(node) => node.kind === 'library' && onDoubleClick(node.value)} renderRow={({ node, depth, isExpanded, hasChildren }) => {
    const library = node.kind === 'library' ? libraries.find((candidate) => candidate.id === node.value) : undefined
    if (node.kind === 'library' && library) return <button className="library-item" onClick={() => onOpen(library)} aria-expanded={hasChildren ? isExpanded : undefined}>
      <span className={`sidebar-tree-chevron ${isExpanded ? 'open' : ''}`}>{<Icon name="chevron" size={11} />}</span>
      <LibraryMark color={library.color} /><span>{library.name}</span><small>{library.count}</small>
    </button>
    return <button className="sidebar-tree-row" style={{ paddingLeft: `${26 + depth * 14}px` }} aria-expanded={hasChildren ? isExpanded : undefined}>
      <span className={`sidebar-tree-chevron ${isExpanded ? 'open' : ''}`}>{hasChildren ? <Icon name="chevron" size={11} /> : <span />}</span>
      <span className="sidebar-tree-folder"><Icon name="folder" size={13} /></span>
      <span>{node.label}</span><small>{node.count}</small>
    </button>
  }} />
}

function targetTreeNodes(libraries: UiLibrary[]): TreeSelectNode[] {
  const folderNodes = (library: UiLibrary, nodes: FolderNode[], parent = ''): TreeSelectNode[] => nodes.map((node) => {
    const path = (node.path || (parent ? `${parent}/${node.name}` : node.name)).replace(/\\/g, '/')
    return {
      value: JSON.stringify({ libraryName: library.name, folderPath: path }),
      label: node.name,
      searchText: `${library.name} / ${path}`,
      kind: 'folder',
      children: node.children?.length ? folderNodes(library, node.children, path) : undefined,
    }
  })
  return [
    { value: 'none', label: '暂不归档', kind: 'none' },
    ...libraries.map((library) => ({
      value: JSON.stringify({ libraryName: library.name, folderPath: '' }),
      label: library.name,
      kind: 'library' as const,
      color: library.color,
      children: folderNodes(library, library.folders),
    })),
  ]
}

function StatusPill({ status, confidence }: { status: ItemStatus; confidence?: string }) {
  if (status === 'archived') return <Badge><span className="status-dot" />已归档</Badge>
  if (status === 'analyzing') return <Badge variant="outline"><span className="status-dot pulse" />分析中</Badge>
  if (status === 'failed') return <Badge variant="danger"><span className="status-dot" />分析失败</Badge>
  if (status === 'unmatched') return <Badge variant="neutral"><span className="status-dot" />未匹配</Badge>
  if (status === 'queued') return <Badge variant="neutral"><span className="status-dot" />待分析</Badge>
  if (status === 'review' || confidence === '需要确认') return <Badge variant="warning"><span className="status-dot" />需要确认</Badge>
  return <Badge><span className="status-dot" />已推荐</Badge>
}

function App() {
  const [view, setView] = useState<View>('queue')
  const [items, setItems] = useState<ArchiveItem[]>(() => isTauri() ? [] : initialItems)
  const [libraryState, setLibraryState] = useState<UiLibrary[]>(() => isTauri() ? [] : fallbackLibraries)
  const [operations, setOperations] = useState<OperationDto[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>(() => isTauri() ? [] : ['brand-kit', 'contract'])
  const [activeId, setActiveId] = useState(() => isTauri() ? '' : 'brand-kit')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'copy' | 'move'>(() => { try { return JSON.parse(window.localStorage.getItem('archive-desk-settings') || '{}').defaultMode === 'move' ? 'move' : 'copy' } catch { return 'copy' } })
  const [importOpen, setImportOpen] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [toast, setToast] = useState('')
  const [mobileDetails, setMobileDetails] = useState(false)
  const [loadedLibraryTreeDepths, setLoadedLibraryTreeDepths] = useState<Record<string, number>>({})

  const liveMode = isTauri()

  const refreshLiveData = async () => {
    if (!liveMode) return
    try {
      const [rawLibraries, rawItems, rawOperations] = await Promise.all([
        call<LibraryDto[]>('list_libraries'),
        call<ItemDto[]>('list_items', { status: null }),
        call<OperationDto[]>('list_operations'),
      ])
      const nextLibraries = rawLibraries.map((library, index) => {
        const previous = libraryState.find((candidate) => candidate.id === library.id)
        return { ...toUiLibrary(library, index), folders: previous?.folderDepth === library.folder_depth ? previous.folders : [] }
      })
      setLibraryState(nextLibraries)
      setItems(rawItems.map(toUiItem))
      setOperations(rawOperations)
      if (rawItems.length) {
        setActiveId((current) => rawItems.some((item) => item.id === current) ? current : rawItems[0].id)
        setSelectedIds((current) => current.filter((id) => rawItems.some((item) => item.id === id)))
      } else { setActiveId(''); setSelectedIds([]) }
    } catch (error) {
      setToast(error instanceof Error ? error.message : '读取本地数据失败')
    }
  }

  useEffect(() => { void refreshLiveData() }, [liveMode])

  const activeItem = items.find((item) => item.id === activeId) ?? items[0] ?? { id: '', name: '暂无待分类对象', path: '请先添加文件或文件夹', type: 'document' as ItemType, mode: '单个文件' as const, size: '—', modified: '—', recommendation: '暂不归档', confidence: '等待分析', status: 'queued' as ItemStatus, reason: '添加文件或文件夹后，这里会显示本地分析结果。', detail: '你可以使用右上角“添加”选择要整理的对象。' }
  const visibleItems = useMemo(() => items.filter((item) => {
    const matchesQuery = `${item.name} ${item.path} ${recommendationLabel(item)}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === 'all' || (filter === 'review' && item.status === 'review') || (filter === 'ready' && item.status === 'ready') || (filter === 'archived' && item.status === 'archived')
    return matchesQuery && matchesFilter
  }), [filter, items, query])
  const selectedCount = selectedIds.length
  const approvedCount = items.filter((item) => item.status === 'archived').length
  const reviewedCount = items.filter((item) => item.status === 'ready' || item.status === 'archived').length

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id])
  }

  const toggleAll = () => {
    const ids = visibleItems.map((item) => item.id)
    const allSelected = ids.every((id) => selectedIds.includes(id))
    setSelectedIds((current) => allSelected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids])))
  }

  const updateItem = async (id: string, patch: Partial<ArchiveItem>) => {
    if (liveMode && (Object.prototype.hasOwnProperty.call(patch, 'recommendation') || Object.prototype.hasOwnProperty.call(patch, 'recommendationPath'))) {
      const current = items.find((item) => item.id === id)
      const targetName = patch.recommendation ?? current?.recommendation
      const target = libraryState.find((library) => library.name === targetName)
      try {
        const folderPath = patch.recommendationPath ?? current?.recommendationPath ?? ''
        const updated = await call<ItemDto>('update_item_recommendation', { itemId: id, libraryId: target?.id ?? null, folderPath: target ? folderPath || null : null })
        setItems((current) => current.map((item) => item.id === id ? toUiItem(updated) : item))
      } catch (error) { setToast(error instanceof Error ? error.message : '更新推荐失败') }
      return
    }
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  const confirmItem = async (id: string) => {
    if (liveMode) {
      const current = items.find((item) => item.id === id)
      const target = libraryState.find((library) => library.name === current?.recommendation)
      if (!target) { setToast('请先选择一个有效的目标文件库'); return }
      if (target) {
        try {
          const updated = await call<ItemDto>('update_item_recommendation', { itemId: id, libraryId: target.id, folderPath: current?.recommendationPath || null })
          setItems((all) => all.map((item) => item.id === id ? toUiItem(updated) : item))
        } catch (error) { setToast(error instanceof Error ? error.message : '确认失败'); return }
      }
    } else updateItem(id, { status: 'ready', confidence: '已确认' })
    setToast('已确认此项推荐')
  }

  const startAnalysis = async () => {
    if (liveMode) {
      try {
        const raw = await call<ItemDto[]>('classify_items', { itemIds: selectedIds.length ? selectedIds : null })
        setItems(raw.map(toUiItem))
        setToast('分析已完成，请审核推荐目标')
      } catch (error) { setToast(error instanceof Error ? error.message : '分析失败') }
      return
    }
    setItems((current) => current.map((item) => item.status === 'review' ? { ...item, status: 'analyzing' } : item))
    setToast('分析任务已开始，完成后会更新推荐')
    window.setTimeout(() => setItems((current) => current.map((item) => item.status === 'analyzing' ? { ...item, status: 'review' } : item)), 1800)
  }

  const archiveSelected = async () => {
    const readyIds = items.filter((item) => selectedIds.includes(item.id) && item.status === 'ready').map((item) => item.id)
    if (!readyIds.length) return
    if (liveMode) {
      try {
        await call<OperationDto[]>('archive_items', { itemIds: readyIds, mode })
        await refreshLiveData()
        setToast('归档执行已结束，逐项结果已写入任务历史')
      } catch (error) { setToast(error instanceof Error ? error.message : '归档未完成') }
      return
    }
    setItems((current) => current.map((item) => readyIds.includes(item.id) ? { ...item, status: 'archived' } : item))
    setToast(mode === 'copy' ? '已创建归档副本，源文件保持不变' : '归档已完成，请在历史中查看结果')
  }

  const undoArchive = async (operationId: string) => {
    if (!liveMode) { setToast('浏览器演示模式没有真实文件操作'); return }
    try {
      await call<void>('undo_operation', { operationId })
      await refreshLiveData()
      setToast('已撤销归档，目标文件已安全移除或移回原处')
    } catch (error) { setToast(error instanceof Error ? error.message : '撤销失败') }
  }

  const retryArchive = async (operationId: string) => {
    if (!liveMode) { setToast('浏览器演示模式没有真实文件操作'); return }
    try {
      await call<OperationDto[]>('retry_operation', { operationId })
      await refreshLiveData()
      setToast('已重新执行归档，请查看最新记录')
    } catch (error) { setToast(error instanceof Error ? error.message : '重试失败') }
  }

  const addDemoItem = async (type: 'file' | 'folder' | 'expanded') => {
    if (liveMode) {
      try {
        setImportProgress({ stage: '等待选择来源…', value: 8 })
        const paths = type === 'file' ? await pickFiles() : ((path) => path ? [path] : [])(await pickFolder())
        if (!paths.length) return
        setImportProgress({ stage: type === 'expanded' ? '正在读取文件夹目录…' : '正在加入待分类列表…', value: type === 'expanded' ? 35 : 65 })
        const raw = await call<ItemDto[]>('import_paths', { paths, mode: type === 'folder' ? 'whole_folder' : type === 'expanded' ? 'expanded' : 'single_file', recurse: type === 'expanded' })
        setImportProgress({ stage: '已加入，正在刷新列表…', value: 92 })
        const next = raw.map(toUiItem)
        setItems((current) => [...next, ...current.filter((item) => !next.some((candidate) => candidate.id === item.id))])
        setActiveId(next[0].id); setSelectedIds((current) => Array.from(new Set([...next.map((item) => item.id), ...current])))
        setImportOpen(false); setToast(type === 'folder' ? '文件夹已加入，默认按整体归档' : type === 'expanded' ? '已展开文件夹内容并加入队列' : '文件已加入待分类列表')
      } catch (error) { setToast(error instanceof Error ? error.message : '导入失败') }
      finally { setImportProgress(null) }
      return
    }
    const id = `${type}-${Date.now()}`
    const item: ArchiveItem = type === 'folder'
      ? { id, name: '新导入文件夹', path: '刚刚导入', type: 'folder', mode: '整体归档', size: '扫描中', modified: '刚刚', recommendation: '等待分析', confidence: '等待分析', status: 'review', members: '尚未枚举', reason: '文件夹刚刚加入队列，分析完成后会显示推荐依据。', detail: '默认按整体文件夹处理，确认后才会开始扫描。' }
      : { id, name: '新导入文件.txt', path: '刚刚导入', type: 'document', mode: '单个文件', size: '等待读取', modified: '刚刚', recommendation: '等待分析', confidence: '等待分析', status: 'review', reason: '文件刚刚加入队列，分析完成后会显示推荐依据。', detail: '你可以先选择参与本次分类的文件库。' }
    setItems((current) => [item, ...current])
    setActiveId(id)
    setSelectedIds((current) => [id, ...current])
    setImportOpen(false)
    setToast(type === 'folder' ? '文件夹已加入，默认按整体归档' : type === 'expanded' ? '已展开文件夹内容并加入队列' : '文件已加入待分类列表')
  }

  const loadLibraryTree = async (libraryId: string) => {
    const library = libraryState.find((candidate) => candidate.id === libraryId)
    if (!liveMode || !library || loadedLibraryTreeDepths[libraryId] === library.folderDepth) return
    try {
      const tree = await call<FolderNodeDto[]>('get_library_tree', { libraryId })
      setLibraryState((current) => current.map((library) => library.id === libraryId ? { ...library, folders: folderTreeToUi(tree) } : library))
      setLoadedLibraryTreeDepths((current) => ({ ...current, [libraryId]: library.folderDepth }))
    } catch (error) { setToast(error instanceof Error ? error.message : '读取目录失败') }
  }

  const nav = [
    { id: 'queue' as View, label: '待分类', icon: 'inbox' as IconName, count: items.filter((item) => item.status !== 'archived').length },
    { id: 'libraries' as View, label: '文件库', icon: 'folder' as IconName },
    { id: 'history' as View, label: '任务历史', icon: 'history' as IconName },
    { id: 'settings' as View, label: '设置', icon: 'settings' as IconName },
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-icon"><Icon name="archive" size={19} /></span>
          <span><strong>归档台</strong><small>AI 文件归档助手</small></span>
        </div>
        <nav className="primary-nav" aria-label="主导航">
          {nav.map((item) => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)} aria-label={item.label} title={item.label}>
            <Icon name={item.icon} size={18} /><span>{item.label}</span>{item.count ? <b>{item.count}</b> : null}
          </button>)}
        </nav>
        <div className="library-section">
          <div className="section-label"><span>我的文件库</span><button aria-label="添加文件库" title="添加文件库" onClick={() => { setView('libraries'); setToast('请在文件库页面登记新的目标文件夹') }}><Icon name="plus" size={15} /></button></div>
          <SidebarLibraryTree libraries={libraryState} onDoubleClick={loadLibraryTree} onOpen={(library) => { setView('queue'); setToast(`已筛选文件库：${library.name}`) }} />
        </div>
      </aside>

      <main className="main-area">
        {view === 'queue' && <QueueView {...{ activeItem, activeId, approvedCount, filter, importOpen, importProgress, items, libraries: libraryState, mobileDetails, query, reviewedCount, selectedIds, selectedCount, setActiveId, setFilter, setImportOpen, setMobileDetails, setQuery, toggleAll, toggleSelected, startAnalysis, confirmItem, archiveSelected, addDemoItem, mode, setMode, updateItem, visibleItems }} />}
        {view === 'libraries' && <LibrariesView libraries={libraryState} setLibraryState={setLibraryState} setToast={setToast} />}
        {view === 'history' && <HistoryView operations={operations} onUndo={undoArchive} onRetry={retryArchive} />}
        {view === 'settings' && <SettingsView setToast={setToast} />}
      </main>
      {toast && <div className="toast" role="status"><span className="toast-icon"><Icon name="check" size={15} /></span>{toast}<button onClick={() => setToast('')} aria-label="关闭提示"><Icon name="close" size={14} /></button></div>}
    </div>
  )
}

type QueueProps = {
  activeItem: ArchiveItem
  activeId: string
  approvedCount: number
  filter: Filter
  importOpen: boolean
  importProgress: ImportProgress | null
  items: ArchiveItem[]
  libraries: UiLibrary[]
  mobileDetails: boolean
  query: string
  reviewedCount: number
  selectedIds: string[]
  selectedCount: number
  setActiveId: (id: string) => void
  setFilter: (filter: Filter) => void
  setImportOpen: (open: boolean) => void
  setMobileDetails: (open: boolean) => void
  setQuery: (query: string) => void
  toggleAll: () => void
  toggleSelected: (id: string) => void
  startAnalysis: () => void
  confirmItem: (id: string) => void
  archiveSelected: () => void
  addDemoItem: (type: 'file' | 'folder' | 'expanded') => void
  mode: 'copy' | 'move'
  setMode: (mode: 'copy' | 'move') => void
  updateItem: (id: string, patch: Partial<ArchiveItem>) => void
  visibleItems: ArchiveItem[]
}

function QueueView(props: QueueProps) {
  const { activeItem, activeId, filter, importOpen, importProgress, items, libraries, mobileDetails, query, reviewedCount, selectedIds, selectedCount, setActiveId, setFilter, setImportOpen, setMobileDetails, setQuery, toggleAll, toggleSelected, startAnalysis, confirmItem, archiveSelected, addDemoItem, mode, setMode, updateItem, visibleItems } = props
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => selectedIds.includes(item.id))
  return <>
    <header className="topbar">
      <div className="breadcrumbs"><span>工作台</span><Icon name="chevron" size={13} /><strong>待分类</strong></div>
    </header>
    <div className="content-scroll">
      <section className="workspace-head">
        <div><h1>待分类文件</h1></div>
        <div className="head-actions">
          <Button variant="outline" size="lg" onClick={startAnalysis}><Icon name="spark" size={16} />分析全部</Button>
          <div className="import-wrap"><Button size="lg" onClick={() => setImportOpen(!importOpen)}><Icon name="plus" size={17} />添加 <span className="button-caret">⌄</span></Button>{importOpen && <div className="import-menu"><button onClick={() => addDemoItem('file')}><span className="menu-icon"><Icon name="file" size={16} /></span><span><strong>添加文件</strong><small>选择一个或多个文件</small></span></button><button onClick={() => addDemoItem('folder')}><span className="menu-icon folder"><Icon name="folder" size={16} /></span><span><strong>添加文件夹</strong><small>默认按整体文件夹处理</small></span></button><button onClick={() => addDemoItem('expanded')}><span className="menu-icon folder"><Icon name="folder" size={16} /></span><span><strong>展开文件夹</strong><small>递归读取所有子文件</small></span></button></div>}</div>
        </div>
      </section>

      <section className="queue-toolbar">
        <div className="filter-tabs" role="tablist" aria-label="状态筛选">
          {[['all', '全部', items.length], ['review', '待确认', items.filter((item) => item.status === 'review').length], ['ready', '已推荐', items.filter((item) => item.status === 'ready').length], ['archived', '已归档', items.filter((item) => item.status === 'archived').length]].map(([id, label, count]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id as Filter)}>{label}<b>{count}</b></button>)}
        </div>
        <div className="toolbar-tools"><label className="search-box"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件名或路径" /></label></div>
      </section>

      {importProgress && <section className="import-progress" aria-live="polite">
        <div className="import-progress-copy"><span className="progress-spinner" aria-hidden="true" /><strong>{importProgress.stage}</strong><small>{importProgress.value}%</small></div>
        <div className="import-progress-track"><span style={{ width: `${importProgress.value}%` }} /></div>
      </section>}

      <section className="workbench-grid">
        <div className="table-panel">
          <div className="table-heading"><div><h2>本次待分类 <span>{items.length}</span></h2><p>已审核 {reviewedCount} 项 · 选择一项查看详情</p></div><div className="scan-progress"><span><i style={{ transform: `scaleX(${Math.min(1, reviewedCount / Math.max(items.length, 1))})` }} /></span><small>{reviewedCount} / {items.length} 已分析</small></div></div>
          <div className="data-table" role="table" aria-label="待分类文件">
            <div className="table-row table-header" role="row"><div className="check-cell"><Checkbox checked={allVisibleSelected} onChange={toggleAll} aria-label="全选" /></div><div>名称</div><div>推荐文件库</div><div>状态</div><div className="row-more" /></div>
            <div className="table-body">
              {visibleItems.map((item) => <div key={item.id} className={`table-row ${activeId === item.id ? 'selected' : ''} ${selectedIds.includes(item.id) ? 'marked' : ''}`} role="row" onClick={() => { setActiveId(item.id); setMobileDetails(true) }}>
                <div className="check-cell"><Checkbox checked={selectedIds.includes(item.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(item.id)} aria-label={`选择 ${item.name}`} /></div>
                <div className="name-cell"><ObjectIcon type={item.type} /><span><strong>{item.name}</strong><small>{item.path} · {item.mode}</small></span></div>
                <div className="recommend-cell"><LibraryMark color={item.recommendation === '项目资料' ? 'mint' : item.recommendation === '个人学习' ? 'blue' : item.recommendation === '发票与收据' ? 'amber' : 'plum'} /><span>{recommendationLabel(item)}</span>{item.confidence === '高匹配' && <span className="match-dot" />}</div>
                <div><StatusPill status={item.status} confidence={item.confidence} /></div><div className="row-more"><button className="icon-button small" onClick={(event) => { event.stopPropagation(); setActiveId(item.id); setMobileDetails(true) }} aria-label="查看详情"><Icon name="chevron" size={16} /></button></div>
              </div>)}
              {visibleItems.length === 0 && <div className="empty-table"><span className="empty-icon"><Icon name="search" size={22} /></span><strong>没有找到匹配的对象</strong><span>试试换一个关键词或清除筛选。</span></div>}
            </div>
          </div>
          <div className="table-foot"><span><span className="legend-dot green" />已推荐</span><span><span className="legend-dot amber" />需要确认</span><span className="foot-note">分析结果仅供参考，归档前请逐项审核</span></div>
        </div>
        <DetailPanel item={activeItem} libraries={libraries} mobileDetails={mobileDetails} setMobileDetails={setMobileDetails} confirmItem={confirmItem} updateItem={updateItem} />
      </section>
    </div>
    <ArchiveBar selectedCount={selectedCount} selectedItems={items.filter((item) => selectedIds.includes(item.id))} mode={mode} setMode={setMode} archiveSelected={archiveSelected} />
  </>
}

function DetailPanel({ item, libraries, mobileDetails, setMobileDetails, confirmItem, updateItem }: { item: ArchiveItem; libraries: UiLibrary[]; mobileDetails: boolean; setMobileDetails: (open: boolean) => void; confirmItem: (id: string) => void; updateItem: (id: string, patch: Partial<ArchiveItem>) => void }) {
  const [remoteTrees, setRemoteTrees] = useState<Record<string, { depth: number; folders: FolderNode[] }>>({})

  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    const missing = libraries.filter((library) => !library.folders.length && remoteTrees[library.id]?.depth !== library.folderDepth)
    if (!missing.length) return
    void Promise.all(missing.map(async (library) => {
      try {
        const tree = await call<FolderNodeDto[]>('get_library_tree', { libraryId: library.id })
        return [library.id, { depth: library.folderDepth, folders: folderTreeToUi(tree) }] as const
      } catch {
        return null
      }
    })).then((entries) => {
      if (disposed) return
      const loaded = entries.filter((entry): entry is readonly [string, { depth: number; folders: FolderNode[] }] => Boolean(entry))
      if (!loaded.length) return
      setRemoteTrees((current) => {
        const next = { ...current }
        loaded.forEach((entry) => { next[entry[0]] = entry[1] })
        return next
      })
    })
    return () => { disposed = true }
  }, [libraries, remoteTrees])

  const targetLibraries = libraries.map((library) => {
    if (library.folders.length) return library
    const cached = remoteTrees[library.id]
    return cached?.depth === library.folderDepth ? { ...library, folders: cached.folders } : library
  })
  const targetNodes = targetTreeNodes(targetLibraries)
  const selectedValue = item.recommendation === '暂不归档' ? 'none' : JSON.stringify({ libraryName: item.recommendation, folderPath: item.recommendationPath || '' })
  const showPath = async () => {
    if (!item.source) return
    if (!isTauri()) { window.alert(`来源路径：${item.source}`); return }
    try { await revealPath(item.source) } catch (error) { window.alert(error instanceof Error ? error.message : '无法打开文件夹') }
  }
  return <aside className={`detail-panel ${mobileDetails ? 'mobile-open' : ''}`}>
    <div className="detail-head"><div><span className="panel-kicker">对象详情</span><h2>查看与确认</h2></div><div className="detail-head-actions"><button className="icon-button" onClick={() => setMobileDetails(false)} aria-label="关闭详情"><Icon name="close" size={17} /></button></div></div>
    <div className="detail-scroll">
      <div className="object-summary"><ObjectIcon type={item.type} /><div><h3>{item.name}</h3><p>{item.path}</p></div></div>
      <div className="detail-meta"><span>{item.mode}</span><span>{item.size}</span><span>{item.modified}</span></div>
      {item.type === 'folder' && <Card className="folder-snapshot"><CardContent><div className="snapshot-top"><span><Icon name="folder" size={15} />目录概览</span><b>{item.members}</b></div><div className="snapshot-bars"><i /><i /><i /><i /><i /><i /><i /></div><small>完整成员会在归档前逐一校验，样本不代表归档范围。</small></CardContent></Card>}
      <Card className="recommendation-block"><CardHeader className="recommendation-card-head"><CardTitle>分类建议</CardTitle><StatusPill status={item.status} confidence={item.confidence} /></CardHeader><CardContent className="recommendation-card-content"><div className="recommend-target"><LibraryMark color={libraries.find((library) => library.name === item.recommendation)?.color ?? 'mint'} /><TreeSelect value={selectedValue} nodes={targetNodes} onChange={(value) => {
        if (value === 'none') {
          updateItem(item.id, { recommendation: '暂不归档', recommendationPath: '', confidence: '已修改', status: 'unmatched' })
          return
        }
        try {
          const target = JSON.parse(value) as { libraryName: string; folderPath: string }
          updateItem(item.id, { recommendation: target.libraryName, recommendationPath: target.folderPath, confidence: '已修改', status: 'ready' })
        } catch {
          updateItem(item.id, { recommendation: '暂不归档', recommendationPath: '', confidence: '需要确认', status: 'unmatched' })
          }
      }} /></div><p className="confidence-copy">{item.confidence === '高匹配' ? '与当前文件库说明高度吻合' : item.confidence === '已修改' ? '这是你手动选择的目标' : '信息不足，建议你确认后再继续'}</p></CardContent></Card>
      <div className="detail-section"><h4>为什么这样建议</h4><p>{item.reason}</p></div>
      <div className="path-explain"><div className="path-step"><span className="path-node source"><Icon name="folder" size={14} /></span><span><small>来源</small><strong>{item.path.split(' / ')[0]}</strong></span></div><Icon name="arrow" size={15} /><div className="path-step"><span className="path-node target"><Icon name="archive" size={14} /></span><span><small>目标</small><strong>{item.recommendation === '等待分析' ? '等待分析' : `${recommendationLabel(item)} / ${item.name}`}</strong></span></div></div>
      <div className="detail-section"><h4>归档说明</h4><p>{item.detail}</p></div>
      {item.status === 'review' && <Button className="confirm-button" onClick={() => confirmItem(item.id)}><Icon name="check" size={16} />确认这一项</Button>}
      {item.status === 'archived' && <div className="completed-note"><span><Icon name="check" size={15} /></span>已完成归档，可在任务历史中查看记录</div>}
      <Button variant="outline" className="secondary-detail-button" onClick={showPath}><Icon name="external" size={15} />在文件夹中显示</Button>
    </div>
  </aside>
}

function ArchiveBar({ selectedCount, selectedItems, mode, setMode, archiveSelected }: { selectedCount: number; selectedItems: ArchiveItem[]; mode: 'copy' | 'move'; setMode: (mode: 'copy' | 'move') => void; archiveSelected: () => void }) {
  const readyCount = selectedItems.filter((item) => item.status === 'ready').length
  return <footer className="archive-bar"><div className="archive-summary"><span className="summary-count">{selectedCount}</span><span><strong>项已选择</strong><small>{readyCount} 项已确认目标</small></span></div><div className="archive-divider" /><div className="mode-control"><span className="control-label">归档方式</span><div className="segmented"><button className={mode === 'copy' ? 'active' : ''} onClick={() => setMode('copy')}><Icon name="copy" size={15} />复制</button><button className={mode === 'move' ? 'active' : ''} onClick={() => setMode('move')}><Icon name="move" size={15} />移动</button></div></div><div className="conflict-control"><span className="control-label">遇到同名文件</span><span className="select-like">自动跳过</span></div><div className="archive-actions"><Button className="archive-button" disabled={!readyCount} onClick={archiveSelected}><Icon name="archive" size={17} />开始归档 <span>{readyCount || ''}</span></Button></div></footer>
}

function LibrariesView({ libraries, setLibraryState, setToast }: { libraries: UiLibrary[]; setLibraryState: (libraries: UiLibrary[]) => void; setToast: (message: string) => void }) {
  const [active, setActive] = useState(libraries[0]?.id ?? '')
  const current = libraries.find((library) => library.id === active) ?? libraries[0]
  const [depthDraft, setDepthDraft] = useState(current?.folderDepth ?? 0)

  useEffect(() => { setDepthDraft(current?.folderDepth ?? 0) }, [current?.id, current?.folderDepth])

  useEffect(() => {
    if (!current || !isTauri() || current.folders.length) return
    void call<FolderNodeDto[]>('get_library_tree', { libraryId: current.id }).then((tree) => {
      setLibraryState(libraries.map((library) => library.id === current.id ? { ...library, folders: folderTreeToUi(tree) } : library))
    }).catch((error) => setToast(error instanceof Error ? error.message : '读取目录失败'))
  }, [active, current?.id, current?.folderDepth, current?.folders.length])

  const addLibrary = async () => {
    if (!isTauri()) { setToast('请在桌面应用中选择本地文件夹'); return }
    const root = await pickFolder()
    if (!root) return
    const defaultName = root.replace(/\\/g, '/').split('/').filter(Boolean).slice(-1)[0] || '新文件库'
    const name = window.prompt('文件库名称', defaultName)?.trim()
    if (!name) return
    const purpose = window.prompt('收录说明（可选）', '保存与这个主题相关的文件。') ?? ''
    try {
      const created = await call<LibraryDto>('create_library', { name, rootPath: root, purpose, folderDepth: 0 })
      const next = { ...toUiLibrary(created, libraries.length), folders: [] }
      setLibraryState([...libraries, next]); setActive(next.id); setToast(`已添加文件库：${name}`)
    } catch (error) { setToast(error instanceof Error ? error.message : '添加文件库失败') }
  }

  const editProfile = async () => {
    if (!current) return
    const name = window.prompt('文件库名称', current.name)?.trim()
    if (!name) return
    const purpose = window.prompt('收录说明', current.purpose || '保存与这个主题相关的文件。')?.trim()
    if (purpose == null) return
    if (!isTauri()) {
      setLibraryState(libraries.map((library) => library.id === current.id ? { ...library, name, purpose, profile: '说明已发布' } : library)); setToast('收录说明已更新'); return
    }
    try {
      const updated = await call<LibraryDto>('update_library', { libraryId: current.id, name, purpose, folderDepth: current.folderDepth })
      setLibraryState(libraries.map((library, index) => library.id === current.id ? { ...toUiLibrary(updated, index), folders: current.folders } : library)); setToast('收录说明已发布')
    } catch (error) { setToast(error instanceof Error ? error.message : '更新说明失败') }
  }

  const saveFolderDepth = async () => {
    if (!current) return
    const nextDepth = Number(depthDraft)
    if (!Number.isInteger(nextDepth) || nextDepth < 0 || nextDepth > 20) {
      setToast('目录展示深度请输入 0 到 20 之间的整数')
      return
    }
    if (!isTauri()) {
      setLibraryState(libraries.map((library) => library.id === current.id ? { ...library, folderDepth: nextDepth, folders: limitFolderDepth(library.folders, nextDepth) } : library))
      setToast('目录展示深度已更新')
      return
    }
    try {
      const updated = await call<LibraryDto>('update_library', { libraryId: current.id, name: current.name, purpose: current.purpose || '', folderDepth: nextDepth })
      const tree = await call<FolderNodeDto[]>('get_library_tree', { libraryId: current.id })
      setLibraryState(libraries.map((library, index) => library.id === current.id ? { ...toUiLibrary(updated, index), folders: folderTreeToUi(tree) } : library))
      setToast('目录展示深度已更新')
    } catch (error) { setToast(error instanceof Error ? error.message : '保存目录展示深度失败') }
  }

  const addFolder = async (parentPath = '', parentName = current?.name || '文件库') => {
    if (!current) return
    const name = window.prompt(`在“${parentName}”下新建文件夹`, '新文件夹')?.trim()
    if (!name) return
    if (!isTauri()) {
      const newNode: FolderNode = { name, path: parentPath ? `${parentPath}/${name}` : name, count: 0, children: [] }
      const append = (nodes: FolderNode[], parent = ''): FolderNode[] => nodes.map((node) => {
        const nodePath = node.path || (parent ? `${parent}/${node.name}` : node.name)
        const children = node.children ?? []
        return nodePath === parentPath ? { ...node, path: nodePath, children: [...children, newNode] } : { ...node, path: nodePath, children: append(children, nodePath) }
      })
      const folders = parentPath ? append(current.folders) : [...current.folders, newNode]
      setLibraryState(libraries.map((library) => library.id === current.id ? { ...library, folders } : library))
      setToast(`已创建文件夹：${name}`)
      return
    }
    try {
      const tree = await call<FolderNodeDto[]>('create_library_folder', { libraryId: current.id, parentPath, name })
      setLibraryState(libraries.map((library) => library.id === current.id ? { ...library, folders: folderTreeToUi(tree) } : library))
      setToast(`已创建文件夹：${name}`)
    } catch (error) { setToast(error instanceof Error ? error.message : '创建文件夹失败') }
  }

  if (!current) return <div className="content-scroll standalone-page"><header className="page-header"><div><h1>文件库</h1><p className="subtitle">先添加一个本机文件夹作为归档目标。</p></div><Button size="lg" onClick={addLibrary}><Icon name="plus" size={17} />添加文件库</Button></header></div>
  return <div className="content-scroll standalone-page"><header className="page-header"><div><h1>文件库</h1><p className="subtitle">目标位置　·　管理归档目标和它们的收录说明。</p></div><Button size="lg" onClick={addLibrary}><Icon name="plus" size={17} />添加文件库</Button></header><div className="library-layout"><div className="library-directory">{libraries.map((library) => <button key={library.id} className={`directory-row ${active === library.id ? 'active' : ''}`} onClick={() => setActive(library.id)}><LibraryMark color={library.color} /><span><strong>{library.name}</strong><small>{library.profile}</small></span><b>{library.count}</b><Icon name="chevron" size={15} /></button>)}</div><div className="library-detail"><div className="detail-title-row"><div><span className="large-library-mark"><LibraryMark color={current.color} /></span><h2>{current.name}</h2><span className="available-pill"><i />{current.status}</span></div></div><dl className="library-facts"><div><dt>文件夹位置</dt><dd>{current.rootPath ? '本机文件夹 · 路径已登记' : '本机文件夹 · 路径已隐藏'}</dd></div><div><dt>当前文件数</dt><dd>{current.count} 个文件</dd></div><div><dt>说明版本</dt><dd>{current.profile}</dd></div></dl><div className="profile-card"><div><span className="profile-icon"><Icon name="file" size={17} /></span><span><strong>收录说明</strong><small>告诉 AI 哪些文件适合放进这里</small></span></div><Button variant="ghost" size="sm" onClick={editProfile}>编辑说明 <Icon name="arrow" size={14} /></Button></div><div className="profile-preview"><div className="preview-head"><h3>当前说明摘要</h3><span>{current.profile}</span></div><p>{current.purpose || '保存与具体项目、交付事项和业务记录有关的文件。'}</p><div className="preview-tags"><span>项目需求</span><span>交付文件</span><span>验收记录</span><span className="exclude">不含：个人账单</span></div></div><div className="folder-depth-setting"><div><strong>目录展示深度</strong><small>0 表示显示全部层级；设置 2 时返回两层文件夹。</small></div><div className="folder-depth-controls"><input type="number" min="0" max="20" step="1" value={depthDraft} onChange={(event) => setDepthDraft(Number(event.target.value))} aria-label="目录展示深度" /><Button variant="outline" size="sm" onClick={saveFolderDepth}>保存</Button></div></div><div className="folder-tree-card"><div className="folder-tree-head"><div><h3>库内文件夹</h3><p>支持按展示深度返回目录，双击文件夹展开下一层。</p></div><div className="tree-head-actions"><span className="tree-depth"><Icon name="folder" size={13} />{current.folderDepth ? `显示 ${current.folderDepth} 层` : '显示全部层级'}</span><button className="tree-add-root" onClick={() => addFolder()}><Icon name="plus" size={14} />新建文件夹</button></div></div><div className="folder-breadcrumb"><Icon name="archive" size={14} /><span>{current.name}</span>{current.folders.length ? <><Icon name="chevron" size={12} /><span>库内目录</span></> : null}</div>{current.folders.length ? <SharedFolderTree nodes={folderNodesToTreeNodes(current.folders)} className="folder-tree" nodeClassName="folder-tree-node" renderRow={({ node, depth, isExpanded, hasChildren, path }) => <div className="folder-tree-row-wrap"><button className="folder-tree-row" style={{ paddingLeft: `${12 + depth * 21}px` }} aria-expanded={hasChildren ? isExpanded : undefined}><span className={`tree-chevron ${isExpanded ? 'open' : ''}`}>{hasChildren ? <Icon name="chevron" size={13} /> : <span />}</span><span className="tree-folder-icon"><Icon name="folder" size={15} /></span><span className="tree-name">{node.label}</span><small>{node.count}</small></button><button className="tree-add-button" title={`在${node.label}下新建文件夹`} aria-label={`在${node.label}下新建文件夹`} onClick={(event) => { event.stopPropagation(); addFolder(path, node.label) }} onDoubleClick={(event) => event.stopPropagation()}><Icon name="plus" size={13} /></button></div>} /> : <div className="empty-table"><span className="empty-icon"><Icon name="folder" size={20} /></span><strong>暂无子文件夹</strong><span>新建后可继续在任意子文件夹下添加下一层。</span><button className="tree-add-root" onClick={() => addFolder()}><Icon name="plus" size={14} />新建文件夹</button></div>}</div></div></div></div>
}

function HistoryView({ operations, onUndo, onRetry }: { operations: OperationDto[]; onUndo: (operationId: string) => void; onRetry: (operationId: string) => void }) {
  const [onlyIssues, setOnlyIssues] = useState(false)
  const fallback = [{ date: '今天 10:14', name: '下载文件整理', result: '3 个已归档 · 1 个待确认', status: '进行中' }, { date: '昨天 16:38', name: '桌面清理', result: '18 个已归档', status: '已完成' }]
  const stateLabel = (state: string) => ({ committed: '已完成', undone: '已撤销', skipped: '已跳过', source_retained: '源仍保留', needs_attention: '需处理', undo_blocked: '撤销受阻', superseded: '已重试', planned: '待执行', copying: '复制中', verifying: '校验中', undo_requested: '撤销中' }[state] ?? '需处理')
  const runs = operations.length ? operations.map((operation) => ({ id: operation.id, date: new Date(Number(operation.created_at) * 1000).toLocaleString('zh-CN'), name: operation.name, result: operation.error ? `${displayPath(operation.destination_path)} · ${operation.error}` : displayPath(operation.destination_path), status: stateLabel(operation.state), issue: ['needs_attention', 'source_retained', 'undo_blocked', 'skipped'].includes(operation.state), canRetry: operation.can_retry, canUndo: operation.can_undo })) : isTauri() ? [] : fallback.map((run) => ({ ...run, id: '', issue: false, canRetry: false, canUndo: false }))
  const visibleRuns = onlyIssues ? runs.filter((run) => run.issue) : runs
  return <div className="content-scroll standalone-page"><header className="page-header"><div><h1>任务历史</h1><p className="subtitle">可追溯记录　·　每次分析和归档都会保留范围、目标和结果。</p></div><Button variant="outline" className={onlyIssues ? 'active' : ''} onClick={() => setOnlyIssues(!onlyIssues)}><Icon name="filter" size={16} />{onlyIssues ? '显示全部' : '只看异常'}</Button></header><div className="history-list">{visibleRuns.map((run, index) => <div className="history-row" key={`${run.name}-${index}`}><span className="history-icon"><Icon name={run.status === '进行中' ? 'play' : run.issue ? 'info' : 'check'} size={16} /></span><div className="history-main"><strong>{run.name}</strong><small>{run.date} · {run.result}</small></div><span className={`history-status ${run.issue ? 'in-progress' : ''}`}>{run.status}</span>{run.canUndo ? <button className="icon-button" onClick={() => onUndo(run.id)} title="撤销此归档" aria-label={`撤销 ${run.name}`}><Icon name="refresh" size={16} /></button> : run.canRetry ? <button className="icon-button" onClick={() => onRetry(run.id)} title="重试此归档" aria-label={`重试 ${run.name}`}><Icon name="play" size={16} /></button> : <span />}</div>)}{visibleRuns.length === 0 && <div className="empty-table"><span className="empty-icon"><Icon name="check" size={20} /></span><strong>{onlyIssues ? '没有异常记录' : '还没有归档记录'}</strong><span>{onlyIssues ? '当前操作都已正常完成。' : '完成第一次归档后，结果会显示在这里。'}</span></div>}</div><div className="history-foot"><Icon name="shield" size={16} /><span>中断操作会在应用启动时对账；只有通过指纹校验的结果才会自动恢复。</span></div></div>
}

function SettingsView({ setToast }: { setToast: (message: string) => void }) {
  const stored = (() => { try { return JSON.parse(window.localStorage.getItem('archive-desk-settings') || '{}') as Record<string, unknown> } catch { return {} } })()
  const [cloud, setCloud] = useState(false)
  const [showScope, setShowScope] = useState(stored.showScope !== false)
  const [rightClick, setRightClick] = useState(Boolean(stored.rightClick))
  const [defaultMode, setDefaultMode] = useState<'copy' | 'move'>(stored.defaultMode === 'move' ? 'move' : 'copy')
  const [endpoint, setEndpoint] = useState('https://api.openai.com/v1')
  const [model, setModel] = useState('gpt-4.1-mini')
  const [apiKey, setApiKey] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isTauri()) return
    void call<AiSettingsDto>('get_ai_settings').then((settings) => { setCloud(settings.enabled); setEndpoint(settings.endpoint); setModel(settings.model); setHasApiKey(settings.has_api_key) }).catch((error) => setToast(error instanceof Error ? error.message : '读取 AI 设置失败'))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      window.localStorage.setItem('archive-desk-settings', JSON.stringify({ showScope, rightClick, defaultMode }))
      if (isTauri()) {
        const settings = await call<AiSettingsDto>('save_ai_settings', { enabled: cloud, endpoint, model, apiKey: apiKey || null })
        setHasApiKey(settings.has_api_key); setApiKey('')
      }
      setToast('设置已保存')
    } catch (error) { setToast(error instanceof Error ? error.message : '保存设置失败') }
    finally { setSaving(false) }
  }

  const testConnection = async () => {
    try {
      if (apiKey) await call<AiSettingsDto>('save_ai_settings', { enabled: cloud, endpoint, model, apiKey })
      const message = await call<string>('test_ai_connection'); setHasApiKey(true); setApiKey(''); setToast(message)
    } catch (error) { setToast(error instanceof Error ? error.message : '连接测试失败') }
  }

  return <div className="content-scroll standalone-page"><header className="page-header"><div><h1>设置</h1><p className="subtitle">应用偏好　·　控制本地分类、可选 AI 服务和归档默认值。</p></div><Button variant="outline" disabled={saving} onClick={save}><Icon name="check" size={16} />{saving ? '保存中' : '保存设置'}</Button></header><div className="settings-list"><section className="settings-section"><div className="settings-section-head"><h2>分类方式</h2><p>默认使用本地规则；也可连接 OpenAI 兼容接口辅助判断。</p></div><div className="setting-row"><span className="setting-symbol"><Icon name="spark" size={17} /></span><div><strong>启用 AI 分类适配器</strong><small>只发送对象名称、类型、大小和文件库说明，不发送绝对路径或文件正文。</small></div><button className={`toggle ${cloud ? 'on' : ''}`} onClick={() => setCloud(!cloud)} aria-label="启用 AI 分类适配器"><i /></button></div>{cloud && <div className="ai-config"><label><span>接口地址</span><TextInput value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://api.openai.com/v1" /></label><label><span>模型</span><TextInput value={model} onChange={(event) => setModel(event.target.value)} placeholder="gpt-4.1-mini" /></label><label><span>API 密钥</span><TextInput type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasApiKey ? '已保存在系统凭据库；留空保持不变' : '输入 API 密钥'} /></label><div className="ai-config-actions"><span><Icon name="shield" size={14} />{hasApiKey ? '密钥已安全保存' : '尚未保存密钥'}</span><Button variant="outline" size="sm" onClick={testConnection}>测试连接</Button></div></div>}<div className="setting-row"><span className="setting-symbol"><Icon name="shield" size={17} /></span><div><strong>分析前显示上传范围</strong><small>启用 AI 后，每次服务商或字段范围变化时重新确认。</small></div><button className={`toggle ${showScope ? 'on' : ''}`} onClick={() => setShowScope(!showScope)} aria-label="分析前显示上传范围"><i /></button></div></section><section className="settings-section"><div className="settings-section-head"><h2>系统入口</h2><p>应用内文件选择器已经可用；右键入口需要随安装包注册。</p></div><div className="setting-row"><span className="setting-symbol"><Icon name="external" size={17} /></span><div><strong>计划启用系统右键入口</strong><small>保存偏好，安装版支持注册后即可启用。</small></div><button className={`toggle ${rightClick ? 'on' : ''}`} onClick={() => setRightClick(!rightClick)} aria-label="计划启用系统右键入口"><i /></button></div><div className="setting-row link-row" onClick={() => setToast(isTauri() ? '当前开发版未注册系统右键入口，应用内导入可正常使用' : '浏览器模式不支持系统右键入口')}><span className="setting-symbol"><Icon name="refresh" size={17} /></span><div><strong>检查入口状态</strong><small>查看当前运行环境是否已注册系统入口。</small></div><Icon name="chevron" size={17} /></div></section><section className="settings-section"><div className="settings-section-head"><h2>默认行为</h2><p>第一次整理建议使用复制。</p></div><button className="setting-row link-row" onClick={() => setDefaultMode(defaultMode === 'copy' ? 'move' : 'copy')}><span className="setting-symbol"><Icon name={defaultMode === 'copy' ? 'copy' : 'move'} size={17} /></span><div><strong>默认归档方式</strong><small>复制会保留源文件，移动会在完成后移除源文件。</small></div><span className="setting-value">{defaultMode === 'copy' ? '复制' : '移动'} <Icon name="chevron" size={15} /></span></button></section></div></div>
}

export default App

