import { cn } from '../../lib/cn.js'

export default function Skeleton({ width = '100%', height = 14, radius, className, style }) {
  return (
    <span
      className={cn('skeleton', className)}
      aria-hidden="true"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: radius ?? undefined,
        ...style,
      }}
    />
  )
}

export function SkeletonText({ lines = 3, gap = 7, lastWidth = '60%' }) {
  return (
    <span className="stack" style={{ gap }} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? lastWidth : '100%'} height={12} />
      ))}
    </span>
  )
}

// A skeleton shaped like the table it is standing in for, so the layout does
// not jump when the real rows arrive.
export function SkeletonTable({ rows = 8, columns = 6 }) {
  return (
    <table className="table" aria-hidden="true">
      <tbody>
        {Array.from({ length: rows }, (_, r) => (
          <tr key={r}>
            {Array.from({ length: columns }, (_, c) => (
              <td key={c}>
                <Skeleton width={c === 0 ? 90 : c === columns - 1 ? 54 : `${55 + ((r + c) % 4) * 12}%`} height={13} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SkeletonCards({ count = 4, height = 96 }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} radius="var(--radius)" />
      ))}
    </>
  )
}
