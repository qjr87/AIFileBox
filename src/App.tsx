import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { call, errorMessage, folderTreeToUi, isTauri, pickFolder, revealPath, RULE_FILE_NAME, type AgentEntryDto, type AiRequestLogDto, type AiSettingsDto, type FolderNodeDto, type LibraryDto, type OverviewDto, type RuleDocDto, type UiFolderNode } from './backend'
import { Badge, Button, TextInput } from './components/watermelon-ui'
import { FolderTree as SharedFolderTree, type FolderTreeNode } from './components/folder-tree'
import { AgentView } from './components/agent-view'
import { DEFAULT_GLOBAL_RULES, RuleEditor, demoRuleStore } from './components/rules-panels'
import { SUPPORTED_LOCALES, translateWithLocale, useI18n, type LocaleId } from './i18n'

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
  | 'edit'
  | 'close'
  | 'globe'

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  const paths: Record<IconName, ReactNode> = {
    archive: <><path d="M4 7.5h16" /><path d="M5.5 7.5 6.5 19h11l1-11.5" /><path d="M3.5 4.5h17v3h-17z" /><path d="M9 11.5h6" /></>,
    inbox: <><path d="M4 5.5h16v13H4z" /><path d="m4 14 4 0 1.5 2h5L16 14h4" /></>,
    folder: <><path d="M3.5 6.5h6l1.7 2H20.5v9.2a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8z" /><path d="M3.5 9h17" /></>,
    history: <><path d="M4.5 5.5v4h4" /><path d="M5 9a7.5 7.5 0 1 1-.2 5" /><path d="M12 8.2v4l2.6 1.5" /></>,
    settings: <><path d="M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z" /><path d="m19.4 13.5 1.1.8-1.5 2.6-1.3-.5a7.8 7.8 0 0 1-1.8 1l-.2 1.4h-3l-.2-1.4a7.8 7.8 0 0 1-1.8-1l-1.3.5-1.5-2.6 1.1-.8a7.3 7.3 0 0 1 0-2.8l-1.1-.8 1.5-2.6 1.3.5a7.8 7.8 0 0 1 1.8-1l.2-1.4h3l.2-1.4a7.8 7.8 0 0 1 1.8 1l1.3-.5 1.5 2.6-1.1.8a7.3 7.3 0 0 1 0 2.8Z" /></>,
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
    edit: <><path d="M15.5 5.5 18.5 8.5" /><path d="M5 19l3.8-.7L19.2 7.9a1.4 1.4 0 0 0 0-2l-1.1-1.1a1.4 1.4 0 0 0-2 0L5.7 15.2z" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3.6 9h16.8M3.6 15h16.8" /><path d="M12 3a14.5 14.5 0 0 0 0 18M12 3a14.5 14.5 0 0 1 0 18" /></>,
  }
  return <svg {...common}>{paths[name]}</svg>
}

type View = 'agent' | 'libraries' | 'settings'

type UiLibrary = {
  id: string
  name: string
  count: number
  color: string
  status: string
  /** 文件库根目录有「_规则.md」 */
  hasRules: boolean
  rootPath?: string
  folderDepth: number
  folders: FolderNode[]
}

type FolderNode = UiFolderNode

const demoLibraries = [
  {
    name: '项目资料', count: 248, color: 'mint', status: '可用', hasRules: true, folders: [
      { name: '2025', count: 122, has_rules: true, children: [{ name: 'Q3 品牌更新', count: 42, children: [{ name: '01 需求', count: 8 }, { name: '02 设计稿', count: 19 }, { name: '03 交付', count: 15 }] }, { name: '运营素材', count: 31 }] },
      { name: '2024', count: 86, children: [{ name: '网站改版', count: 54 }, { name: '年度复盘', count: 32 }] },
      { name: '待归档', count: 40 },
    ],
  },
  {
    name: '个人学习', count: 86, color: 'blue', status: '可用', hasRules: false, folders: [
      { name: '产品设计', count: 48, children: [{ name: '交互', count: 21 }, { name: '视觉', count: 17 }, { name: '研究方法', count: 10 }] },
      { name: '编程', count: 25, children: [{ name: 'Rust', count: 11 }, { name: '前端', count: 14 }] },
      { name: '待读', count: 13 },
    ],
  },
  {
    name: '发票与收据', count: 132, color: 'amber', status: '可用', hasRules: true, folders: [
      { name: '2025', count: 132, children: [{ name: '08 月', count: 18 }, { name: '07 月', count: 27 }, { name: '06 月', count: 22 }, { name: '01-05 月', count: 65 }] },
    ],
  },
]

function folderNodesToTreeNodes(nodes: FolderNode[], parent = '', keyPrefix = ''): FolderTreeNode[] {
  return nodes.map((node) => {
    const path = (node.path || (parent ? `${parent}/${node.name}` : node.name)).replace(/\\/g, '/')
    const value = keyPrefix ? `${keyPrefix}:${path}` : path
    return { value, label: node.name, path, kind: 'folder', count: node.count, hasRules: Boolean(node.has_rules), children: node.children?.length ? folderNodesToTreeNodes(node.children, path, keyPrefix) : undefined }
  })
}

function countSubfolders(nodes: FolderNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countSubfolders(node.children ?? []), 0)
}

function findFolderName(nodes: FolderNode[], targetPath: string, parent = ''): string | null {
  for (const node of nodes) {
    const path = (node.path || (parent ? `${parent}/${node.name}` : node.name)).replace(/\\/g, '/')
    if (path === targetPath) return node.name
    const childMatch = findFolderName(node.children ?? [], targetPath, path)
    if (childMatch) return childMatch
  }
  return null
}

function findFolderHasRules(nodes: FolderNode[], targetPath: string, parent = ''): boolean {
  for (const node of nodes) {
    const path = (node.path || (parent ? `${parent}/${node.name}` : node.name)).replace(/\\/g, '/')
    if (path === targetPath) return Boolean(node.has_rules)
    if (targetPath.startsWith(`${path}/`)) {
      return findFolderHasRules(node.children ?? [], targetPath, path)
    }
  }
  return false
}

function findSubfoldersAtPath(nodes: FolderNode[], targetPath: string, parent = ''): FolderNode[] {
  if (!targetPath) return nodes
  for (const node of nodes) {
    const path = (node.path || (parent ? `${parent}/${node.name}` : node.name)).replace(/\\/g, '/')
    if (path === targetPath) return node.children ?? []
    if (targetPath.startsWith(`${path}/`)) {
      return findSubfoldersAtPath(node.children ?? [], targetPath, path)
    }
  }
  return []
}

function demoFolderEntries(library: UiLibrary, folderPath: string): AgentEntryDto[] {
  const childDirs = findSubfoldersAtPath(library.folders, folderPath).map((child) => {
    const rel = folderPath ? `${folderPath}/${child.name}` : child.name
    return { path: `${library.name}/${rel}`, name: child.name, is_dir: true }
  })
  const baseLabel = folderPath ? folderPath.split('/').slice(-1)[0] : library.name
  const sampleFiles: AgentEntryDto[] = [
    { path: `${library.name}/${folderPath ? `${folderPath}/` : ''}2025-08_${baseLabel}_方案说明.docx`, name: `2025-08_${baseLabel}_方案说明.docx`, is_dir: false },
    { path: `${library.name}/${folderPath ? `${folderPath}/` : ''}2025-08_${baseLabel}_清单汇总.xlsx`, name: `2025-08_${baseLabel}_清单汇总.xlsx`, is_dir: false },
    { path: `${library.name}/${folderPath ? `${folderPath}/` : ''}封面素材_01.png`, name: '封面素材_01.png', is_dir: false },
  ]
  return [...childDirs, ...sampleFiles]
}

function fileTypeBadge(name: string, fallbackLabel: string): { ext: string; isImage: boolean } {
  const match = name.match(/\.([^.]+)$/)
  const ext = match ? match[1].toUpperCase() : fallbackLabel
  const isImage = ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'SVG', 'BMP'].includes(ext)
  return { ext, isImage }
}

type RuleTarget = { scope: 'global' } | { scope: 'folder'; libraryId: string; folderPath: string }

function libraryColor(index: number) {
  return ['mint', 'blue', 'amber', 'plum'][index % 4]
}

function toUiLibrary(library: LibraryDto, index = 0): UiLibrary {
  return { id: library.id, name: library.name, count: library.file_count, color: libraryColor(index), status: library.availability === 'available' ? '可用' : '不可用', hasRules: library.has_rules, rootPath: library.root_path, folderDepth: library.folder_depth, folders: [] }
}

function limitFolderDepth(nodes: FolderNode[], folderDepth: number, depth = 1): FolderNode[] {
  if (folderDepth <= 0) return nodes
  return nodes.map((node) => ({ ...node, children: depth < folderDepth ? limitFolderDepth(node.children ?? [], folderDepth, depth + 1) : [] }))
}

/** 演示模式：在内存中的目录树上标记某个文件夹是否有规则。 */
function markFolderRules(nodes: FolderNode[], target: string, hasRules: boolean, parent = ''): FolderNode[] {
  return nodes.map((node) => {
    const path = (node.path || (parent ? `${parent}/${node.name}` : node.name)).replace(/\\/g, '/')
    return { ...node, path, has_rules: path === target ? hasRules : node.has_rules, children: markFolderRules(node.children ?? [], target, hasRules, path) }
  })
}

const fallbackLibraries: UiLibrary[] = demoLibraries.map((library, index) => ({ ...library, id: `demo-${index}`, folderDepth: 0, folders: library.folders as FolderNode[] }))

function cleanOsPath(path: string) {
  return path.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '')
}

function uniqueLibraryName(baseName: string, existing: UiLibrary[], defaultName = '新文件库') {
  const used = new Set(existing.map((item) => item.name.trim().toLowerCase()))
  const clean = baseName.trim() || defaultName
  if (!used.has(clean.toLowerCase())) return clean
  let suffix = 2
  while (used.has(`${clean} ${suffix}`.toLowerCase())) suffix += 1
  return `${clean} ${suffix}`
}

function LibraryMark({ color }: { color: string }) {
  return <span className={`library-mark ${color}`} aria-hidden="true" />
}

