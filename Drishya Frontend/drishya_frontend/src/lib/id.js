let counter = 0

export function nextId(prefix = 'id') {
  counter += 1
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 7)}`
}

export function seededRandom(seed) {
  let value = seed % 2147483647
  if (value <= 0) value += 2147483646
  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

export function pickWeighted(rng, entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = rng() * total
  for (const [value, weight] of entries) {
    roll -= weight
    if (roll <= 0) return value
  }
  return entries[entries.length - 1][0]
}

export function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min
}
