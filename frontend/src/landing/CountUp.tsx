import { useEffect, useMemo, useRef } from 'react'
import { watchFirstView } from './motion'

const DURATION_MS = 1400

// A number that counts up from zero the first time it scrolls into view.
// It renders the real figure until then, so screen readers, search engines and
// anyone with reduced motion always get the true number.
export function CountUp({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const valueRef = useRef<HTMLSpanElement>(null)
  // One formatter per number: building it is the slow part, so not once per frame
  const formatter = useMemo(
    () => new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    [decimals],
  )
  const finalText = `${formatter.format(value)}${suffix}`

  useEffect(() => {
    const element = ref.current
    const output = valueRef.current
    if (!element || !output) return
    const show = (current: number) => {
      output.textContent = `${formatter.format(current)}${suffix}`
    }
    const animation = { frame: 0 }
    const stop = watchFirstView(element, () => {
      const start = performance.now()
      // The text is written straight to the DOM, so counting doesn't re-render React on every frame
      const tick = (now: number) => {
        const progress = Math.min((now - start) / DURATION_MS, 1)
        // Ease out, so the count slows as it lands on the real figure
        show(value * (1 - (1 - progress) ** 3))
        if (progress < 1) animation.frame = requestAnimationFrame(tick)
      }
      animation.frame = requestAnimationFrame(tick)
    })
    if (!stop) return
    show(0)
    return () => {
      stop()
      cancelAnimationFrame(animation.frame)
      show(value)
    }
  }, [value, suffix, formatter])

  return (
    <span ref={ref} className="count-up">
      <span className="visually-hidden">{finalText}</span>
      {/* The invisible copy reserves the final width, so the layout never moves while counting */}
      <span className="count-up__sizer" aria-hidden="true">
        {finalText}
      </span>
      <span ref={valueRef} className="count-up__value" aria-hidden="true">
        {finalText}
      </span>
    </span>
  )
}
