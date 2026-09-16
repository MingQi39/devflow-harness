import type { KeyboardEvent, MutableRefObject } from 'react'

export interface ComposerCompositionState {
  isComposingRef: MutableRefObject<boolean>
  /** IME 刚用 Enter 确认候选词时，keydown 可能在 compositionend 之后触发 */
  enterLockRef: MutableRefObject<boolean>
}

/** Cursor 风格：Enter 发送，Shift+Enter 换行；IME 组字/刚确认候选时不发送 */
export function shouldSubmitComposerOnEnter(
  event: KeyboardEvent<HTMLTextAreaElement>,
  composition: ComposerCompositionState,
): boolean {
  if (event.key !== 'Enter' || event.shiftKey) return false
  if (event.nativeEvent.isComposing) return false
  if (composition.isComposingRef.current) return false
  if (composition.enterLockRef.current) return false
  // 部分浏览器 IME 候选确认时 keyCode 为 229
  if (event.keyCode === 229) return false
  return true
}

export function handleComposerCompositionEnd(
  composition: ComposerCompositionState,
): void {
  composition.isComposingRef.current = false
  composition.enterLockRef.current = true
  window.setTimeout(() => {
    composition.enterLockRef.current = false
  }, 50)
}
