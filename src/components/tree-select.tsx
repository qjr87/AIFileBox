import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Folder, Search, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { FolderTree, type FolderTreeNode } from './folder-tree'
import { useI18n } from '../i18n'

export type TreeSelectNode = FolderTreeNode

type TreeSelectProps = {
  value: string
  nodes: TreeSelectNode[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

function filterTree(nodes: TreeSelectNode[], query: string): TreeSelectNode[] {
  if (!query.trim()) return nodes
  const normalized = query.trim().toLocaleLowerCase()
  return nodes.reduce<TreeSelectNode[]>((result, node) => {
    const children = filterTree(node.children ?? [], query)
    if (`${node.label} ${node.searchText ?? ''}`.toLocaleLowerCase().includes(normalized) || children.length) {
      result.push({ ...node, children })
    }
    return result
  }, [])
}

function findNode(nodes: TreeSelectNode[], value: string): TreeSelectNode | null {
  for (const node of nodes) {
    if (node.value === value) return node
    const match = findNode(node.children ?? [], value)
    if (match) return match
  }
  return null
}

export function TreeSelect({ value, nodes, onChange, placeholder, disabled = false }: TreeSelectProps) {
  const { t } = useI18n()
  const resolvedPlaceholder = placeholder ?? t('选择目标')
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [draftValue, setDraftValue] = useState(value)
  const selected = findNode(nodes, value)
  const selectedLabel = selected?.kind === 'folder' && selected.searchText ? selected.searchText : selected?.label
  const filteredNodes = useMemo(() => filterTree(nodes, query), [nodes, query])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', closeOnEscape); document.body.style.overflow = previousOverflow }
  }, [open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const select = (nodeValue: string) => setDraftValue(nodeValue)

  const close = () => setOpen(false)

  const confirm = () => {
    onChange(draftValue)
    setOpen(false)
  }

  const modal = open ? createPortal(<div className="tree-select-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="tree-select-modal" role="dialog" aria-modal="true" aria-labelledby="tree-select-title">
      <header className="tree-select-modal-header"><div><h2 id="tree-select-title">{t('选择归档目标')}</h2><p>{t('选择文件库或其中的子文件夹')}</p></div><button type="button" className="icon-button" onClick={close} aria-label={t('关闭选择窗口')}><X size={16} aria-hidden="true" /></button></header>
      <div className="tree-select-modal-body">
        <label className="tree-select-search"><Search size={14} aria-hidden="true" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('搜索文件库或子文件夹')} aria-label={t('搜索文件库或子文件夹')} /></label>
        <div className="tree-select-options" aria-label={t('文件库目录')}>
          {filteredNodes.length ? <FolderTree nodes={filteredNodes} className="tree-select-tree" nodeClassName="tree-select-node" selectedValue={draftValue} autoExpandAll={Boolean(query.trim())} empty={<div className="tree-select-empty">{t('没有匹配的文件夹')}</div>} renderRow={({ node, depth, isExpanded, hasChildren, isSelected, toggle }) => <div className={`tree-select-row ${isSelected ? 'selected' : ''}`} style={{ paddingLeft: `${7 + depth * 16}px` }}>
            <span data-tree-expander className="tree-select-expander" aria-hidden="true" onClick={(event) => { event.stopPropagation(); if (hasChildren) toggle() }}>
              {hasChildren ? <ChevronRight size={13} className={isExpanded ? 'expanded' : ''} /> : <span />}
            </span>
            <button type="button" className="tree-select-option" onClick={(event) => { event.stopPropagation(); select(node.value) }}>
              {node.kind === 'library' && <span className={`tree-select-dot ${node.color ?? 'mint'}`} aria-hidden="true" />}
              {node.kind === 'folder' && <Folder size={14} aria-hidden="true" />}
              {node.kind === 'none' && <span className="tree-select-none-mark" aria-hidden="true" />}
              <span>{node.label}</span>
              {isSelected && <Check size={14} className="tree-select-check" aria-hidden="true" />}
            </button>
          </div>} /> : <div className="tree-select-empty">{t('没有匹配的文件夹')}</div>}
        </div>
      </div>
      <footer className="tree-select-modal-footer"><button type="button" className="tree-select-cancel" onClick={close}>{t('取消')}</button><button type="button" className="tree-select-confirm" onClick={confirm}>{t('选择')}</button></footer>
    </section>
  </div>, document.body) : null

  return <div className="tree-select" ref={rootRef}>
    <button type="button" className={`tree-select-trigger ${open ? 'open' : ''}`} onClick={() => { if (!disabled) { setDraftValue(value); setOpen(true) } }} aria-haspopup="dialog" aria-expanded={open} disabled={disabled}>
      <span className="tree-select-trigger-label">{selectedLabel ?? resolvedPlaceholder}</span>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
    {modal}
  </div>
}
