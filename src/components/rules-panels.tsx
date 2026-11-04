import { useEffect, useRef, useState } from 'react'
import { ChevronRight, CircleAlert, ExternalLink, FileText, LoaderCircle, RefreshCw, RotateCcw, Save, Sparkles } from 'lucide-react'
import { call, errorMessage, isTauri, type OverviewDto, type RuleDocDto } from '../backend'
import { Badge, Button } from './watermelon-ui'
import { useI18n } from '../i18n'
import '../rules.css'

/** 极简默认总规则（首次初始化及「恢复默认」时使用）。 */
export const DEFAULT_GLOBAL_RULES = [
  '- 跳过临时与缓存文件（如 .tmp、.crdownload、~$ 开头的文件）。',
  '- 默认保持原文件名，只在文件夹规则有要求时改名。',
  '- 拿不准分类的文件保持原位，交给人工确认。',
  '',
].join('\n')

/** 浏览器演示模式下的规则内容（只保存在内存里）。 */
export const demoRuleStore = new Map<string, string>([['global', DEFAULT_GLOBAL_RULES]])

type RuleEditorProps = {
  title: string
  description?: string
  placeholder?: string
  /** 可选默认内容；提供时若当前内容与默认不同，会在工具栏显示「恢复默认」按钮 */
  defaultContent?: string
  /** 'card' 用于独立卡片（如设置页）；'pane' 用于双栏工作台右侧无边框面板 */
  variant?: 'card' | 'pane'
  /** 变化时重新读取规则（例如切换了文件夹）。 */
  docKey: string
  load: () => Promise<RuleDocDto>
  save: (content: string) => Promise<RuleDocDto>
  draft?: () => Promise<string>
  openExternal?: () => Promise<void>
  onSaved?: (doc: RuleDocDto) => void
  onReloaded?: (doc: RuleDocDto) => void
  onDirtyChange?: (dirty: boolean) => void
  setToast: (message: string) => void
  footnote?: string
}

const PLACEHOLDER = '写明该目录收录哪些文件、子文件夹与命名规则；也可点击右上角「让 AI 写草稿」自动生成。'

function cleanRulePath(path: string) {
  return path.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '')
}

export function RuleEditor({ title, description, placeholder, defaultContent, variant = 'card', docKey, load, save, draft, openExternal, onSaved, onReloaded, onDirtyChange, setToast, footnote }: RuleEditorProps) {
  const { t } = useI18n()
  const [doc, setDoc] = useState<RuleDocDto | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<null | 'loading' | 'saving' | 'drafting'>('loading')
  const dirty = doc !== null && text !== doc.content
  const externalOpenedRef = useRef(false)
  const stateRef = useRef({ dirty, busy, load, onReloaded })
  stateRef.current = { dirty, busy, load, onReloaded }

  useEffect(() => {
    onDirtyChange?.(dirty)
    return () => { onDirtyChange?.(false) }
  }, [dirty])

  useEffect(() => {
    let disposed = false
    externalOpenedRef.current = false
    setBusy('loading')
    load()
      .then((next) => { if (!disposed) { setDoc(next); setText(next.content) } })
      .catch((error) => { if (!disposed) { setDoc(null); setText(''); setToast(errorMessage(error, t('读取规则失败'))) } })
      .finally(() => { if (!disposed) setBusy(null) })
    return () => { disposed = true }
  }, [docKey])

  const reloadDoc = async (confirmIfDirty = true) => {
    if (confirmIfDirty && stateRef.current.dirty && !window.confirm(t('重新读取会丢弃当前未保存的修改。继续吗？'))) return
    setBusy('loading')
    try {
      const next = await stateRef.current.load()
      setDoc(next)
      setText(next.content)
      stateRef.current.onReloaded?.(next)
    } catch (error) { setToast(errorMessage(error, t('读取规则失败'))) }
    finally { setBusy(null) }
  }

  useEffect(() => {
    const onFocus = () => {
      if (externalOpenedRef.current && !stateRef.current.dirty && stateRef.current.busy === null) {
        void reloadDoc(false)
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const submit = async () => {
    if (!text.trim() && doc?.exists && !window.confirm(t('内容为空，保存后会删除这个规则文件。确定吗？'))) return
    setBusy('saving')
    try {
      const next = await save(text)
      setDoc(next)
      setText(next.content)
      onSaved?.(next)
    } catch (error) { setToast(errorMessage(error, t('保存规则失败'))) }
    finally { setBusy(null) }
  }

  const writeDraft = async () => {
    if (!draft) return
    if (text.trim() && !window.confirm(t('AI 草稿会替换编辑框里的当前内容（保存前都可以还原）。继续吗？'))) return
    setBusy('drafting')
    try { setText(await draft()); setToast(t('已生成规则草稿，请检查修改后再保存')) }
    catch (error) { setToast(errorMessage(error, t('生成草稿失败'))) }
    finally { setBusy(null) }
  }

  const displayDocPath = doc?.path ? cleanRulePath(doc.path) : ''

  return <section className={`rule-editor ${variant === 'pane' ? 'rule-editor-pane' : ''}`}>
    <header className="rule-editor-head">
      <div className="rule-editor-topbar">
        <div className="rule-editor-title">
          <span className="rule-editor-icon"><FileText size={15} /></span>
          <h3>
            <span className="rule-editor-title-text">{title}</span>
            {doc?.exists ? <Badge className="rule-badge">{t('已有规则')}</Badge> : <Badge variant="neutral" className="rule-badge">{t('未写规则')}</Badge>}
            {dirty && <Badge variant="warning" className="rule-badge">{t('未保存')}</Badge>}
          </h3>
        </div>
        <div className="rule-editor-tools">
          {draft && <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void writeDraft()}>{busy === 'drafting' ? <LoaderCircle size={13.5} className="rule-spin" /> : <Sparkles size={13.5} />}{t('让 AI 写草稿')}</Button>}
          {defaultContent && text.trim() !== defaultContent.trim() && (
            <Button variant="ghost" size="sm" disabled={busy !== null} title={t('填入默认极简规则')} onClick={() => { setText(defaultContent); setToast(t('已填入默认规则，点击右下角「保存规则」即可生效')) }}>
              <RotateCcw size={13.5} />{t('恢复默认')}
            </Button>
          )}
          <Button variant="ghost" size="sm" disabled={busy !== null} title={t('从磁盘重新读取规则文件')} onClick={() => void reloadDoc(true)}><RefreshCw size={13.5} />{t('重新读取')}</Button>
          {openExternal && <Button variant="ghost" size="sm" disabled={busy !== null || dirty} title={dirty ? t('请先保存或还原当前修改') : t('用系统默认的编辑器打开')} onClick={() => { externalOpenedRef.current = true; void openExternal().catch((error) => { externalOpenedRef.current = false; setToast(errorMessage(error, t('打开失败'))) }) }}><ExternalLink size={13.5} />{t('外部编辑器')}</Button>}
        </div>
      </div>
      {description && <p className="rule-editor-desc">{description}</p>}
    </header>
    {doc?.error && <div className="rule-editor-error"><CircleAlert size={14} />{doc.error}</div>}
    <textarea
      className="rule-editor-text"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault()
          if (dirty && busy === null) void submit()
        }
      }}
      placeholder={busy === 'loading' ? t('正在读取…') : (placeholder ?? t(PLACEHOLDER))}
      disabled={busy === 'loading' || busy === 'drafting'}
      spellCheck={false}
      aria-label={title}
    />
    <footer className="rule-editor-foot">
      <div className="rule-editor-meta">
        {displayDocPath ? <code className="rule-editor-path" title={displayDocPath}>{displayDocPath}</code> : null}
        {footnote ? <span className="rule-editor-footnote">{footnote}</span> : null}
      </div>
      <div className="rule-editor-actions">
        {dirty && <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setText(doc?.content ?? '')}><RotateCcw size={13.5} />{t('还原')}</Button>}
        <Button size="sm" disabled={!dirty || busy !== null} title={t('保存规则 (Ctrl+S)')} onClick={() => void submit()}>{busy === 'saving' ? <LoaderCircle size={13.5} className="rule-spin" /> : <Save size={13.5} />}{t('保存规则')}</Button>
      </div>
    </footer>
  </section>
}

