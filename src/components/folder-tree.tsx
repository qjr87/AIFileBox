import { useEffect, useMemo, useState, type ReactNode } from 'react'

export type FolderTreeNode = {
  value: string
  label: string
  path?: string
  searchText?: string
  kind?: 'library' | 'folder' | 'none'
  color?: string
  count?: number
  children?: FolderTreeNode[]
}

export type FolderTreeRowContext = {
  node: FolderTreeNode
  depth: number
  path: string
  isExpanded: boolean
  hasChildren: boolean
  isSelected: boolean
  toggle: () => void
}

type FolderTreeProps = {
  nodes: FolderTreeNode[]
  className?: string
  nodeClassName?: string
  selectedValue?: string
  autoExpandAll?: boolean
  empty?: ReactNode
  renderRow: (context: FolderTreeRowContext) => ReactNode
  onNodeDoubleClick?: (node: FolderTreeNode, path: string) => void
}

function nodePath(node: FolderTreeNode, parent: string) {
  return (node.path || (parent ? `${parent}/${node.label}` : node.label)).replace(/\\/g, '/')
}

export function FolderTree({ nodes, className = 'folder-tree', nodeClassName = 'folder-tree-node', selectedValue, autoExpandAll = false, empty, renderRow, onNodeDoubleClick }: FolderTreeProps) {
  const rootKey = useMemo(() => nodes.map((node) => node.value).join('|'), [nodes])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(nodes.map((node) => node.value)))

  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current)
      nodes.forEach((node) => next.add(node.value))
      return next
    })
  }, [rootKey])

  const renderNodes = (items: FolderTreeNode[], depth = 0, parent = ''): ReactNode => items.map((node) => {
    const path = nodePath(node, parent)
    const key = node.value || path
    const hasChildren = Boolean(node.children?.length)
    const isExpanded = expanded.has(key) || autoExpandAll
    const toggle = () => setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    const context: FolderTreeRowContext = {
      node,
      depth,
      path,
      isExpanded,
      hasChildren,
      isSelected: selectedValue === node.value,
      toggle,
    }
    return <div key={key} className={nodeClassName} role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined} aria-selected={context.isSelected} onDoubleClick={(event) => {
      event.stopPropagation()
      if ((event.target as Element).closest('[data-tree-expander]')) return
      if (hasChildren) toggle()
      onNodeDoubleClick?.(node, path)
    }}>
      {renderRow(context)}
      {hasChildren && isExpanded ? <div className="folder-tree-children" role="group">{renderNodes(node.children ?? [], depth + 1, path)}</div> : null}
    </div>
  })

  return <div className={className} role="tree">{nodes.length ? renderNodes(nodes) : empty}</div>
}
