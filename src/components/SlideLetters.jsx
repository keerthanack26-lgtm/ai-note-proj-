import { useEffect, useRef, useState } from 'react'

function toParts(text) {
  return Array.isArray(text) ? text : [{ text }]
}

function isInView(node) {
  const box = node.getBoundingClientRect()
  return box.top < window.innerHeight * 0.95 && box.bottom > 0
}

export default function SlideLetters({ as: Tag = 'h2', text, className = '', delay = 0 }) {
  const ref = useRef(null)
  const [active, setActive] = useState(false)
  const parts = toParts(text)
  const label = parts.map((part) => String(part.text || '').replace(/\n/g, ' ')).join('').replace(/\s+/g, ' ').trim()

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const reveal = () => setActive(true)
    if (reduced) {
      reveal()
      return undefined
    }

    if (isInView(node)) reveal()

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) reveal()
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    )
    observer.observe(node)

    const fallback = window.setTimeout(reveal, 900)
    return () => {
      observer.disconnect()
      window.clearTimeout(fallback)
    }
  }, [])

  let index = 0

  return (
    <Tag ref={ref} className={`slide-letters${active ? ' is-on' : ''}${className ? ` ${className}` : ''}`} aria-label={label}>
      {parts.map((part, partIndex) => {
        const chunks = String(part.text || '').split(/(\n|\s+)/)
        return (
          <span key={partIndex} className={part.className} aria-hidden="true">
            {chunks.map((chunk, chunkIndex) => {
              if (!chunk) return null
              if (chunk === '\n') {
                return <br key={`${partIndex}-br-${chunkIndex}`} aria-hidden="true" />
              }
              if (/^\s+$/.test(chunk)) {
                return (
                  <span key={`${partIndex}-s-${chunkIndex}`} className="letter-space">
                    {' '}
                  </span>
                )
              }
              return (
                <span key={`${partIndex}-w-${chunkIndex}`} className="letter-word">
                  {[...chunk].map((char, charIndex) => {
                    const order = index
                    index += 1
                    return (
                      <span key={`${partIndex}-${chunkIndex}-${charIndex}`} className="letter" style={{ animationDelay: `${delay + order * 0.032}s` }}>
                        {char}
                      </span>
                    )
                  })}
                </span>
              )
            })}
          </span>
        )
      })}
    </Tag>
  )
}
