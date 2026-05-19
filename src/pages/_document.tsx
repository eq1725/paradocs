import { Html, Head, Main, NextScript } from 'next/document'

/**
 * V10.2 — In-HTML splash overlay for PWA standalone mode.
 *
 * iOS 26 deprecated the legacy apple-touch-startup-image meta-tag
 * system. Safari now auto-generates a splash from manifest icons +
 * background_color, which gives users a generic icon-on-bg flash
 * not our branded wordmark.
 *
 * To get our wordmark splash everywhere — iOS 26+, Android, future
 * versions, regardless of caching quirks — we render an HTML
 * overlay inline in the document body. It's gated to PWA
 * standalone mode via a CSS @media query so regular browser visits
 * never see it. After hydration, a small script removes it.
 *
 * The HTML + inline styles mean the splash shows the INSTANT the
 * page bytes arrive, before any JS runs. The remove script waits
 * ~600ms minimum so the brand impression lands.
 */

const SPLASH_CSS = `
#paradocs-splash {
  display: none;
}
@media (display-mode: standalone), (display-mode: fullscreen) {
  #paradocs-splash {
    display: flex;
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: #0a0a14;
    align-items: center;
    justify-content: center;
    transition: opacity 320ms ease-out;
  }
  #paradocs-splash.hide {
    opacity: 0;
    pointer-events: none;
  }
  #paradocs-splash-wordmark {
    font-family: 'Changa', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-weight: 800;
    font-size: 11vw;
    color: #ffffff;
    letter-spacing: -0.01em;
    line-height: 1;
  }
  #paradocs-splash-wordmark .dot {
    color: #a855f7;
  }
}
`.trim()

// Inline script: keeps splash visible at least 1500ms so the
// wordmark moment fully lands (600ms → 1200ms → 1500ms after
// Chase's feedback that it flashed too fast).
const SPLASH_REMOVE_JS = `
(function(){
  if (!window.matchMedia) return;
  if (!window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) return;
  var splash = document.getElementById('paradocs-splash');
  if (!splash) return;
  var start = Date.now();
  function hide() {
    var elapsed = Date.now() - start;
    var wait = Math.max(0, 1500 - elapsed);
    setTimeout(function() {
      splash.classList.add('hide');
      setTimeout(function() { splash.parentNode && splash.parentNode.removeChild(splash); }, 360);
    }, wait);
  }
  if (document.readyState === 'complete') hide();
  else window.addEventListener('load', hide, { once: true });
})();
`.trim()

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* V10.6.6 — Favicon refs LIVE in _app.tsx (single source of
            truth). Previously declared in BOTH _document.tsx and
            _app.tsx, which produced inconsistent tab icons because
            browsers pick differently from multiple <link rel="icon">
            tags. Removed the duplicates here so the v5 transparent
            purple-P is the only declaration the browser sees. */}
        {/* V10.7.E.7 — preconnect to Supabase Storage so the first
            video / poster fetch on /discover doesn't pay the DNS +
            TLS handshake cost (~100-300ms on cellular). The env var
            lives in NEXT_PUBLIC_SUPABASE_URL which is the API
            hostname; Storage shares the same origin via the
            /storage/v1 path prefix so the same preconnect works for
            both signed-URL fetches. Cheap; if SUPABASE_URL isn't set
            (local dev), the tag is omitted. */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <>
            <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
          </>
        )}
        {/* V10.2 splash CSS — inlined so it's available before any
            external stylesheet loads. Gated to display-mode:
            standalone so it only renders in PWA launch contexts. */}
        <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      </Head>
      <body className="antialiased">
        {/* Splash overlay — rendered first in the body so it
            paints before any app shell. CSS @media gate means it
            stays display:none in regular browser tabs. */}
        <div id="paradocs-splash" aria-hidden="true">
          <div id="paradocs-splash-wordmark">
            Paradocs<span className="dot">.</span>
          </div>
        </div>
        <Main />
        <NextScript />
        {/* Splash removal script — runs after window load. The
            display-mode check inside short-circuits in non-PWA
            contexts, so this is a no-op for browser tabs. */}
        <script dangerouslySetInnerHTML={{ __html: SPLASH_REMOVE_JS }} />
      </body>
    </Html>
  )
}
