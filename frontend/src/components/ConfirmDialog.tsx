import { useEffect, useRef } from 'react'
import type { FormEvent, ReactNode } from 'react'

// A modal built on <dialog>, so the browser handles focus trapping, Escape and
// the backdrop. Children explain what will happen and hold any extra inputs.
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  busy,
  canConfirm = true,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean
  title: string
  confirmLabel: string
  busy: boolean
  canConfirm?: boolean
  onConfirm: () => void
  onCancel: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (canConfirm && !busy) onConfirm()
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onCancel()
      }}
    >
      {open && (
        <form className="stack" onSubmit={handleSubmit}>
          <h2 id="dialog-title" className="card__title">
            {title}
          </h2>
          {children}
          <div className="dialog__actions">
            <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn--danger" disabled={!canConfirm || busy}>
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
