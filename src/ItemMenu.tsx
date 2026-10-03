import { useEffect, useRef, useState } from 'react'

// Uma única ação por item da árvore: o botão ⋯ abre Renomear / Adicionar / Excluir.
export interface ItemAction { label: string; onSelect: () => void; danger?: boolean }
export function ItemMenu({ label, actions }: { label: string; actions: ItemAction[] }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLButtonElement>('.item-menu-button')?.focus() } }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div className="item-menu" ref={root}>
    <button type="button" className="item-menu-button" aria-haspopup="menu" aria-expanded={open} aria-label={`Ações: ${label}`} title="Ações" onClick={() => setOpen(value => !value)}>⋯</button>
    {open && <div className="item-menu-list" role="menu" aria-label={label}>{actions.map(action => <button type="button" role="menuitem" key={action.label} className={action.danger ? 'danger' : ''} onClick={() => { setOpen(false); action.onSelect() }}>{action.label}</button>)}</div>}
  </div>
}

// Edição do nome no próprio lugar: Enter ou sair do campo confirma; Esc cancela.
export function InlineName({ value, label, onCommit, onDone }: { value: string; label: string; onCommit: (name: string) => void; onDone: () => void }) {
  const [draft, setDraft] = useState(value)
  const done = useRef(false)
  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    const name = draft.trim()
    if (save && name && name !== value) onCommit(name)
    onDone()
  }
  return <input className="inline-name" aria-label={label} value={draft} autoFocus onFocus={event => event.currentTarget.select()}
    onChange={event => setDraft(event.target.value)} onBlur={() => finish(true)}
    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); finish(true) } else if (event.key === 'Escape') { event.preventDefault(); finish(false) } }}/>
}
