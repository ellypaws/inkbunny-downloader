export function formatBytes(value: number): string {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let current = value
  let unitIndex = 0
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024
    unitIndex += 1
  }
  return `${current.toFixed(current >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

export function ratingsLabel(mask: string): string {
  if (!mask) return 'No session ratings'
  const labels = ['General', 'Nudity', 'Mild Violence', 'Sexual', 'Strong Violence']
  return labels.filter((_, index) => mask[index] === '1').join(', ') || 'General only'
}

export function accentClass(accent?: string): string {
  switch (accent) {
    case 'mint':
      return 'from-[#B5EAD7]/90'
    case 'lavender':
      return 'from-[#E0BBE4]/90'
    case 'sky':
      return 'from-[#89CFF0]/90'
    default:
      return 'from-[#FFB7B2]/90'
  }
}
