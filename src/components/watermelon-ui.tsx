/**
 * Watermelon UI base primitives adapted from the Watermelon Platform registry.
 * Source: https://github.com/WatermelonCorp/watermelon-platform
 */
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils'

const buttonVariants = cva(
  'wm-button group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-[color:var(--wm-ring)]/30 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-[color:var(--wm-primary)] text-white hover:bg-[color:var(--wm-primary-strong)]',
        outline: 'border-[color:var(--wm-border-strong)] bg-[color:var(--wm-surface)] text-[color:var(--wm-ink)] hover:bg-[color:var(--wm-surface-muted)]',
        secondary: 'bg-[color:var(--wm-surface-muted)] text-[color:var(--wm-ink)] hover:bg-[color:var(--wm-surface-soft)]',
        ghost: 'text-[color:var(--wm-muted)] hover:bg-[color:var(--wm-surface-muted)] hover:text-[color:var(--wm-ink)]',
        destructive: 'bg-[color:var(--wm-danger-soft)] text-[color:var(--wm-danger)] hover:bg-[color:var(--wm-danger-soft-strong)]',
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-8 rounded-md px-2.5 text-xs',
        lg: 'h-10 px-3.5',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export function Button({ className, variant, size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button data-variant={variant ?? 'default'} data-size={size ?? 'default'} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

const badgeVariants = cva('wm-badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap', {
  variants: {
    variant: {
      default: 'border-transparent bg-[color:var(--wm-primary-soft)] text-[color:var(--wm-primary-strong)]',
      outline: 'border-[color:var(--wm-border)] text-[color:var(--wm-muted)]',
      warning: 'border-transparent bg-[color:var(--wm-warning-soft)] text-[color:var(--wm-warning)]',
      danger: 'border-transparent bg-[color:var(--wm-danger-soft)] text-[color:var(--wm-danger)]',
      neutral: 'border-transparent bg-[color:var(--wm-surface-muted)] text-[color:var(--wm-muted)]',
    },
  },
  defaultVariants: { variant: 'default' },
})

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('wm-card rounded-xl border border-[color:var(--wm-border)] bg-[color:var(--wm-surface)] text-[color:var(--wm-ink)] shadow-[var(--wm-shadow)]', className)} {...props} />
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-3 border-b border-[color:var(--wm-border)] px-4 py-3.5', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-3.5', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-semibold tracking-[-0.01em]', className)} {...props} />
}

export function Table({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <div className="relative w-full overflow-x-auto"><table className={cn('w-full border-collapse text-sm', className)} {...props}>{children}</table></div>
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b border-[color:var(--wm-border)]', className)} {...props} />
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-[color:var(--wm-border)] transition-colors hover:bg-[color:var(--wm-surface-muted)] data-[selected=true]:bg-[color:var(--wm-primary-soft)]', className)} {...props} />
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('h-10 px-3 text-left align-middle text-[11px] font-medium text-[color:var(--wm-muted)]', className)} {...props} />
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-3 align-middle', className)} {...props} />
}

export function Checkbox({ checked, onChange, onClick, className, ...props }: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & { checked?: boolean; onChange?: (checked: boolean) => void }) {
  return <button type="button" role="checkbox" aria-checked={checked} className={cn('wm-checkbox inline-grid size-[17px] shrink-0 place-items-center rounded-[5px] border border-[color:var(--wm-border-strong)] bg-[color:var(--wm-surface)] text-white transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--wm-ring)]/30', checked && 'border-[color:var(--wm-primary)] bg-[color:var(--wm-primary)]', className)} onClick={(event) => { onChange?.(!checked); onClick?.(event) }} {...props}>{checked && <Check size={12} strokeWidth={2.5} />}</button>
}

export function SelectField({ value, onChange, children, className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <span className={cn('wm-select relative inline-flex items-center', className)}><select value={value} onChange={onChange} className="h-9 w-full appearance-none rounded-lg border border-[color:var(--wm-border-strong)] bg-[color:var(--wm-surface)] px-3 pr-8 text-sm text-[color:var(--wm-ink)] outline-none focus:border-[color:var(--wm-primary)] focus:ring-2 focus:ring-[color:var(--wm-ring)]/20" {...props}>{children}</select><ChevronDown size={15} className="pointer-events-none absolute right-2.5 text-[color:var(--wm-muted)]" /></span>
}

export function TextInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('wm-input h-9 w-full rounded-lg border border-[color:var(--wm-border-strong)] bg-[color:var(--wm-surface)] px-3 text-sm text-[color:var(--wm-ink)] outline-none placeholder:text-[color:var(--wm-subtle)] focus:border-[color:var(--wm-primary)] focus:ring-2 focus:ring-[color:var(--wm-ring)]/20', className)} {...props} />
}
