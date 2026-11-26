import { useEffect } from 'react'
import type { RefObject } from 'react'

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Calls onVisible once, the first time the element scrolls into view.
// Returns false when the element was already on screen at load (or motion
// is reduced), so callers can skip the animation and show the final state.
export function watchFirstView(element: Element, onVisible: () => void): (() => void) | false {
  if (prefersReducedMotion() || element.getBoundingClientRect().top < window.innerHeight) return false
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect()
        onVisible()
      }
    },
    { rootMargin: '0px 0px -10% 0px' },
  )
  observer.observe(element)
  return () => observer.disconnect()
}

// Fades and slides up every [data-reveal] element inside the container as it
// scrolls into view. Anything already on screen at load is never hidden, so
// the first frame is complete and nothing shifts.
export function useReveal(container: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = container.current
    if (!root) return
    const cleanups: (() => void)[] = []
    root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((element) => {
      const stop = watchFirstView(element, () => element.classList.remove('reveal-pending'))
      if (stop) {
        element.classList.add('reveal-pending')
        cleanups.push(stop)
      }
    })
    return () => cleanups.forEach((stop) => stop())
  }, [container])
}
