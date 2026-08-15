import { createPortal } from 'react-dom'
import { useId } from 'react'
import { cn } from '../../lib/cn.js'
import useFocusTrap from '../../hooks/useFocusTrap.js'
import { IconButton } from './Button.jsx'

export default function Modal({ open, onClose, title, description, children, footer, size = 'md', className, initialFocus }) {
  const titleId = useId()
  const descId = useId()
  const ref = useFocusTrap(open, onClose)

  if (!open) return null

  return createPortal(
    <div
      className="overlay overlay-modal"
      onMouseDown={(e) => {
        // Only a click that both starts and ends on the backdrop closes it —
        // a drag that ends outside a text selection should not.
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        ref={ref}
        className={cn('modal', `modal-${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        {title ? (
          <header className="modal-header">
            <div className="grow">
              <h2 className="modal-title" id={titleId}>
                {title}
              </h2>
              {description ? (
                <p className="modal-desc" id={descId}>
                  {description}
                </p>
              ) : null}
            </div>
            <IconButton icon="x" label="Close dialog" onClick={onClose} />
          </header>
        ) : null}

        <div className="modal-body">{children}</div>

        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
      {initialFocus}
    </div>,
    document.body,
  )
}

// Confirmation dialog — used before anything destructive or irreversible.
export function ConfirmModal({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', tone = 'primary', loading }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="button" className={`btn btn-${tone} btn-md`} onClick={onConfirm} disabled={loading}>
            {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
            {confirmLabel}
          </button>
        </>
      }
    />
  )
}
