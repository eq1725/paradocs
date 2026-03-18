import { useEffect, useState } from 'react'

// Thin reading progress bar fixed at the top of the viewport
// Tracks scroll position relative to the article element
export default function ReadingProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(function () {
    function handleScroll() {
      var article = document.querySelector('[data-tour-step="description"]')
      if (!article) return

      var rect = article.getBoundingClientRect()
      var articleTop = window.scrollY + rect.top
      var articleHeight = rect.height
      var scrolled = window.scrollY - articleTop + window.innerHeight * 0.3

      if (scrolled <= 0) {
        setProgress(0)
      } else if (scrolled >= articleHeight) {
        setProgress(100)
      } else {
        setProgress(Math.round((scrolled / articleHeight) * 100))
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return function () {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  if (progress <= 0) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[2px] bg-transparent pointer-events-none"
      aria-hidden="true"
    >
      <div
        className="h-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-150 ease-out"
        style={{ width: progress + '%' }}
      />
    </div>
  )
}