function SidebarLibraryTree({
  libraries,
  activeLibraryId,
  onOpen,
}: {
  libraries: UiLibrary[]
  activeLibraryId: string
  activeFolder?: string
  onDoubleClick?: (libraryId: string) => void
  onOpen: (library: UiLibrary, folderPath?: string) => void
}) {
  const { t } = useI18n()
  if (!libraries.length) {
    return (
      <div className="library-list sidebar-library-tree">
        <span className="sidebar-tree-empty">{t('还没有文件库')}</span>
      </div>
    )
  }
  return (
    <div className="library-list sidebar-library-tree" role="list" aria-label={t('我的文件库')}>
      {libraries.map((library) => {
        const isActiveLib = activeLibraryId === library.id
        return (
          <button
            key={library.id}
            type="button"
            className={`library-item ${isActiveLib ? 'active' : ''}`}
            onClick={() => onOpen(library, '')}
            title={library.name}
          >
            <LibraryMark color={library.color} />
            <span className="library-item-name">{library.name}</span>
            <small>{library.count}</small>
          </button>
        )
      })}
    </div>
  )
}

function App() {
  const { t } = useI18n()
  const [view, setView] = useState<View>('agent')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('ai')
  const [ruleTarget, setRuleTarget] = useState<RuleTarget>({ scope: 'global' })
  const [libraryState, setLibraryState] = useState<UiLibrary[]>(() => isTauri() ? [] : fallbackLibraries)
  const [activeLibraryId, setActiveLibraryId] = useState('')
  const [selectedFolder, setSelectedFolder] = useState('')
  const [mode, setMode] = useState<'copy' | 'move'>(() => { try { return JSON.parse(window.localStorage.getItem('archive-desk-settings') || '{}').defaultMode === 'move' ? 'move' : 'copy' } catch { return 'copy' } })
  const [toast, setToast] = useState('')
  const libraryStateRef = useRef(libraryState)
  libraryStateRef.current = libraryState
  // 目录树的统一缓存（侧边栏、AI 分类的目标选择、文件库页共用）：已加载的深度、进行中和失败的请求。
  const loadedTreeDepthsRef = useRef<Record<string, number>>({})
  const treeRequestsRef = useRef(new Set<string>())
  const failedTreesRef = useRef(new Set<string>())
  const ruleDirtyRef = useRef(false)
  const confirmLeaveRules = () => !ruleDirtyRef.current || window.confirm(t('当前规则有未保存的修改，切换后会丢失。确定继续吗？'))

  const liveMode = isTauri()
  // AI 分类打开后保持挂载（切换页面时只隐藏），待审核的计划不会丢失。
  const agentMountedRef = useRef(false)
  if (view === 'agent') agentMountedRef.current = true

  const refreshLiveData = async (options: { reloadTrees?: boolean } = {}) => {
    if (!liveMode) return
    try {
      const rawLibraries = await call<LibraryDto[]>('list_libraries')
      setLibraryState((current) => rawLibraries.map((library, index) => {
        const previous = current.find((candidate) => candidate.id === library.id)
        return { ...toUiLibrary(library, index), folders: previous?.folderDepth === library.folder_depth ? previous.folders : [] }
      }))
      if (options.reloadTrees) {
        // 整理、撤销会改变文件夹内容，已加载的目录树计数需要刷新。
        Object.keys(loadedTreeDepthsRef.current).forEach((libraryId) => { void loadLibraryTree(libraryId, { force: true }) })
      }
    } catch (error) {
      setToast(errorMessage(error, t('读取本地数据失败')))
    }
  }

  useEffect(() => { void refreshLiveData() }, [liveMode])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const loadLibraryTree = async (libraryId: string, options: { force?: boolean; retryFailed?: boolean } = {}) => {
    if (!liveMode) return
    const library = libraryStateRef.current.find((candidate) => candidate.id === libraryId)
    if (!library || library.status !== '可用') return
    const depth = library.folderDepth
    const requestKey = `${libraryId}:${depth}`
    if (!options.force && loadedTreeDepthsRef.current[libraryId] === depth) return
    // 自动加载不会重试失败的目录（避免请求循环）；用户的明确操作可以重试。
    if (!options.force && !options.retryFailed && failedTreesRef.current.has(requestKey)) return
    if (treeRequestsRef.current.has(requestKey)) return
    treeRequestsRef.current.add(requestKey)
    try {
      const tree = await call<FolderNodeDto[]>('get_library_tree', { libraryId })
      loadedTreeDepthsRef.current[libraryId] = depth
      failedTreesRef.current.delete(requestKey)
      setLibraryState((current) => current.map((candidate) => candidate.id === libraryId && candidate.folderDepth === depth ? { ...candidate, folders: folderTreeToUi(tree) } : candidate))
    } catch (error) {
      failedTreesRef.current.add(requestKey)
      setToast(errorMessage(error, t('读取目录失败')))
    } finally {
      treeRequestsRef.current.delete(requestKey)
    }
  }

  const markTreeLoaded = (libraryId: string, depth: number) => {
    loadedTreeDepthsRef.current[libraryId] = depth
    failedTreesRef.current.delete(`${libraryId}:${depth}`)
  }

  const switchView = (next: View) => {
    if (next === view || !confirmLeaveRules()) return
    setView(next)
  }

  const openLibrary = (libraryId: string, folderPath = '') => {
    const resolvedCurrentId = activeLibraryId || libraryState[0]?.id || ''
    if ((view !== 'libraries' || resolvedCurrentId !== libraryId || selectedFolder !== folderPath) && !confirmLeaveRules()) return
    setActiveLibraryId(libraryId)
    setSelectedFolder(folderPath)
    setView('libraries')
  }

  const openRuleSettings = (target?: RuleTarget) => {
    if (!confirmLeaveRules()) return
    if (target) {
      setRuleTarget(target)
      if (target.scope === 'folder') {
        void loadLibraryTree(target.libraryId)
      }
    }
    setSettingsSection('rules')
    setView('settings')
  }

  const addLibrary = async () => {
    if (!confirmLeaveRules()) return
    if (!liveMode) {
      setView('libraries')
      setToast(t('请在桌面应用中选择本地文件夹'))
      return
    }
    const root = await pickFolder()
    if (!root) return
    const rawName = root.replace(/\\/g, '/').split('/').filter(Boolean).slice(-1)[0] || t('新文件库')
    const name = uniqueLibraryName(rawName, libraryStateRef.current, t('新文件库'))
    try {
      const created = await call<LibraryDto>('create_library', { name, rootPath: root, purpose: '', folderDepth: 0 })
      setLibraryState((prev) => [...prev, { ...toUiLibrary(created, prev.length), folders: [] }])
      setActiveLibraryId(created.id)
      setSelectedFolder('')
      setView('libraries')
      setToast(created.has_rules ? t('已添加文件库：{name}（已读取根目录规则）', { name }) : t('已添加文件库：{name}，可点击「配置规则」设置分类要求', { name }))
    } catch (error) {
      setToast(errorMessage(error, t('添加文件库失败')))
    }
  }

  const resolvedActiveLibraryId = view === 'libraries' ? (libraryState.find((item) => item.id === activeLibraryId)?.id ?? libraryState[0]?.id ?? '') : ''

  const nav = [
    { id: 'agent' as View, label: t('AI 分类'), icon: 'spark' as IconName },
    { id: 'libraries' as View, label: t('文件库'), icon: 'folder' as IconName },
    { id: 'settings' as View, label: t('设置'), icon: 'settings' as IconName },
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <nav className="primary-nav" aria-label={t('主导航')}>
          {nav.map((item) => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => switchView(item.id)} aria-label={item.label} title={item.label}>
            <Icon name={item.icon} size={18} /><span>{item.label}</span>
          </button>)}
        </nav>
        <div className="library-section">
          <div className="section-label"><span>{t('我的文件库')}</span><button aria-label={t('添加文件库')} title={t('添加文件库')} onClick={() => { void addLibrary() }}><Icon name="plus" size={15} /></button></div>
          <SidebarLibraryTree libraries={libraryState} activeLibraryId={resolvedActiveLibraryId} activeFolder={view === 'libraries' ? selectedFolder : ''} onDoubleClick={(libraryId) => { void loadLibraryTree(libraryId, { retryFailed: true }) }} onOpen={(library, folderPath = '') => openLibrary(library.id, folderPath)} />
        </div>
      </aside>

      <main className="main-area">
        {agentMountedRef.current && <div className="agent-host" hidden={view !== 'agent'}><AgentView active={view === 'agent'} libraries={libraryState} defaultMode={mode} setToast={setToast} onNeedTree={(libraryId) => { void loadLibraryTree(libraryId) }} onExecuted={() => { void refreshLiveData({ reloadTrees: true }) }} onOpenSettings={() => switchView('settings')} onOpenLibraries={() => switchView('libraries')} /></div>}
        {view === 'libraries' && <LibrariesView libraries={libraryState} setLibraryState={setLibraryState} setToast={setToast} activeId={activeLibraryId} selectedFolder={selectedFolder} setSelectedFolder={setSelectedFolder} onAddLibrary={() => { void addLibrary() }} onNeedTree={(libraryId) => { void loadLibraryTree(libraryId) }} onTreeLoaded={markTreeLoaded} onChanged={() => { void refreshLiveData() }} onOpenRules={(libraryId, folderPath) => openRuleSettings({ scope: 'folder', libraryId, folderPath })} onOpenAgent={() => switchView('agent')} />}
        {view === 'settings' && <SettingsView section={settingsSection} setSection={setSettingsSection} ruleTarget={ruleTarget} setRuleTarget={setRuleTarget} libraries={libraryState} setLibraryState={setLibraryState} setToast={setToast} onDefaultModeChange={setMode} onRuleDirtyChange={(dirty) => { ruleDirtyRef.current = dirty }} confirmLeaveRules={confirmLeaveRules} onNeedTree={(libraryId) => { void loadLibraryTree(libraryId) }} onReloadTree={(libraryId) => { void loadLibraryTree(libraryId, { force: true }) }} onAddLibrary={() => { void addLibrary() }} onOpenAgent={() => switchView('agent')} />}
      </main>
      {toast && <div className="toast" role="status"><span className="toast-icon"><Icon name="check" size={15} /></span>{toast}<button onClick={() => setToast('')} aria-label={t('关闭提示')}><Icon name="close" size={14} /></button></div>}
    </div>
  )
}

type LibrariesViewProps = {
  libraries: UiLibrary[]
  setLibraryState: Dispatch<SetStateAction<UiLibrary[]>>
  setToast: (message: string) => void
  activeId: string
  selectedFolder: string
  setSelectedFolder: (folderPath: string) => void
  onAddLibrary: () => void
  onNeedTree: (libraryId: string) => void
  onTreeLoaded: (libraryId: string, depth: number) => void
  onChanged: () => void
  onOpenRules: (libraryId: string, folderPath: string) => void
  onOpenAgent: () => void
}

