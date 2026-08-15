import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn.js'

export default function Card({ children, className, padded = false, as: As = 'section', ...rest }) {
  return (
    <As className={cn('card', padded && 'card-pad', className)} {...rest}>
      {children}
    </As>
  )
}

export function CardHeader({ title, subtitle, actions, className, children }) {
  return (
    <header className={cn('card-header', className)}>
      <div className="grow">
        {title ? <h2 className="card-title">{title}</h2> : null}
        {subtitle ? <p className="card-sub">{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className="row gap-6 shrink-0">{actions}</div> : null}
    </header>
  )
}

export function CardBody({ children, className, flush = false }) {
  return <div className={cn('card-body', flush && 'card-body-flush', className)}>{children}</div>
}

export function CardFooter({ children, className }) {
  return <footer className={cn('card-footer', className)}>{children}</footer>
}

// A card that is entirely a link — used for trip cards and carrier tiles.
export function LinkCard({ to, children, className, ...rest }) {
  return (
    <Link to={to} className={cn('card card-interactive', className)} {...rest}>
      {children}
    </Link>
  )
}
