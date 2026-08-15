export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function passwordStrength(value) {
  let score = 0
  if (value.length >= 8) score += 1
  if (value.length >= 12) score += 1
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1
  if (/\d/.test(value)) score += 1
  if (/[^A-Za-z0-9]/.test(value)) score += 1
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong']
  return { score, label: labels[score] }
}

export function required(value, message = 'This field is required') {
  return value && String(value).trim() ? null : message
}
