// Joins class names, dropping anything falsy. Keeps conditional class lists
// readable: cn('btn', variant && `btn-${variant}`, disabled && 'is-disabled')
export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}
