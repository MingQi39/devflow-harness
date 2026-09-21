import { useCallback, useState } from 'react'

export function usePersistedBool(storageKey: string, defaultValue: boolean) {
  const [value, setValue] = useState(() => readBool(storageKey, defaultValue))

  const setPersisted = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next
        writeBool(storageKey, resolved)
        return resolved
      })
    },
    [storageKey],
  )

  return [value, setPersisted] as const
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === '1') return true
    if (raw === '0') return false
  } catch {
    // ignore
  }
  return fallback
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // ignore
  }
}
