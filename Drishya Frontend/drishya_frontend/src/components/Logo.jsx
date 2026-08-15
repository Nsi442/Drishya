import './Logo.css'

// Vesica construction: two arcs of radius R=100, centres R apart (vertically).
// Eye is 1.732R (√3·R) wide by R tall.
const TONE_COLORS = {
  light: { primary: '#000', secondary: '#767676' },
  dark: { primary: '#fff', secondary: '#b3b3b3' },
}

function EyeIcon({ size, tone }) {
  const colors = tone ? TONE_COLORS[tone] : null
  const style = colors
    ? { '--logo-primary': colors.primary, '--logo-secondary': colors.secondary }
    : undefined

  return (
    <svg
      className="logo-icon"
      width={size}
      height={(size * 160) / 240}
      viewBox="-120 -80 240 160"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Drishya"
      style={style}
    >
      <path
        d="M -86.602 0 A 100 100 0 0 1 86.602 0 A 100 100 0 0 1 -86.602 0 Z"
        fill="none"
        stroke="var(--logo-primary)"
        strokeWidth="12"
      />
      <circle cx="0" cy="0" r="30" fill="none" stroke="var(--logo-secondary)" strokeWidth="12" />
      <circle cx="0" cy="0" r="9" fill="var(--logo-secondary)" />
    </svg>
  )
}

// tone: omit to follow the app's light/dark theme; pass 'light' or 'dark' to
// force a fixed rendering regardless of theme (e.g. always-light mark on a navy hero).
function Logo({ variant = 'horizontal', tagline = false, size = 40, tone }) {
  const textStyle = tone
    ? { '--logo-primary': TONE_COLORS[tone].primary, '--logo-secondary': TONE_COLORS[tone].secondary }
    : undefined

  if (variant === 'icon') {
    return <EyeIcon size={size} tone={tone} />
  }

  return (
    <div className={`logo logo-${variant}`} style={textStyle}>
      <EyeIcon size={size} tone={tone} />
      <div className="logo-text">
        <span className="logo-word">drishya</span>
        {tagline && <span className="logo-tagline">real-time transport visibility</span>}
      </div>
    </div>
  )
}

export default Logo