function formatTime(value: string, locale: string) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  return new Date(seconds * 1000).toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** 各文件库的「分类规则总览」：只读，可以重新生成。 */
export function OverviewPanel({ setToast, refreshKey }: { setToast: (message: string) => void; refreshKey?: number }) {
  const { locale, t } = useI18n()
  const live = isTauri()
  const [items, setItems] = useState<OverviewDto[]>([])
  const [loading, setLoading] = useState(live)
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const reload = async () => {
    if (!live) return
    setLoading(true)
    try { setItems(await call<OverviewDto[]>('rules_list_overviews')) } catch (error) { setToast(errorMessage(error, t('读取规则失败'))) }
    finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [refreshKey])

  const regenerate = async (libraryId: string | null) => {
    setRegenerating(libraryId ?? 'all')
    try {
      const next = await call<OverviewDto[]>('rules_regenerate_overviews', { libraryId, force: true })
      setItems(next)
      const failed = next.filter((item) => (libraryId === null || item.library_id === libraryId) && item.error)
      setToast(failed.length ? `${failed[0].error}` : t('规则已保存'))
    } catch (error) { setToast(errorMessage(error, t('保存失败'))) }
    finally { setRegenerating(null) }
  }

  if (!live) return null
  return <div className="overview-panel">
    <div className="overview-toolbar">
      <span>{loading ? t('正在读取…') : t('{count} 个库', { count: items.length })}</span>
      <Button variant="outline" size="sm" disabled={regenerating !== null || !items.length} onClick={() => void regenerate(null)}>{regenerating === 'all' ? <LoaderCircle size={14} className="rule-spin" /> : <RefreshCw size={14} />}{t('刷新')}</Button>
    </div>
    {items.map((item) => <div key={item.library_id} className={`overview-item ${open === item.library_id ? 'open' : ''}`}>
      <button type="button" className="overview-item-head" onClick={() => setOpen(open === item.library_id ? null : item.library_id)} aria-expanded={open === item.library_id}>
        <ChevronRight size={14} className="overview-chevron" />
        <strong>{item.library_name}</strong>
        <small>{item.generated_at && item.rule_count ? formatTime(item.generated_at, locale) : ''}</small>
      </button>
      {open === item.library_id && <div className="overview-item-body">
        {item.error && <div className="rule-editor-error"><CircleAlert size={14} />{item.error}</div>}
        {item.overview ? <pre className="overview-text">{item.overview}</pre> : null}
      </div>}
    </div>)}
  </div>
}
