import { createPortal } from 'react-dom'
import { useId } from 'react'
import { cn } from '../../lib/cn.js'
import useFocusTrap from '../../hooks/useFocusTrap.js'
import { IconButton } from './Button.jsx'

export default function Drawer({ open, onClose, title, subtitle, children, footer, actions, size, className }) {
  const titleId = useId()
  const ref = useFocusTrap(open, onClose)

  if (!open) return null

  return createPortal(
    <div
      className="overlay overlay-drawer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <aside
        ref={ref}
        className={cn('drawer', size === 'lg' && 'drawer-lg', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="drawer-header">
          <div className="grow">
            <h2 className="card-title" id={titleId}>
              {title}
            </h2>
            {subtitle ? <p className="card-sub">{subtitle}</p> : null}
          </div>
          {actions}
          <IconButton icon="x" label="Close panel" onClick={onClose} />
        </header>

        <div className="drawer-body">{children}</div>

        {footer ? <footer className="drawer-footer">{footer}</footer> : null}
      </aside>
    </div>,
    document.body,
  )
}