function LibrariesView({
  libraries,
  setLibraryState,
  setToast,
  activeId,
  selectedFolder,
  setSelectedFolder,
  onAddLibrary,
  onNeedTree,
  onTreeLoaded,
  onChanged,
  onOpenRules,
  onOpenAgent,
}: LibrariesViewProps) {
  const { t } = useI18n()
  const live = isTauri()
  const current = libraries.find((library) => library.id === activeId) ?? libraries[0]
  const [depthDraft, setDepthDraft] = useState(current?.folderDepth ?? 0)
  const [depthOpen, setDepthOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [creatingFolder, setCreatingFolder] = useState<{ parentPath: string; parentLabel: string } | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [entries, setEntries] = useState<AgentEntryDto[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [entriesError, setEntriesError] = useState('')
  const [fileQuery, setFileQuery] = useState('')

  const depthWrapRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDepthDraft(current?.folderDepth ?? 0)
    setDepthOpen(false)
    setIsRenaming(false)
    setCreatingFolder(null)
    setFileQuery('')
  }, [current?.id, current?.folderDepth])

  useEffect(() => {
    setFileQuery('')
  }, [selectedFolder])

  useEffect(() => {
    if (current && current.status === '可用' && !current.folders.length) onNeedTree(current.id)
  }, [current?.id, current?.status, current?.folderDepth, current?.folders.length])

  const loadFolderEntries = async () => {
    if (!current || current.status !== '可用') {
      setEntries([])
      setEntriesError('')
      return
    }
    if (!live) {
      setEntries(demoFolderEntries(current, selectedFolder))
      setEntriesError('')
      return
    }
    if (!current.rootPath) return
    const baseRoot = cleanOsPath(current.rootPath).replace(/[\\/]+$/, '')
    const targetPath = selectedFolder ? `${baseRoot}\\${selectedFolder.replace(/\//g, '\\')}` : baseRoot
    setLoadingEntries(true)
    setEntriesError('')
    try {
      const list = await call<AgentEntryDto[]>('agent_list_folder_entries', { path: targetPath })
      setEntries(list)
    } catch (error) {
      setEntries([])
      setEntriesError(errorMessage(error, t('读取文件夹内容失败')))
    } finally {
      setLoadingEntries(false)
    }
  }

  useEffect(() => {
    void loadFolderEntries()
  }, [current?.id, current?.status, current?.rootPath, selectedFolder, current?.folders.length])

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [isRenaming])

  useEffect(() => {
    if (creatingFolder) {
      folderInputRef.current?.focus()
      folderInputRef.current?.select()
    }
  }, [creatingFolder])

  useEffect(() => {
    if (!depthOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (depthWrapRef.current && !depthWrapRef.current.contains(event.target as Node)) setDepthOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDepthOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [depthOpen])

  const selectFolder = (nextPath: string) => {
    if (nextPath === selectedFolder) return
    setSelectedFolder(nextPath)
  }

  const startRename = () => {
    if (!current) return
    setRenameDraft(current.name)
    setIsRenaming(true)
  }

  const submitRename = async () => {
    if (!current) return
    const name = renameDraft.trim()
    if (!name) { setToast(t('文件库名称不能为空')); return }
    if (name === current.name) { setIsRenaming(false); return }
    if (!live) {
      setLibraryState((prev) => prev.map((library) => library.id === current.id ? { ...library, name } : library))
      setIsRenaming(false)
      setToast(t('文件库名称已更新'))
      return
    }
    try {
      const updated = await call<LibraryDto>('update_library', { libraryId: current.id, name, folderDepth: current.folderDepth })
      setLibraryState((prev) => prev.map((library, index) => library.id === current.id ? { ...toUiLibrary(updated, index), color: library.color, folders: library.folders } : library))
      setIsRenaming(false)
      setToast(t('文件库名称已更新'))
      onChanged()
    } catch (error) { setToast(errorMessage(error, t('修改名称失败'))) }
  }

  const relocateLibrary = async () => {
    if (!current) return
    if (!live) {
      setToast(t('请在桌面应用中选择本地文件夹'))
      return
    }
    const root = await pickFolder()
    if (!root) return
    try {
      const targetId = current.id
      const updated = await call<LibraryDto>('update_library', {
        libraryId: targetId,
        name: current.name,
        folderDepth: current.folderDepth,
        rootPath: root,
      })
      const tree = await call<FolderNodeDto[]>('get_library_tree', { libraryId: targetId })
      onTreeLoaded(targetId, updated.folder_depth)
      setLibraryState((prev) =>
        prev.map((library, index) =>
          library.id === targetId
            ? { ...toUiLibrary(updated, index), color: library.color, folders: folderTreeToUi(tree) }
            : library,
        ),
      )
      setSelectedFolder('')
      setEntriesError('')
      setToast(t('已更新文件库位置：{path}', { path: cleanOsPath(updated.root_path) }))
      onChanged()
    } catch (error) {
      setToast(errorMessage(error, t('修改文件库位置失败')))
    }
  }

  const saveFolderDepth = async (overrideDepth?: number) => {
    if (!current) return
    const nextDepth = Number(overrideDepth ?? depthDraft)
    if (!Number.isInteger(nextDepth) || nextDepth < 0 || nextDepth > 20) { setToast(t('目录展示深度请输入 0 到 20 之间的整数')); return }
    if (!live) {
      setLibraryState((prev) => prev.map((library) => library.id === current.id ? { ...library, folderDepth: nextDepth } : library))
      setDepthOpen(false)
      setToast(t('目录展示深度已更新'))
      return
    }
    try {
      const targetId = current.id
      const updated = await call<LibraryDto>('update_library', { libraryId: targetId, name: current.name, folderDepth: nextDepth })
      const tree = await call<FolderNodeDto[]>('get_library_tree', { libraryId: targetId })
      onTreeLoaded(targetId, nextDepth)
      setLibraryState((prev) => prev.map((library, index) => library.id === targetId ? { ...toUiLibrary(updated, index), color: library.color, folders: folderTreeToUi(tree) } : library))
      setDepthOpen(false)
      setToast(t('目录展示深度已更新'))
    } catch (error) { setToast(errorMessage(error, t('保存目录展示深度失败'))) }
  }

  const startCreateFolder = (parentPath = '', parentLabel = current?.name || t('文件库')) => {
    setCreatingFolder({ parentPath, parentLabel })
    setNewFolderName('')
  }

  const submitCreateFolder = async () => {
    if (!current || !creatingFolder) return
    const { parentPath } = creatingFolder
    const name = newFolderName.trim()
    if (!name) { setToast(t('请输入文件夹名称')); return }
    if (name === '.' || name === '..' || name.includes('/') || name.includes('\\')) { setToast(t('文件夹名称不能包含路径分隔符')); return }
    if (name === RULE_FILE_NAME) { setToast(`"${RULE_FILE_NAME}"`); return }
    if (!live) {
      const newNode: FolderNode = { name, path: parentPath ? `${parentPath}/${name}` : name, count: 0, children: [] }
      let duplicate = false
      const append = (nodes: FolderNode[], parent = ''): FolderNode[] => nodes.map((node) => {
        const nodePath = (node.path || (parent ? `${parent}/${node.name}` : node.name)).replace(/\\/g, '/')
        const children = node.children ?? []
        if (nodePath === parentPath) {
          if (children.some((child) => child.name === name)) { duplicate = true; return node }
          return { ...node, path: nodePath, children: [...children, newNode] }
        }
        return { ...node, path: nodePath, children: append(children, nodePath) }
      })
      if (!parentPath && current.folders.some((child) => child.name === name)) { setToast(t('同名文件夹已存在')); return }
      const folders = parentPath ? append(current.folders) : [...current.folders, newNode]
      if (duplicate) { setToast(t('同名文件夹已存在')); return }
      setLibraryState((prev) => prev.map((library) => library.id === current.id ? { ...library, folders } : library))
      setCreatingFolder(null)
      setNewFolderName('')
      setSelectedFolder(newNode.path)
      setToast(t('已创建文件夹：{name}', { name }))
      return
    }
    try {
      const targetId = current.id
      const tree = await call<FolderNodeDto[]>('create_library_folder', { libraryId: targetId, parentPath, name })
      setLibraryState((prev) => prev.map((library) => library.id === targetId ? { ...library, folders: folderTreeToUi(tree) } : library))
      onTreeLoaded(targetId, current.folderDepth)
      const createdPath = parentPath ? `${parentPath}/${name}` : name
      setCreatingFolder(null)
      setNewFolderName('')
      setSelectedFolder(createdPath)
      setToast(t('已创建文件夹：{name}', { name }))
    } catch (error) { setToast(errorMessage(error, t('创建文件夹失败'))) }
  }

  if (!current) {
    return (
      <div className="libraries-page libraries-empty-page">
        <div className="libraries-empty-card">
          <span className="libraries-empty-icon"><Icon name="folder" size={24} /></span>
          <h1>{t('添加第一个文件库')}</h1>
          <p>{t('选择一个本机文件夹作为归档目标，在这里浏览库内文件，或前往「设置 → 规则」配置分类规则。')}</p>
          <Button size="lg" onClick={onAddLibrary}><Icon name="plus" size={17} />{t('添加文件库')}</Button>
        </div>
      </div>
    )
  }

  const folderPath = selectedFolder
  const displayedFolders = limitFolderDepth(current.folders, current.folderDepth)
  const subfolderCount = countSubfolders(current.folders)
  const cleanedRootPath = current.rootPath ? cleanOsPath(current.rootPath) : ''
  const selectedFolderName = folderPath ? (findFolderName(current.folders, folderPath) ?? folderPath.split('/').slice(-1)[0]) : current.name
  const currentHasRules = folderPath ? findFolderHasRules(current.folders, folderPath) : current.hasRules
  const currentTargetOsPath = cleanedRootPath
    ? (folderPath ? `${cleanedRootPath.replace(/[\\/]+$/, '')}\\${folderPath.replace(/\//g, '\\')}` : cleanedRootPath)
    : ''
  const parentFolderPath = folderPath.includes('/') ? folderPath.slice(0, folderPath.lastIndexOf('/')) : ''
  const parentFolderLabel = parentFolderPath ? parentFolderPath.split('/').slice(-1)[0] : current.name

  const filteredEntries = fileQuery.trim()
    ? entries.filter((entry) => entry.name.toLowerCase().includes(fileQuery.trim().toLowerCase()))
    : entries
  const dirCount = entries.filter((entry) => entry.is_dir).length
  const fileCount = entries.filter((entry) => !entry.is_dir).length

  return (
    <div className="libraries-page">
      <header className="library-topbar">
        <div className="library-identity">
          <span className="large-library-mark"><LibraryMark color={current.color} /></span>
          <div className="library-identity-main">
            <div className="library-title-line">
              {isRenaming ? (
                <form className="inline-rename-form" onSubmit={(event) => { event.preventDefault(); void submitRename() }}>
                  <input
                    ref={renameInputRef}
                    className="inline-rename-input"
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Escape') setIsRenaming(false) }}
                    aria-label={t('文件库名称')}
                  />
                  <Button size="sm" type="submit">{t('保存')}</Button>
                  <Button variant="ghost" size="sm" type="button" onClick={() => setIsRenaming(false)}>{t('取消')}</Button>
                </form>
              ) : (
                <>
                  <h1>{current.name}</h1>
                  <span className={`available-pill ${current.status !== '可用' ? 'unavailable' : ''}`}><i />{t(current.status)}</span>
                  <button type="button" className="inline-rename-btn" onClick={startRename} title={t('修改文件库名称')}>
                    <Icon name="edit" size={13} /><span>{t('改名')}</span>
                  </button>
                  <button type="button" className="inline-rename-btn" onClick={() => { void relocateLibrary() }} title={t('修改文件库对应的本地文件夹位置')}>
                    <Icon name="folder" size={13} /><span>{t('修改位置')}</span>
                  </button>
                </>
              )}
            </div>
            <div className="library-meta-line">
              {cleanedRootPath ? (
                live ? (
                  <button
                    type="button"
                    className="library-path-link"
                    title={cleanedRootPath}
                    onClick={() => { void revealPath(current.rootPath!).catch((error) => setToast(errorMessage(error, t('打开文件夹失败')))) }}
                  >
                    <Icon name="folder" size={13} />
                    <span>{cleanedRootPath}</span>
                    <Icon name="external" size={11} />
                  </button>
                ) : (
                  <span className="library-path-text" title={cleanedRootPath}><Icon name="folder" size={13} /><span>{cleanedRootPath}</span></span>
                )
              ) : (
                <span className="library-path-text"><Icon name="folder" size={13} /><span>{t('演示数据')}</span></span>
              )}
              <span className="library-meta-dot" aria-hidden="true">·</span>
              <span>{t('{count} 个文件', { count: current.count })}</span>
              <span className="library-meta-dot" aria-hidden="true">·</span>
              <span>{subfolderCount > 0 ? t('{count} 个子文件夹', { count: subfolderCount }) : t('暂无子文件夹')}</span>
            </div>
          </div>
        </div>

        <div className="library-topbar-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenRules(current.id, folderPath)}
            title={t('前往「设置 → 规则」修改当前文件库或文件夹的分类规则')}
          >
            <Icon name="file" size={14} />{t('配置规则')}
          </Button>
          <div className="depth-popover-wrap" ref={depthWrapRef}>
            <button
              type="button"
              className={`depth-trigger ${depthOpen ? 'open' : ''}`}
              onClick={() => setDepthOpen((open) => !open)}
              aria-expanded={depthOpen}
              title={t('调整目录树展示的文件夹层级深度')}
            >
              <Icon name="sliders" size={14} />
              <span>{current.folderDepth > 0 ? t('展示 {depth} 层', { depth: current.folderDepth }) : t('全部层级')}</span>
            </button>
            {depthOpen && (
              <div className="depth-popover" role="dialog" aria-label={t('目录展示深度设置')}>
                <div className="depth-popover-title">{t('目录展示深度')}</div>
                <p className="depth-popover-desc">{t('只控制左侧目录树显示的文件夹层级，不影响分类规则。')}</p>
                <div className="depth-presets">
                  {[0, 1, 2, 3].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={depthDraft === preset ? 'active' : ''}
                      onClick={() => { setDepthDraft(preset); void saveFolderDepth(preset) }}
                    >
                      {preset === 0 ? t('全部') : t('{preset} 层', { preset })}
                    </button>
                  ))}
                </div>
                <div className="depth-custom">
                  <label>
                    <span>{t('自定义层数 (0–20)')}</span>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      step="1"
                      value={depthDraft}
                      onChange={(event) => setDepthDraft(Number(event.target.value))}
                    />
                  </label>
                  <Button size="sm" variant="outline" onClick={() => void saveFolderDepth()}>{t('应用')}</Button>
                </div>
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onAddLibrary}><Icon name="plus" size={15} />{t('添加文件库')}</Button>
        </div>
      </header>

      <div className="libraries-workbench">
        <aside className="tree-pane" aria-label={t('文件夹目录')}>
          <div className="tree-pane-head">
            <h2>{t('文件夹目录')}</h2>
            <button
              type="button"
              className="tree-add-root"
              onClick={() => startCreateFolder(folderPath, selectedFolderName)}
              title={folderPath ? t('在「{name}」下新建子文件夹', { name: selectedFolderName }) : t('在「{name}」根目录新建子文件夹', { name: current.name })}
            >
              <Icon name="plus" size={13} />{t('新建文件夹')}
            </button>
          </div>

          {creatingFolder && (
            <form className="inline-folder-form" onSubmit={(event) => { event.preventDefault(); void submitCreateFolder() }}>
              <div className="inline-folder-label">{t('在')} <strong>{creatingFolder.parentLabel}</strong> {t('下新建')}</div>
              <div className="inline-folder-row">
                <input
                  ref={folderInputRef}
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Escape') setCreatingFolder(null) }}
                  placeholder={t('输入文件夹名称')}
                  aria-label={t('新文件夹名称')}
                />
                <Button size="sm" type="submit" className="inline-folder-submit">{t('创建')}</Button>
                <button type="button" className="inline-folder-cancel" onClick={() => setCreatingFolder(null)} aria-label={t('取消新建文件夹')} title={t('取消')}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            </form>
          )}

          <div className="tree-pane-body">
            <div
              className={`rules-tree-row root-row ${selectedFolder === '' ? 'selected' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => selectFolder('')}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectFolder('') } }}
            >
              <span className="rules-tree-folder root"><Icon name="archive" size={14} /></span>
              <span className="rules-tree-name">{current.name}</span>
              <span className="rules-tree-root-tag">{t('根目录')}</span>
              {current.hasRules && (
                <button
                  type="button"
                  className="rules-tree-mark clickable"
                  title={t('点击前往「设置 → 规则」编辑根目录规则')}
                  onClick={(event) => { event.stopPropagation(); onOpenRules(current.id, '') }}
                >
                  <Icon name="file" size={10} />{t('规则')}
                </button>
              )}
              <button
                type="button"
                className="rules-tree-add"
                title={t('在{name}下新建文件夹', { name: current.name })}
                aria-label={t('在{name}下新建文件夹', { name: current.name })}
                onClick={(event) => { event.stopPropagation(); startCreateFolder('', current.name) }}
              >
                <Icon name="plus" size={12} />
              </button>
            </div>

            {displayedFolders.length ? (
              <SharedFolderTree
                nodes={folderNodesToTreeNodes(displayedFolders)}
                className="folder-tree"
                nodeClassName="folder-tree-node"
                renderRow={({ node, depth, isExpanded, hasChildren, path, toggle }) => (
                  <div
                    className={`rules-tree-row ${selectedFolder === path ? 'selected' : ''}`}
                    style={{ paddingLeft: `${12 + depth * 15}px` }}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectFolder(path)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectFolder(path) } }}
                  >
                    <span data-tree-expander className={`rules-tree-expander ${hasChildren && isExpanded ? 'open' : ''}`} onClick={(event) => { event.stopPropagation(); if (hasChildren) toggle() }}>
                      {hasChildren ? <Icon name="chevron" size={12} /> : null}
                    </span>
                    <span className="rules-tree-folder"><Icon name="folder" size={14} /></span>
                    <span className="rules-tree-name" title={path}>{node.label}</span>
                    {node.hasRules && (
                      <button
                        type="button"
                        className="rules-tree-mark clickable"
                        title={t('点击前往「设置 → 规则」编辑此文件夹规则')}
                        onClick={(event) => { event.stopPropagation(); onOpenRules(current.id, path) }}
                      >
                        <Icon name="file" size={10} />{t('规则')}
                      </button>
                    )}
                    <small>{node.count}</small>
                    <button
                      type="button"
                      className="rules-tree-add"
                      title={t('在{name}下新建文件夹', { name: node.label })}
                      aria-label={t('在{name}下新建文件夹', { name: node.label })}
                      onClick={(event) => { event.stopPropagation(); startCreateFolder(path, node.label) }}
                      onDoubleClick={(event) => event.stopPropagation()}
                    >
                      <Icon name="plus" size={12} />
                    </button>
                  </div>
                )}
              />
            ) : (
              <div className="rules-tree-empty">
                <p>{t('暂无子文件夹')}</p>
              </div>
            )}
          </div>
        </aside>

        <div className="files-pane">
          {current.status !== '可用' ? (
            <div className="rule-unavailable-wrap">
              <div className="rule-unavailable">
                <strong>{t('文件夹当前不可访问')}</strong>
                <p>{t('无法读取路径「{path}」。如果文件夹已移动，可修改位置重新关联；若在移动硬盘上，请连接后刷新重试。', { path: cleanedRootPath || current.rootPath || '' })}</p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <Button size="sm" onClick={() => { void relocateLibrary() }}><Icon name="folder" size={14} />{t('修改位置')}</Button>
                  <Button variant="outline" size="sm" onClick={onChanged}><Icon name="refresh" size={14} />{t('重新检查')}</Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="files-pane-head">
                <div className="files-pane-title">
                  <span className="files-pane-icon"><Icon name="folder" size={16} /></span>
                  <div className="files-pane-title-text">
                    <h3>
                      <span>{folderPath ? `${current.name} / ${folderPath}` : t('{name}（根目录）', { name: current.name })}</span>
                      <Badge variant="neutral" className="rule-badge">
                        {dirCount ? t('{dirs} 个文件夹 · {files} 个文件', { dirs: dirCount, files: fileCount }) : t('{count} 个文件', { count: fileCount })}
                      </Badge>
                      {currentHasRules && <Badge className="rule-badge">{t('已设规则')}</Badge>}
                    </h3>
                  </div>
                </div>

                <div className="files-pane-tools">
                  {entries.length > 5 && (
                    <div className="files-search-box">
                      <Icon name="search" size={13} />
                      <input
                        type="search"
                        value={fileQuery}
                        onChange={(event) => setFileQuery(event.target.value)}
                        placeholder={t('搜索当前目录…')}
                        aria-label={t('搜索当前目录文件')}
                      />
                    </div>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => void loadFolderEntries()} disabled={loadingEntries}>
                    <Icon name="refresh" size={14} />{t('刷新')}
                  </Button>
                  {live && currentTargetOsPath && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { void revealPath(currentTargetOsPath).catch((error) => setToast(errorMessage(error, t('打开文件夹失败')))) }}
                    >
                      <Icon name="external" size={14} />{t('打开目录')}
                    </Button>
                  )}
                </div>
              </div>

              <div className="files-pane-body">
                {folderPath && (
                  <button
                    type="button"
                    className="file-entry-row parent-row"
                    onClick={() => selectFolder(parentFolderPath)}
                  >
                    <span className="file-entry-icon folder"><Icon name="folder" size={15} /></span>
                    <span className="file-entry-name">{t('.. 返回上一级（{name}）', { name: parentFolderLabel })}</span>
                  </button>
                )}

                {entriesError && (
                  <div className="rule-editor-error" role="alert">
                    <Icon name="info" size={15} />
                    <span style={{ flex: 1 }}>{entriesError}</span>
                    <Button variant="outline" size="sm" onClick={() => { void relocateLibrary() }}>
                      <Icon name="folder" size={13} />{t('修改位置')}
                    </Button>
                  </div>
                )}

                {loadingEntries ? (
                  <div className="files-empty-state">
                    <span>{t('正在读取目录内容…')}</span>
                  </div>
                ) : filteredEntries.length > 0 ? (
                  <div className="files-entry-list" role="list">
                    {filteredEntries.map((entry) => {
                      if (entry.is_dir) {
                        const childRelPath = folderPath ? `${folderPath}/${entry.name}` : entry.name
                        const childHasRules = findFolderHasRules(current.folders, childRelPath)
                        return (
                          <div
                            key={entry.path}
                            role="listitem"
                            className="file-entry-row is-dir"
                            onClick={() => selectFolder(childRelPath)}
                          >
                            <span className="file-entry-icon folder"><Icon name="folder" size={15} /></span>
                            <span className="file-entry-name" title={entry.path}>{entry.name}</span>
                            {childHasRules && <span className="rules-tree-mark"><Icon name="file" size={10} />{t('规则')}</span>}
                            <Badge variant="neutral" className="file-type-tag">{t('文件夹')}</Badge>
                            <div className="file-entry-actions" onClick={(event) => event.stopPropagation()}>
                              <button
                                type="button"
                                className="file-action-btn"
                                onClick={() => onOpenRules(current.id, childRelPath)}
                                title={t('前往「设置 → 规则」编辑此文件夹规则')}
                              >
                                <Icon name="file" size={12} />{t('规则')}
                              </button>
                              {live && (
                                <button
                                  type="button"
                                  className="file-action-btn"
                                  onClick={() => { void revealPath(entry.path).catch((error) => setToast(errorMessage(error, t('打开失败')))) }}
                                  title={t('在资源管理器中显示')}
                                >
                                  <Icon name="external" size={12} />{t('定位')}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      }
                      const { ext, isImage } = fileTypeBadge(entry.name, t('文件'))
                      return (
                        <div key={entry.path} role="listitem" className="file-entry-row">
                          <span className={`file-entry-icon ${isImage ? 'image' : 'file'}`}>
                            <Icon name={isImage ? 'image' : 'file'} size={15} />
                          </span>
                          <span className="file-entry-name" title={entry.path}>{entry.name}</span>
                          <Badge variant="outline" className="file-type-tag">{ext}</Badge>
                          <div className="file-entry-actions">
                            {live && (
                              <button
                                type="button"
                                className="file-action-btn"
                                onClick={() => { void revealPath(entry.path).catch((error) => setToast(errorMessage(error, t('定位文件失败')))) }}
                                title={t('在资源管理器中显示该文件')}
                              >
                                <Icon name="external" size={12} />{t('定位')}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="files-empty-state">
                    <span className="files-empty-icon"><Icon name="folder" size={22} /></span>
                    <strong>{fileQuery.trim() ? t('没有匹配的文件') : t('当前文件夹为空')}</strong>
                    {!fileQuery.trim() && (
                      <div className="files-empty-actions">
                        <Button size="sm" onClick={onOpenAgent}>
                          <Icon name="spark" size={14} />{t('去 AI 分类整理文件')}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

type AiProtocolId = 'openai' | 'anthropic' | 'gemini' | 'ollama'

const AI_PROTOCOLS: Array<{
  id: AiProtocolId
  label: string
  endpoint: string
  model: string
  keyPlaceholder: string
  local?: boolean
}> = [
  {
    id: 'openai',
    label: 'OpenAI 兼容',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    keyPlaceholder: '粘贴 sk-... 密钥',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    endpoint: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-0',
    keyPlaceholder: '粘贴 sk-ant-... 密钥',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    keyPlaceholder: '粘贴 AIza... 密钥',
  },
  {
    id: 'ollama',
    label: '本地 Ollama',
    endpoint: 'http://localhost:11434/v1',
    model: 'qwen2.5:7b',
    keyPlaceholder: '本地服务无需密钥，保持留空即可',
    local: true,
  },
]

function inferProtocolFromEndpoint(endpoint: string, savedProtocol?: string): AiProtocolId {
  if (savedProtocol === 'openai' || savedProtocol === 'anthropic' || savedProtocol === 'gemini' || savedProtocol === 'ollama') {
    return savedProtocol
  }
  const lower = endpoint.trim().toLowerCase()
  if (lower.includes('anthropic.com') || lower.endsWith('/messages')) return 'anthropic'
  if (lower.includes('generativelanguage.googleapis.com') || lower.includes(':generatecontent')) return 'gemini'
  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(\b|:|\/)/i.test(lower)) return 'ollama'
  return 'openai'
}

const GLOBAL_RULE_PLACEHOLDER = '填写所有文件库通用的底线约定（如排除临时文件、统一命名格式等）。'

type SettingsSection = 'ai' | 'rules' | 'general' | 'logs'

function SettingsView({
  section,
  setSection,
  ruleTarget,
  setRuleTarget,
  libraries,
  setLibraryState,
  setToast,
  onDefaultModeChange,
  onRuleDirtyChange,
  confirmLeaveRules,
  onNeedTree,
  onReloadTree,
  onAddLibrary,
  onOpenAgent,
}: {
  section: SettingsSection
  setSection: (section: SettingsSection) => void
  ruleTarget: RuleTarget
  setRuleTarget: (target: RuleTarget) => void
  libraries: UiLibrary[]
  setLibraryState: Dispatch<SetStateAction<UiLibrary[]>>
  setToast: (message: string) => void
  onDefaultModeChange: (mode: 'copy' | 'move') => void
  onRuleDirtyChange: (dirty: boolean) => void
  confirmLeaveRules: () => boolean
  onNeedTree: (libraryId: string) => void
  onReloadTree: (libraryId: string) => void
  onAddLibrary: () => void
  onOpenAgent: () => void
}) {
  const { locale, setLocale, t } = useI18n()
  const live = isTauri()
  const readStored = () => {
    try { return JSON.parse(window.localStorage.getItem('archive-desk-settings') || '{}') as Record<string, unknown> }
    catch { return {} }
  }
  const [defaultMode, setDefaultMode] = useState<'copy' | 'move'>(() => readStored().defaultMode === 'move' ? 'move' : 'copy')
  const [protocol, setProtocol] = useState<AiProtocolId>(() => {
    const stored = readStored().protocol
    return stored === 'anthropic' || stored === 'gemini' || stored === 'ollama' ? stored : 'openai'
  })
  const [endpoint, setEndpoint] = useState(() => {
    const stored = readStored().endpoint
    return typeof stored === 'string' && stored.trim() ? stored : 'https://api.openai.com/v1'
  })
  const [model, setModel] = useState(() => {
    const stored = readStored().model
    return typeof stored === 'string' && stored.trim() ? stored : 'gpt-4.1-mini'
  })
  const [apiKey, setApiKey] = useState(() => {
    const stored = readStored().apiKey
    return typeof stored === 'string' ? stored : ''
  })
  const [hasApiKey, setHasApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [connStatus, setConnStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [globalExists, setGlobalExists] = useState(() => demoRuleStore.has('global'))
  const [requestLogs, setRequestLogs] = useState<AiRequestLogDto[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [logsOnlyFailed, setLogsOnlyFailed] = useState(false)
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({})

  const loadRequestLogs = async () => {
    if (!live) return
    setLoadingLogs(true)
    try {
      const list = await call<AiRequestLogDto[]>('list_ai_request_logs')
      setRequestLogs(list)
      setExpandedLogIds((prev) => {
        const next = { ...prev }
        // 默认展开最新一条或最近失败的日志
        if (list.length > 0 && Object.keys(next).length === 0) {
          const firstFailed = list.find((item) => !item.ok)
          next[(firstFailed ?? list[0]).id] = true
        }
        return next
      })
    } catch (error) {
      setToast(errorMessage(error, t('读取 AI 请求日志失败')))
    } finally {
      setLoadingLogs(false)
    }
  }

  const clearRequestLogs = async () => {
    if (!live) {
      setRequestLogs([])
      setExpandedLogIds({})
      setToast(t('已清空请求日志'))
      return
    }
    try {
      await call<void>('clear_ai_request_logs')
      setRequestLogs([])
      setExpandedLogIds({})
      setToast(t('已清空全部 AI 请求日志'))
    } catch (error) {
      setToast(errorMessage(error, t('清空请求日志失败')))
    }
  }

  const globalDoc = (): RuleDocDto => ({
    scope: 'global',
    library_id: null,
    folder_path: '',
    path: '总说明.md',
    exists: demoRuleStore.has('global'),
    content: demoRuleStore.get('global') ?? '',
    error: null,
  })
  const loadGlobal = async (): Promise<RuleDocDto> => {
    if (!live) return globalDoc()
    const doc = await call<RuleDocDto>('rules_get_global')
    if (!doc.exists && !doc.content.trim() && window.localStorage.getItem('archive-desk-global-seeded') !== '1') {
      window.localStorage.setItem('archive-desk-global-seeded', '1')
      try {
        const seeded = await call<RuleDocDto>('rules_save_global', { content: DEFAULT_GLOBAL_RULES })
        setGlobalExists(Boolean(seeded.exists && seeded.content.trim()))
        return seeded
      } catch {
        return { ...doc, exists: true, content: DEFAULT_GLOBAL_RULES }
      }
    }
    setGlobalExists(Boolean(doc.exists && doc.content.trim()))
    return doc
  }
  const saveGlobal = async (content: string) => {
    if (live) {
      window.localStorage.setItem('archive-desk-global-seeded', '1')
      return call<RuleDocDto>('rules_save_global', { content })
    }
    if (content.trim()) demoRuleStore.set('global', content); else demoRuleStore.delete('global')
    return globalDoc()
  }

  useEffect(() => {
    if (!live) return
    void call<AiSettingsDto>('get_ai_settings')
      .then((settings) => {
        if (settings.endpoint) setEndpoint(settings.endpoint)
        if (settings.model) setModel(settings.model)
        setProtocol(inferProtocolFromEndpoint(settings.endpoint, settings.protocol))
        if (typeof settings.api_key === 'string' && settings.api_key.trim()) {
          setApiKey(settings.api_key)
        }
        setHasApiKey(settings.has_api_key || Boolean(settings.api_key?.trim()))
      })
      .catch((error) => setToast(errorMessage(error, t('读取 AI 设置失败'))))
    void loadGlobal().catch(() => {})
    void loadRequestLogs()
  }, [])

  useEffect(() => {
    if (section === 'logs') {
      void loadRequestLogs()
    }
  }, [section])

  useEffect(() => {
    if (section !== 'rules') return
    libraries.forEach((library) => {
      if (library.status === '可用' && !library.folders.length) {
        onNeedTree(library.id)
      }
    })
  }, [section, libraries])

  const selectRuleTarget = (next: RuleTarget) => {
    if (
      (next.scope === 'global' && ruleTarget.scope === 'global') ||
      (next.scope === 'folder' && ruleTarget.scope === 'folder' && next.libraryId === ruleTarget.libraryId && next.folderPath === ruleTarget.folderPath)
    ) {
      return
    }
    if (!confirmLeaveRules()) return
    setRuleTarget(next)
    if (next.scope === 'folder') {
      onNeedTree(next.libraryId)
    }
  }

  const targetLibrary = ruleTarget.scope === 'folder'
    ? (libraries.find((lib) => lib.id === ruleTarget.libraryId) ?? libraries[0])
    : undefined
  const effectiveRuleTarget: RuleTarget = ruleTarget.scope === 'folder' && targetLibrary
    ? { scope: 'folder', libraryId: targetLibrary.id, folderPath: ruleTarget.libraryId === targetLibrary.id ? ruleTarget.folderPath : '' }
    : { scope: 'global' }

  const folderLibraryId = effectiveRuleTarget.scope === 'folder' ? effectiveRuleTarget.libraryId : ''
  const folderRelPath = effectiveRuleTarget.scope === 'folder' ? effectiveRuleTarget.folderPath : ''
  const folderDemoKey = `${folderLibraryId}:${folderRelPath}`
  const folderDemoDoc = (): RuleDocDto => ({
    scope: 'folder',
    library_id: folderLibraryId,
    folder_path: folderRelPath,
    path: `${targetLibrary?.name ?? ''}/${folderRelPath ? `${folderRelPath}/` : ''}${RULE_FILE_NAME}`,
    exists: demoRuleStore.has(folderDemoKey),
    content: demoRuleStore.get(folderDemoKey) ?? '',
    error: null,
  })
  const loadFolderRule = () => live ? call<RuleDocDto>('rules_get_folder', { libraryId: folderLibraryId, folderPath: folderRelPath }) : Promise.resolve(folderDemoDoc())
  const saveFolderRule = async (content: string) => {
    if (live) return call<RuleDocDto>('rules_save_folder', { libraryId: folderLibraryId, folderPath: folderRelPath, content })
    if (content.trim()) demoRuleStore.set(folderDemoKey, content); else demoRuleStore.delete(folderDemoKey)
    return folderDemoDoc()
  }
  const syncFolderRuleMark = (doc: RuleDocDto) => {
    setLibraryState((prev) => prev.map((library) => library.id !== folderLibraryId ? library : folderRelPath ? { ...library, folders: markFolderRules(library.folders, folderRelPath, doc.exists) } : { ...library, hasRules: doc.exists }))
  }
  const onFolderRuleSaved = (doc: RuleDocDto) => {
    syncFolderRuleMark(doc)
    if (!live) { setToast(t('规则已保存')); return }
    onReloadTree(folderLibraryId)
    setToast(doc.exists ? t('规则已保存') : t('规则已清空'))
    void call<OverviewDto[]>('rules_regenerate_overviews', { libraryId: folderLibraryId, force: false }).catch(() => { /* 后台静默同步总览 */ })
  }

  const isLocalEndpoint = protocol === 'ollama' || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(\b|:|\/)/i.test(endpoint.trim())
  const aiReady = Boolean(apiKey.trim()) || hasApiKey || isLocalEndpoint || Boolean(connStatus?.ok)
  const currentProtocol = AI_PROTOCOLS.find((item) => item.id === protocol) ?? AI_PROTOCOLS[0]

  const selectSection = (next: SettingsSection) => {
    if (next === section) return
    if (section === 'rules' && !confirmLeaveRules()) return
    setSection(next)
  }

  const persistAi = async (runTest: boolean) => {
    if (!endpoint.trim() || !model.trim()) {
      setConnStatus({ ok: false, text: t('请先填写完整的接口地址和模型名称。') })
      return
    }
    const trimmedKey = apiKey.trim()
    const effectiveKey = trimmedKey || (isLocalEndpoint ? 'ollama' : '')
    if (!effectiveKey && !hasApiKey) {
      setConnStatus({ ok: false, text: t('请先填写 API 密钥后再保存。') })
      return
    }
    const previous = readStored()
    window.localStorage.setItem(
      'archive-desk-settings',
      JSON.stringify({
        ...previous,
        protocol,
        endpoint: endpoint.trim(),
        model: model.trim(),
        apiKey: trimmedKey,
      }),
    )
    if (!live) {
      setHasApiKey(true)
      setConnStatus({ ok: true, text: runTest ? t('演示模式已记录配置；在桌面应用中将连接真实 AI 接口。') : t('演示模式已保存配置。') })
      return
    }
    if (runTest) setTesting(true); else setSaving(true)
    setConnStatus(null)
    try {
      const settings = await call<AiSettingsDto>('save_ai_settings', {
        enabled: true,
        protocol,
        endpoint: endpoint.trim(),
        model: model.trim(),
        apiKey: effectiveKey || null,
      })
      setHasApiKey(settings.has_api_key || Boolean(effectiveKey))
      if (typeof settings.api_key === 'string' && settings.api_key.trim() && settings.api_key !== 'ollama') {
        setApiKey(settings.api_key)
      }
      if (runTest) {
        await call<string>('test_ai_connection')
        setConnStatus({ ok: true, text: t('连接成功！AI 服务已就绪，现在可以去「AI 分类」自动整理文件了。') })
        setToast(t('AI 服务连接成功'))
      } else {
        setConnStatus({ ok: true, text: t('配置已保存。建议点击「保存并测试连接」确认密钥可用。') })
        setToast(t('AI 配置已保存'))
      }
    } catch (error) {
      setConnStatus({ ok: false, text: errorMessage(error, runTest ? t('连接测试失败，请检查地址、模型名和密钥') : t('保存失败')) })
    } finally {
      setSaving(false)
      setTesting(false)
      if (runTest) void loadRequestLogs()
    }
  }

  const selectDefaultMode = (nextMode: 'copy' | 'move') => {
    if (nextMode === defaultMode) return
    setDefaultMode(nextMode)
    const previous = readStored()
    window.localStorage.setItem('archive-desk-settings', JSON.stringify({ ...previous, defaultMode: nextMode }))
    onDefaultModeChange(nextMode)
    setToast(nextMode === 'copy' ? t('默认归档方式已设为：复制（保留原文件）') : t('默认归档方式已设为：移动（整理后移除原文件）'))
  }

  const selectLocale = (nextLocale: LocaleId) => {
    if (nextLocale === locale) return
    setLocale(nextLocale)
    const targetOption = SUPPORTED_LOCALES.find((item) => item.id === nextLocale)
    setToast(translateWithLocale(nextLocale, '界面语言已切换为：{lang}', { lang: targetOption?.nativeName ?? nextLocale }))
  }

  return (
    <div className="content-scroll standalone-page settings-page">
      <div className="settings-container settings-split-layout">
        <aside className="settings-aside">
          <header className="settings-hero">
            <h1>{t('设置')}</h1>
          </header>

          <nav className="settings-subnav" role="tablist" aria-orientation="vertical" aria-label={t('设置二级分类')}>
            <button
              type="button"
              role="tab"
              aria-selected={section === 'ai'}
              className={`settings-subtab ${section === 'ai' ? 'active' : ''}`}
              onClick={() => selectSection('ai')}
            >
              <span className="settings-subtab-icon"><Icon name="spark" size={16} /></span>
              <span className="settings-subtab-text">
                <strong>{t('AI 服务')}</strong>
              </span>
              <span className={`settings-subtab-dot ${aiReady ? 'ok' : 'warn'}`} aria-hidden="true" />
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={section === 'rules'}
              className={`settings-subtab ${section === 'rules' ? 'active' : ''}`}
              onClick={() => selectSection('rules')}
            >
              <span className="settings-subtab-icon"><Icon name="file" size={16} /></span>
              <span className="settings-subtab-text">
                <strong>{t('分类规则')}</strong>
              </span>
              <span className={`settings-subtab-dot ${globalExists ? 'ok' : 'off'}`} aria-hidden="true" />
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={section === 'general'}
              className={`settings-subtab ${section === 'general' ? 'active' : ''}`}
              onClick={() => selectSection('general')}
            >
              <span className="settings-subtab-icon"><Icon name="sliders" size={16} /></span>
              <span className="settings-subtab-text">
                <strong>{t('通用偏好')}</strong>
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={section === 'logs'}
              className={`settings-subtab ${section === 'logs' ? 'active' : ''}`}
              onClick={() => selectSection('logs')}
            >
              <span className="settings-subtab-icon"><Icon name="history" size={16} /></span>
              <span className="settings-subtab-text">
                <strong>{t('请求日志')}</strong>
              </span>
              <span
                className={`settings-subtab-dot ${
                  requestLogs.length === 0
                    ? 'off'
                    : !requestLogs[0].ok
                      ? 'warn'
                      : 'ok'
                }`}
                aria-hidden="true"
              />
            </button>
          </nav>
        </aside>

        <div className="settings-stack" role="tabpanel">
          {section === 'ai' && (
            <section className="settings-card">
              <div className="settings-card-head">
                <div className="settings-card-title">
                  <span className="setting-symbol accent"><Icon name="spark" size={17} /></span>
                  <div>
                    <div className="settings-heading-row">
                      <h2>{t('AI 服务配置')}</h2>
                      {aiReady ? (
                        <Badge className="settings-status-ok">{t('已就绪')}</Badge>
                      ) : (
                        <Badge variant="warning">{t('待填写密钥')}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="ai-setup-body">
                <div className="ai-presets-block">
                  <div className="ai-field-label-row">
                    <span className="ai-field-label">{t('1. 接口协议')}</span>
                  </div>
                  <div className="ai-presets" role="radiogroup" aria-label={t('接口协议')}>
                    {AI_PROTOCOLS.map((item) => {
                      const active = protocol === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={`ai-preset-chip ${active ? 'active' : ''}`}
                          onClick={() => {
                            const isDefaultEndpoint = !endpoint.trim() || AI_PROTOCOLS.some((p) => p.endpoint.toLowerCase() === endpoint.trim().replace(/\/+$/, '').toLowerCase())
                            const isDefaultModel = !model.trim() || AI_PROTOCOLS.some((p) => p.model.toLowerCase() === model.trim().toLowerCase())
                            setProtocol(item.id)
                            if (isDefaultEndpoint) setEndpoint(item.endpoint)
                            if (isDefaultModel) setModel(item.model)
                            setConnStatus(null)
                          }}
                        >
                          {t(item.label)}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="ai-fields-grid">
                  <label className="ai-field">
                    <span className="ai-field-label">{t('2. 接口地址（Base URL）')}</span>
                    <TextInput
                      value={endpoint}
                      onChange={(event) => {
                        setEndpoint(event.target.value)
                        setConnStatus(null)
                      }}
                      placeholder={currentProtocol.endpoint}
                    />
                  </label>
                  <label className="ai-field">
                    <span className="ai-field-label">{t('3. 模型名称')}</span>
                    <TextInput
                      value={model}
                      onChange={(event) => { setModel(event.target.value); setConnStatus(null) }}
                      placeholder={currentProtocol.model}
                    />
                  </label>
                  <div className="ai-field ai-field-full">
                    <div className="ai-field-label-row">
                      <label htmlFor="ai-api-key-input" className="ai-field-label">{t('4. API 密钥')}</label>
                      {isLocalEndpoint && <span className="ai-key-hint">{t('本地服务无需密钥，可直接留空')}</span>}
                    </div>
                    <TextInput
                      id="ai-api-key-input"
                      type="text"
                      value={apiKey}
                      onChange={(event) => { setApiKey(event.target.value); setConnStatus(null) }}
                      placeholder={t(currentProtocol.keyPlaceholder)}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                </div>

                {connStatus && (
                  <div className={`ai-conn-banner ${connStatus.ok ? 'ok' : 'err'}`} role="status">
                    <Icon name={connStatus.ok ? 'check' : 'info'} size={15} />
                    <span>{connStatus.text}</span>
                    {connStatus.ok ? (
                      <button type="button" className="ai-conn-jump" onClick={onOpenAgent}>
                        {t('打开 AI 分类')} <Icon name="arrow" size={12} />
                      </button>
                    ) : (
                      <button type="button" className="ai-conn-jump" onClick={() => selectSection('logs')}>
                        {t('查看请求日志')} <Icon name="arrow" size={12} />
                      </button>
                    )}
                  </div>
                )}

                <div className="ai-setup-foot">
                  <div className="ai-setup-buttons">
                    <Button variant="outline" size="sm" disabled={saving || testing} onClick={() => { void persistAi(false) }}>
                      {saving ? t('保存中…') : t('仅保存')}
                    </Button>
                    <Button size="sm" disabled={saving || testing} onClick={() => { void persistAi(true) }}>
                      {testing ? t('正在验证连接…') : t('保存并测试连接')}
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {section === 'rules' && (
            <>
              <section className="settings-card settings-rules-workbench">
                <aside className="rules-scope-pane" aria-label={t('规则目录选择')}>
                  <div className="rules-scope-head">
                    <h2>{t('规则目录')}</h2>
                  </div>

                  <div className="rules-scope-body">
                    <div className="rules-scope-group-label">{t('全局通用')}</div>
                    <div
                      className={`rules-tree-row root-row ${effectiveRuleTarget.scope === 'global' ? 'selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectRuleTarget({ scope: 'global' })}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRuleTarget({ scope: 'global' }) } }}
                    >
                      <span className="rules-tree-folder root"><Icon name="file" size={14} /></span>
                      <span className="rules-tree-name">{t('总规则（总说明.md）')}</span>
                      {globalExists && <span className="rules-tree-mark"><Icon name="check" size={10} />{t('已启用')}</span>}
                    </div>

                    <div className="rules-scope-group-head">
                      <span className="rules-scope-group-label">{t('各文件库规则')}</span>
                      <button type="button" className="rules-scope-add" onClick={onAddLibrary} title={t('添加文件库')}>
                        <Icon name="plus" size={12} />{t('添加库')}
                      </button>
                    </div>

                    {libraries.length === 0 ? (
                      <div className="rules-tree-empty">
                        <p>{t('还没有文件库')}</p>
                      </div>
                    ) : (
                      <div className="rules-libraries-list">
                        {libraries.map((library) => {
                          const isLibRootSelected = effectiveRuleTarget.scope === 'folder' && effectiveRuleTarget.libraryId === library.id && effectiveRuleTarget.folderPath === ''
                          const libFolders = limitFolderDepth(library.folders, library.folderDepth)
                          return (
                            <div key={library.id} className="rules-library-group">
                              <div
                                className={`rules-tree-row root-row ${isLibRootSelected ? 'selected' : ''}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => selectRuleTarget({ scope: 'folder', libraryId: library.id, folderPath: '' })}
                                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRuleTarget({ scope: 'folder', libraryId: library.id, folderPath: '' }) } }}
                              >
                                <LibraryMark color={library.color} />
                                <span className="rules-tree-name">{library.name}</span>
                                <span className="rules-tree-root-tag">{t('根目录')}</span>
                                {library.hasRules && <span className="rules-tree-mark"><Icon name="file" size={10} />{t('规则')}</span>}
                              </div>

                              {libFolders.length > 0 && (
                                <SharedFolderTree
                                  nodes={folderNodesToTreeNodes(libFolders, '', library.id)}
                                  className="folder-tree"
                                  nodeClassName="folder-tree-node"
                                  renderRow={({ node, depth, isExpanded, hasChildren, path, toggle }) => {
                                    const isFolderSelected = effectiveRuleTarget.scope === 'folder' && effectiveRuleTarget.libraryId === library.id && effectiveRuleTarget.folderPath === path
                                    return (
                                      <div
                                        className={`rules-tree-row ${isFolderSelected ? 'selected' : ''}`}
                                        style={{ paddingLeft: `${18 + depth * 14}px` }}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => selectRuleTarget({ scope: 'folder', libraryId: library.id, folderPath: path })}
                                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRuleTarget({ scope: 'folder', libraryId: library.id, folderPath: path }) } }}
                                      >
                                        <span data-tree-expander className={`rules-tree-expander ${hasChildren && isExpanded ? 'open' : ''}`} onClick={(event) => { event.stopPropagation(); if (hasChildren) toggle() }}>
                                          {hasChildren ? <Icon name="chevron" size={12} /> : null}
                                        </span>
                                        <span className="rules-tree-folder"><Icon name="folder" size={14} /></span>
                                        <span className="rules-tree-name" title={path}>{node.label}</span>
                                        {node.hasRules && <span className="rules-tree-mark"><Icon name="file" size={10} />{t('规则')}</span>}
                                      </div>
                                    )
                                  }}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </aside>

                <div className="rules-editor-pane">
                  {effectiveRuleTarget.scope === 'global' ? (
                    <RuleEditor
                      variant="pane"
                      docKey="global"
                      title={t('总规则（总说明.md）')}
                      placeholder={t(GLOBAL_RULE_PLACEHOLDER)}
                      defaultContent={DEFAULT_GLOBAL_RULES}
                      load={loadGlobal}
                      save={saveGlobal}
                      openExternal={live ? () => call<string>('rules_open_external', { libraryId: null, folderPath: null }).then(() => undefined) : undefined}
                      onSaved={(doc) => { setGlobalExists(Boolean(doc.exists && doc.content.trim())); setToast(t('总规则已保存')) }}
                      onReloaded={(doc) => { setGlobalExists(Boolean(doc.exists && doc.content.trim())) }}
                      onDirtyChange={onRuleDirtyChange}
                      setToast={setToast}
                    />
                  ) : targetLibrary ? (
                    <RuleEditor
                      variant="pane"
                      docKey={folderDemoKey}
                      title={folderRelPath ? t('{lib} / {folder} · 文件夹规则', { lib: targetLibrary.name, folder: folderRelPath }) : t('{lib} · 文件库规则', { lib: targetLibrary.name })}
                      load={loadFolderRule}
                      save={saveFolderRule}
                      draft={live ? () => call<string>('rules_draft_folder', { libraryId: folderLibraryId, folderPath: folderRelPath }) : undefined}
                      openExternal={live ? () => call<string>('rules_open_external', { libraryId: folderLibraryId, folderPath: folderRelPath }).then(() => undefined) : undefined}
                      onSaved={onFolderRuleSaved}
                      onReloaded={syncFolderRuleMark}
                      onDirtyChange={onRuleDirtyChange}
                      setToast={setToast}
                    />
                  ) : null}
                </div>
              </section>
            </>
          )}

          {section === 'general' && (
            <>
              <section className="settings-card">
                <div className="settings-card-head">
                  <div className="settings-card-title">
                    <span className="setting-symbol accent"><Icon name="globe" size={17} /></span>
                    <div>
                      <div className="settings-heading-row">
                        <h2>{t('界面语言')}</h2>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="lang-choice-grid" role="radiogroup" aria-label={t('界面语言')}>
                  {SUPPORTED_LOCALES.map((item) => {
                    const active = locale === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`lang-choice-card ${active ? 'selected' : ''}`}
                        onClick={() => selectLocale(item.id)}
                      >
                        <span className="mode-choice-radio" />
                        <span className="lang-choice-name">{item.nativeName}</span>
                        <span className="lang-choice-tag">{item.shortTag}</span>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="settings-card">
                <div className="settings-card-head">
                  <div className="settings-card-title">
                    <span className="setting-symbol accent"><Icon name={defaultMode === 'copy' ? 'copy' : 'move'} size={17} /></span>
                    <div>
                      <div className="settings-heading-row">
                        <h2>{t('默认归档方式')}</h2>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mode-choice-grid" role="radiogroup" aria-label={t('默认归档方式')}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={defaultMode === 'copy'}
                    className={`mode-choice-card ${defaultMode === 'copy' ? 'selected' : ''}`}
                    onClick={() => selectDefaultMode('copy')}
                  >
                    <div className="mode-choice-top">
                      <span className="mode-choice-radio" />
                      <strong>{t('复制文件')}</strong>
                    </div>
                    <p>{t('在目标文件库生成副本，保留原位置文件。')}</p>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={defaultMode === 'move'}
                    className={`mode-choice-card ${defaultMode === 'move' ? 'selected' : ''}`}
                    onClick={() => selectDefaultMode('move')}
                  >
                    <div className="mode-choice-top">
                      <span className="mode-choice-radio" />
                      <strong>{t('移动文件')}</strong>
                    </div>
                    <p>{t('归档并校验无误后清理原位置文件。')}</p>
                  </button>
                </div>
              </section>
            </>
          )}

          {section === 'logs' && (
            <SettingsRequestLogsSection
              logs={requestLogs}
              loading={loadingLogs}
              onlyFailed={logsOnlyFailed}
              setOnlyFailed={setLogsOnlyFailed}
              expandedIds={expandedLogIds}
              setExpandedIds={setExpandedLogIds}
              onRefresh={() => { void loadRequestLogs() }}
              onClear={() => { void clearRequestLogs() }}
              setToast={setToast}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function formatLogElapsed(ms?: number) {
  if (!ms || ms <= 0) return '0.0s'
  if (ms < 1000) return `${ms}ms`
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)}s`
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(1)
  return `${m}m ${s}s`
}

function formatLogTime(createdAt: string, locale: string) {
  const ts = Number(createdAt)
  if (!Number.isFinite(ts) || ts <= 0) return createdAt
  return new Date(ts * 1000).toLocaleString(locale, { hour12: false })
}

function SettingsRequestLogsSection({
  logs,
  loading,
  onlyFailed,
  setOnlyFailed,
  expandedIds,
  setExpandedIds,
  onRefresh,
  onClear,
  setToast,
}: {
  logs: AiRequestLogDto[]
  loading: boolean
  onlyFailed: boolean
  setOnlyFailed: (next: boolean) => void
  expandedIds: Record<string, boolean>
  setExpandedIds: Dispatch<SetStateAction<Record<string, boolean>>>
  onRefresh: () => void
  onClear: () => void
  setToast: (msg: string) => void
}) {
  const { locale, t } = useI18n()
  const failedCount = logs.filter((item) => !item.ok).length
  const okCount = logs.length - failedCount
  const visibleLogs = onlyFailed ? logs.filter((item) => !item.ok) : logs

  const totalInputTokens = logs.reduce((sum, item) => sum + (item.input_tokens ?? 0), 0)
  const totalOutputTokens = logs.reduce((sum, item) => sum + (item.output_tokens ?? 0), 0)
  const totalCachedTokens = logs.reduce((sum, item) => sum + (item.cached_tokens ?? 0), 0)
  const totalTokens = logs.reduce(
    (sum, item) => sum + ((item.total_tokens ?? 0) || (item.input_tokens ?? 0) + (item.output_tokens ?? 0)),
    0,
  )

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const copyDiagnostic = async (log: AiRequestLogDto) => {
    const text = [
      `[AI Request Diagnostic Log]`,
      `Time: ${formatLogTime(log.created_at, locale)}`,
      `Stage: ${log.stage}`,
      `Status: ${log.ok ? `OK (${log.status_code || 200})` : `Failed (${log.status_code || 'Connection/Timeout'})`}`,
      `Elapsed: ${formatLogElapsed(log.elapsed_ms)}`,
      `Protocol/Model: ${log.protocol} / ${log.model}`,
      `Endpoint: ${log.endpoint}`,
      `Tokens: in ${log.input_tokens} | cached ${log.cached_tokens} | out ${log.output_tokens} | total ${log.total_tokens || log.input_tokens + log.output_tokens}`,
      log.error ? `Error: ${log.error}` : '',
      ``,
      `--- System Prompt ---`,
      log.system_prompt || '(empty)',
      ``,
      `--- Request Body ---`,
      log.request_body || '(empty)',
      ``,
      `--- Response Body ---`,
      log.response_body || '(empty)',
    ]
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setToast(t('已复制该条请求诊断日志'))
    } catch {
      setToast(t('复制失败，请手动选中复制'))
    }
  }

  return (
    <section className="settings-card settings-logs-card">
      <div className="settings-card-head settings-logs-head">
        <div className="settings-card-title">
          <span className="setting-symbol accent"><Icon name="history" size={17} /></span>
          <div>
            <div className="settings-heading-row">
              <h2>{t('AI 请求日志')}</h2>
              {failedCount > 0 && <Badge variant="warning">{t('{count} 条异常', { count: failedCount })}</Badge>}
            </div>
          </div>
        </div>

        <div className="settings-logs-actions">
          <div className="segmented settings-logs-filter" role="tablist" aria-label={t('日志筛选')}>
            <button
              type="button"
              className={!onlyFailed ? 'active' : ''}
              onClick={() => setOnlyFailed(false)}
            >
              {t('全部 ({count})', { count: logs.length })}
            </button>
            <button
              type="button"
              className={onlyFailed ? 'active' : ''}
              onClick={() => setOnlyFailed(true)}
            >
              {t('仅看异常 ({count})', { count: failedCount })}
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <Icon name="refresh" size={14} />{loading ? t('刷新中…') : t('刷新')}
          </Button>
          {logs.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              {t('清空日志')}
            </Button>
          )}
        </div>
      </div>

      {logs.length > 0 && (
        <div className="settings-logs-summary">
          <div className="settings-log-stat">
            <span>{t('请求统计')}</span>
            <strong>{t('{total} 次', { total: logs.length })} <small>{t('（成功 {ok} / 异常 {failed}）', { ok: okCount, failed: failedCount })}</small></strong>
          </div>
          <div className="settings-log-stat primary">
            <span>{t('累计总 Token')}</span>
            <strong>{totalTokens.toLocaleString()}</strong>
          </div>
          <div className="settings-log-stat">
            <span>{t('输入 Token')}</span>
            <strong>{totalInputTokens.toLocaleString()}</strong>
          </div>
          <div className="settings-log-stat cached">
            <span>{t('缓存命中 Token')}</span>
            <strong>{totalCachedTokens.toLocaleString()}</strong>
          </div>
          <div className="settings-log-stat">
            <span>{t('输出 Token')}</span>
            <strong>{totalOutputTokens.toLocaleString()}</strong>
          </div>
        </div>
      )}

      <div className="settings-logs-list">
        {visibleLogs.length === 0 ? (
          <div className="settings-logs-empty">
            <span className="empty-icon"><Icon name="history" size={20} /></span>
            <strong>{onlyFailed ? t('没有异常请求记录') : t('暂无 AI 请求记录')}</strong>
          </div>
        ) : (
          visibleLogs.map((log) => {
            const expanded = Boolean(expandedIds[log.id])
            const reqTotal = (log.total_tokens ?? 0) || (log.input_tokens ?? 0) + (log.output_tokens ?? 0)
            return (
              <div key={log.id} className={`settings-req-log ${log.ok ? 'ok' : 'err'} ${expanded ? 'open' : ''}`}>
                <div
                  className="settings-req-log-head"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(log.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(log.id) } }}
                >
                  <div className="settings-req-log-main">
                    <span className={`settings-req-log-chevron ${expanded ? 'open' : ''}`}>
                      <Icon name="chevron" size={13} />
                    </span>
                    <span className={`settings-req-status ${log.ok ? 'ok' : 'err'}`}>
                      {log.ok ? t('成功 {code}', { code: log.status_code || 200 }) : log.status_code ? t('失败 {code}', { code: log.status_code }) : t('失败 · 连接/超时')}
                    </span>
                    <strong className="settings-req-stage">{log.stage || t('AI 请求')}</strong>
                    <Badge variant="outline">{log.protocol} · {log.model || t('未指定模型')}</Badge>
                    <Badge variant="neutral">{formatLogElapsed(log.elapsed_ms)}</Badge>
                    <span className="agent-log-token-pill">
                      {t('输入')} <b>{(log.input_tokens ?? 0).toLocaleString()}</b>
                      {' · '}{t('缓存')} <b>{(log.cached_tokens ?? 0).toLocaleString()}</b>
                      {' · '}{t('输出')} <b>{(log.output_tokens ?? 0).toLocaleString()}</b>
                      {' · '}{t('合计')} <b>{reqTotal.toLocaleString()}</b>
                    </span>
                  </div>
                  <div className="settings-req-log-right">
                    <time className="settings-req-time">{formatLogTime(log.created_at, locale)}</time>
                  </div>
                </div>

                <div className="settings-req-url-bar">
                  <span className="settings-req-method">POST</span>
                  <code className="settings-req-url">{log.endpoint || t('(未记录接口地址)')}</code>
                  <button
                    type="button"
                    className="settings-req-copy-btn"
                    onClick={(e) => { e.stopPropagation(); void copyDiagnostic(log) }}
                    title={t('复制完整请求与响应日志，方便排查问题')}
                  >
                    <Icon name="copy" size={12} />{t('复制诊断信息')}
                  </button>
                </div>

                {!log.ok && log.error && (
                  <div className="settings-req-error-banner">
                    <Icon name="info" size={15} />
                    <span>{log.error}</span>
                  </div>
                )}

                {expanded && (
                  <div className="settings-req-log-body">
                    {log.system_prompt && (
                      <details className="agent-log-sys">
                        <summary>{t('System Prompt（系统提示词 · {count} 字符）', { count: log.system_prompt.length })}</summary>
                        <pre>{log.system_prompt}</pre>
                      </details>
                    )}

                    <div className="agent-log-io-grid">
                      <div className="agent-log-box">
                        <div className="agent-log-box-head">
                          <span>{t('Request（发送给 AI 的请求载荷）')}</span>
                          <small>{t('{count} 字符', { count: log.request_body.length })}</small>
                        </div>
                        <pre>{log.request_body || t('(空)')}</pre>
                      </div>
                      <div className="agent-log-box">
                        <div className="agent-log-box-head">
                          <span>{t('Response（AI 原始返回内容 / 错误响应体）')}</span>
                          <small>{t('{count} 字符', { count: log.response_body.length })}</small>
                        </div>
                        <pre>{log.response_body || (log.error ? `(${log.error})` : t('(空)'))}</pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

export default App
