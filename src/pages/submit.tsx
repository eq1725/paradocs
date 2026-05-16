'use client'

/**
 * /submit — V10.14 deprecation stub.
 *
 * The standalone legacy submit form is removed. This page now
 * permanently redirects to /start, which is the canonical submit
 * URL for both first-time and returning users (it auto-detects
 * experienced users and skips the welcome screens).
 *
 * Why a redirect stub instead of deleting the file: any external
 * bookmarks, social-share links, search-engine indexed pages, and
 * push notifications that reference /submit keep working. Once
 * we have ~6 months of zero-traffic logs at this URL, the file
 * can be deleted entirely.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function SubmitRedirect() {
  var router = useRouter()
  useEffect(function () {
    // 308-style permanent redirect via client-side router. Preserves
    // any query string (e.g. ?ref=email-blast) by passing through.
    var qs = ''
    try {
      var pairs: string[] = []
      Object.keys(router.query).forEach(function (k) {
        var v = router.query[k]
        if (typeof v === 'string') pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v))
      })
      if (pairs.length > 0) qs = '?' + pairs.join('&')
    } catch (_e) {}
    router.replace('/start' + qs)
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400 text-sm">
      Redirecting to /start…
    </div>
  )
}
