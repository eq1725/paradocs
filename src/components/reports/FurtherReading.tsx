import { useEffect, useState } from 'react'
import { BookOpen, ExternalLink, ShoppingBag } from 'lucide-react'

interface BookRecommendation {
  id: string
  title: string
  author: string
  amazon_asin: string
  cover_image_url: string | null
  editorial_note: string | null
  display_order: number
}

var AFFILIATE_TAG = 'paradocs-20'

function getAmazonUrl(asin: string): string {
  return 'https://www.amazon.com/dp/' + asin + '?tag=' + AFFILIATE_TAG
}

function getCoverUrl(asin: string, coverUrl: string | null): string {
  // Use provided cover URL, or fall back to Amazon's image service
  if (coverUrl) return coverUrl
  return 'https://images-na.ssl-images-amazon.com/images/P/' + asin + '.01._SCLZZZZZZZ_.jpg'
}

interface FurtherReadingProps {
  reportId: string
  className?: string
}

export default function FurtherReading({ reportId, className }: FurtherReadingProps) {
  var [books, setBooks] = useState<BookRecommendation[]>([])
  var [loading, setLoading] = useState(true)
  var [imageErrors, setImageErrors] = useState<Record<string, boolean>>({})

  useEffect(function() {
    if (!reportId) return
    setLoading(true)
    setBooks([])
    setImageErrors({})

    fetch('/api/reports/' + reportId + '/books')
      .then(function(res) { return res.ok ? res.json() : { books: [] } })
      .then(function(data) {
        setBooks(data.books || [])
        setLoading(false)
      })
      .catch(function() { setLoading(false) })
  }, [reportId])

  if (loading || books.length === 0) return null

  return (
    <div className={'glass-card p-4 sm:p-6 mb-6 sm:mb-8 ' + (className || '')}>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <h3 className="font-display font-semibold text-white text-base">Further Reading</h3>
          <p className="text-xs text-gray-500">Primary sources cited in this report</p>
        </div>
      </div>

      {/* Book grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {books.map(function(book) {
          var coverSrc = getCoverUrl(book.amazon_asin, book.cover_image_url)
          var hasImageError = imageErrors[book.id]

          return (
            <a
              key={book.id}
              href={getAmazonUrl(book.amazon_asin)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="group flex gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-amber-500/20 hover:bg-white/[0.04] transition-all duration-300"
            >
              {/* Cover image */}
              <div className="w-16 h-24 sm:w-[72px] sm:h-[108px] rounded-lg overflow-hidden bg-gray-800/50 flex-shrink-0 shadow-lg shadow-black/20">
                {!hasImageError ? (
                  <img
                    src={coverSrc}
                    alt={book.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={function() {
                      setImageErrors(function(prev) {
                        var next: Record<string, boolean> = {}
                        for (var k in prev) next[k] = prev[k]
                        next[book.id] = true
                        return next
                      })
                    }}
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-gray-600" />
                  </div>
                )}
              </div>

              {/* Book details */}
              <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                <div>
                  <h4 className="text-sm font-semibold text-white leading-snug line-clamp-2 group-hover:text-amber-300 transition-colors">
                    {book.title}
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5">{book.author}</p>
                  {book.editorial_note && (
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed line-clamp-2">
                      {book.editorial_note}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-400/70 font-medium">
                    <ShoppingBag className="w-3 h-3" />
                    View on Amazon
                  </span>
                  <ExternalLink className="w-2.5 h-2.5 text-amber-400/40" />
                </div>
              </div>
            </a>
          )
        })}
      </div>

      {/* Affiliate disclosure — always visible, tasteful */}
      <p className="mt-4 pt-3 border-t border-white/[0.05] text-[10px] text-gray-600 leading-relaxed">
        As an Amazon Associate, Paradocs earns from qualifying purchases. Book recommendations are editorially selected based on source material cited in this report.
      </p>
    </div>
  )
}
