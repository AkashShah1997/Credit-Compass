import { useEffect, type RefObject } from 'react'

/** Close-on-outside-click plus Escape, the pair every popover needs. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!active) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [ref, active, onDismiss])
}
