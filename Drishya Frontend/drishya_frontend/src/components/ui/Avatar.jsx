import { cn } from '../../lib/cn.js'

function initialsFrom(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function Avatar({ name, initials, size, square = false, className, tone }) {
  const text = initials ?? initialsFrom(name)
  return (
    <span
      className={cn('avatar', size && `avatar-${size}`, square && 'avatar-square', className)}
      title={name}
      aria-hidden={name ? 'true' : undefined}
      style={
        tone
          ? { background: `var(--${tone}-soft)`, color: `var(--${tone}-text)`, borderColor: `var(--${tone}-border)` }
          : undefined
      }
    >
      {text}
    </span>
  )
}

export function AvatarStack({ names = [], max = 4, size = 'sm' }) {
  const shown = names.slice(0, max)
  const extra = names.length - shown.length
  return (
    <span className="avatar-stack">
      {shown.map((name) => (
        <Avatar key={name} name={name} size={size} />
      ))}
      {extra > 0 ? <Avatar initials={`+${extra}`} size={size} tone="neutral" /> : null}
    </span>
  )
}
