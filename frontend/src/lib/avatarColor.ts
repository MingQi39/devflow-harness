const PERSON_GRADIENTS = [
  'linear-gradient(135deg, #ff8ab4 0%, #e8478c 100%)',
  'linear-gradient(135deg, #ffb06b 0%, #f07a32 100%)',
  'linear-gradient(135deg, #ffd86b 0%, #f5b623 100%)',
  'linear-gradient(135deg, #7ee0a8 0%, #2fb56a 100%)',
  'linear-gradient(135deg, #6ed4ff 0%, #2a9df4 100%)',
  'linear-gradient(135deg, #9db5ff 0%, #5b7cfa 100%)',
  'linear-gradient(135deg, #c9a8ff 0%, #8b5cf6 100%)',
  'linear-gradient(135deg, #ff9ed6 0%, #e056a0 100%)',
] as const

function hashSeed(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function personAvatarGradient(seed: string): string {
  return PERSON_GRADIENTS[hashSeed(seed) % PERSON_GRADIENTS.length]
}

export function personAvatarLabel(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const first = trimmed[0]
  if (/[a-zA-Z]/.test(first)) return first.toUpperCase()
  return first
}
