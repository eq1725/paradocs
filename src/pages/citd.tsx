import React, { useState } from 'react'
import Head from 'next/head'

/**
 * /citd — "Contact in the Desert" event landing page.
 *
 * Standalone landing page used as the only publicly-accessible route
 * during the CITD soft-launch (V11.17.39, May 28 2026). QR code on
 * event marketing materials points here.
 *
 * V11.17.39 revisions:
 *   - Phone mockup interior swapped from CSS/SVG fake-app to the
 *     production /showcase/feed.mp4 used on the homepage
 *   - New laptop mockup section paired beneath the phone, showing
 *     /showcase/map.mp4
 *   - Email signup form (CITDSignupForm) replaces the App Store /
 *     Google Play "Coming Soon" badges as the primary CTA. Captures
 *     to citd_signups via /api/citd/signup
 *
 * Middleware (src/middleware.ts) PUBLIC_PATHS includes /citd and
 * /showcase/ so unauthed visitors (the QR-code traffic) can load this
 * page + the videos without hitting the dev-gate basic-auth wall.
 *
 * Phase 2 (app launch): Auto-detect iOS / Android and redirect
 *   to the appropriate app store. Fallback to this page for desktop.
 */

// ── Uncomment when apps are live ──────────────────────────────
// const APP_STORE_URL = 'https://apps.apple.com/app/paradocs/id...'
// const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=...'

/**
 * CITDSignupForm — Inline email-capture form for the CITD landing page.
 *
 * Three states: idle / submitting / submitted. On success we replace the
 * form with a quiet confirmation card so visitors get immediate feedback
 * without leaving /citd. Errors surface inline below the input.
 */
function CITDSignupForm() {
  var [email, setEmail] = useState('')
  var [name, setName] = useState('')
  var [status, setStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle')
  var [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'submitting' || status === 'submitted') return
    var trimmed = email.trim().toLowerCase()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setStatus('error')
      setErrorMsg('Please enter a valid email address.')
      return
    }
    setStatus('submitting')
    setErrorMsg(null)
    try {
      var resp = await fetch('/api/citd/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          name: name.trim() || undefined,
          referrer: 'citd',
        }),
      })
      if (!resp.ok) {
        var j: any = null
        try { j = await resp.json() } catch (_e) { /* ignore */ }
        setStatus('error')
        setErrorMsg(j && j.error === 'invalid_email' ? 'That email looks invalid. Double-check it?' : 'Something went wrong. Please try again.')
        return
      }
      setStatus('submitted')
    } catch (_e) {
      setStatus('error')
      setErrorMsg('Network error — please try again in a moment.')
    }
  }

  if (status === 'submitted') {
    return (
      <div className="citd-signup-success">
        <div className="citd-signup-success-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <div className="citd-signup-success-title">You&rsquo;re on the list.</div>
          <div className="citd-signup-success-sub">We&rsquo;ll email you the moment the app opens up.</div>
        </div>
      </div>
    )
  }

  return (
    <form className="citd-signup-form" onSubmit={handleSubmit} noValidate>
      <div className="citd-signup-label">Join the launch list</div>
      <div className="citd-signup-row">
        <input
          type="text"
          name="name"
          placeholder="Your name (optional)"
          autoComplete="given-name"
          className="citd-signup-input citd-signup-input-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={status === 'submitting'}
          aria-label="Your name (optional)"
        />
        <input
          type="email"
          name="email"
          placeholder="you@email.com"
          autoComplete="email"
          inputMode="email"
          required
          className="citd-signup-input citd-signup-input-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'submitting'}
          aria-label="Email address"
        />
        <button
          type="submit"
          className="citd-signup-button"
          disabled={status === 'submitting'}
          aria-label="Submit signup"
        >
          {status === 'submitting' ? '...' : 'Get notified'}
        </button>
      </div>
      {status === 'error' && errorMsg && (
        <div className="citd-signup-error" role="alert">{errorMsg}</div>
      )}
      <div className="citd-signup-hint">We&rsquo;ll only email you when the app opens.</div>
    </form>
  )
}

export default function CITDPage() {
  // ── Phase 2: auto-redirect to app stores ──────────────────
  // useEffect(() => {
  //   const ua = navigator.userAgent || ''
  //   if (/iPhone|iPad|iPod/i.test(ua)) {
  //     window.location.href = APP_STORE_URL
  //   } else if (/Android/i.test(ua)) {
  //     window.location.href = PLAY_STORE_URL
  //   }
  // }, [])

  return (
    <>
      <Head>
        <title>Paradocs — The Paranormal, In Your Pocket</title>
        <meta
          name="description"
          content="The world's largest database of paranormal phenomena is coming to iOS and Android."
        />
        <meta property="og:title" content="Paradocs — The Paranormal, In Your Pocket" />
        <meta
          property="og:description"
          content="Search millions of reports, map the unexplained, build case files — anywhere."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://discoverparadocs.com/citd" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Changa:wght@600;700;800&family=Changa+One&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="citd-page">
        {/* Left: Content */}
        <div className="citd-content">
          <div className="citd-badge">Coming Soon</div>
          <h1 className="citd-headline">
            The paranormal,<br />
            in your <span className="citd-accent">pocket.</span>
          </h1>
          <p className="citd-desc">
            The world&rsquo;s largest database of paranormal phenomena is coming to iOS and Android.
            Search millions of reports, map the unexplained, build case files — anywhere.
          </p>
          {/* V11.17.39 — Email signup form (replaces the previous
              "Coming Soon" App Store / Google Play badges). CITD
              visitors join the waitlist; we'll batch-invite once the
              dev gate is lifted. POSTs to /api/citd/signup which is
              already in the middleware PUBLIC_PATHS allow-list. */}
          <CITDSignupForm />

          {/* V11.17.39 — Keep the original App Store / Google Play
              "Coming Soon" badges at full prominence alongside the
              email form. Per operator preference: visitors should see
              the form AND the badges, both treated as primary chrome. */}
          <div className="citd-store-buttons">
            {/* Apple App Store */}
            <div className="citd-store-btn">
              <span className="citd-soon-tag">Soon</span>
              <svg className="citd-store-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              <div className="citd-store-text">
                <span className="citd-store-label">Coming to</span>
                <span className="citd-store-name">App Store</span>
              </div>
            </div>
            {/* Google Play */}
            <div className="citd-store-btn">
              <span className="citd-soon-tag">Soon</span>
              <svg className="citd-store-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-1.4l2.465 1.373c.391.217.636.63.636 1.073s-.245.856-.636 1.073l-2.465 1.427-2.534-2.534 2.534-2.412zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z" />
              </svg>
              <div className="citd-store-text">
                <span className="citd-store-label">Coming to</span>
                <span className="citd-store-name">Google Play</span>
              </div>
            </div>
          </div>
          <p className="citd-stat-line">
            <strong>4,792+</strong> phenomena types catalogued
          </p>
        </div>

        {/* Right: Phone mockup
            V11.17.39 — The hand-built CSS/SVG fake app that used to
            render here has been replaced with the actual product video
            we use on the homepage (/showcase/feed.mp4). Real footage
            > stylized illustration for an event landing page. The
            dynamic-island overlay and bezel remain so the phone-frame
            identity is preserved. */}
        <div className="citd-phone-wrap">
          <div className="citd-bezel">
            <div className="citd-vol-down" />
            <div className="citd-screen-wrap">
              <div className="citd-dynamic-island" />
              <div className="citd-screen">
                <video
                  className="citd-screen-video"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  poster="/showcase/feed-poster.jpg"
                  aria-label="Paradocs feed preview"
                >
                  <source src="/showcase/feed.mp4" type="video/mp4" />
                </video>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* V11.17.39 — Laptop showcase section (Contact in the Desert event).
          Pairs with the phone mockup above. Uses /showcase/desktop-demo.mp4
          (full Paradocs desktop walkthrough, also used on the homepage's
          MapShowcase). Stacked beneath the hero so visitors who scroll
          see the desktop dimension of the product. */}
      <section className="citd-laptop-section">
        <h2 className="citd-laptop-heading">
          Explore <span className="citd-accent">137,000+</span> documented experiences,
          mapped worldwide.
        </h2>
        <p className="citd-laptop-sub">
          Witness reports, sightings, anomalous phenomena. Filtered, geocoded,
          and ready to explore from anywhere.
        </p>
        <div className="citd-laptop-wrap">
          <div className="citd-laptop-bezel">
            <div className="citd-laptop-camera" />
            <div className="citd-laptop-screen">
              <video
                className="citd-laptop-video"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                poster="/showcase/map-poster.jpg"
                aria-label="Paradocs interactive map preview"
              >
                <source src="/showcase/desktop-demo.mp4" type="video/mp4" />
              </video>
            </div>
          </div>
          <div className="citd-laptop-base" />
          <div className="citd-laptop-notch" />
        </div>
      </section>

      <style jsx global>{`
        /* ─── CITD Landing Page ─── */
        /* Override any app-level layout */
        body { background: #0a0a14 !important; }

        /* Starfield */
        .citd-page::before {
          content: '';
          position: fixed;
          inset: 0;
          background:
            radial-gradient(1px 1px at 10% 20%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 30% 60%, rgba(255,255,255,0.3) 0%, transparent 100%),
            radial-gradient(1px 1px at 50% 10%, rgba(255,255,255,0.35) 0%, transparent 100%),
            radial-gradient(1px 1px at 70% 80%, rgba(255,255,255,0.25) 0%, transparent 100%),
            radial-gradient(1px 1px at 90% 40%, rgba(255,255,255,0.3) 0%, transparent 100%),
            radial-gradient(1px 1px at 15% 85%, rgba(255,255,255,0.2) 0%, transparent 100%),
            radial-gradient(1px 1px at 45% 45%, rgba(255,255,255,0.3) 0%, transparent 100%),
            radial-gradient(1px 1px at 80% 15%, rgba(255,255,255,0.25) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 25% 35%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 65% 55%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 85% 70%, rgba(255,255,255,0.35) 0%, transparent 100%),
            radial-gradient(1px 1px at 5% 50%, rgba(255,255,255,0.2) 0%, transparent 100%),
            radial-gradient(1px 1px at 55% 90%, rgba(255,255,255,0.3) 0%, transparent 100%),
            radial-gradient(1px 1px at 35% 15%, rgba(255,255,255,0.25) 0%, transparent 100%),
            radial-gradient(1px 1px at 75% 30%, rgba(255,255,255,0.2) 0%, transparent 100%);
          background-color: #0a0a14;
          z-index: -2;
          pointer-events: none;
        }

        /* Purple ambient glow */
        .citd-page::after {
          content: '';
          position: fixed;
          top: 30%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 800px;
          height: 600px;
          background: radial-gradient(ellipse, rgba(144, 0, 240, 0.08) 0%, transparent 70%);
          z-index: -1;
          pointer-events: none;
        }

        .citd-page {
          position: relative;
          max-width: 1100px;
          margin: 0 auto;
          padding: 60px 24px 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 60px;
          min-height: 100vh;
          font-family: 'Inter', -apple-system, sans-serif;
          color: #fff;
        }

        @media (max-width: 768px) {
          .citd-page {
            flex-direction: column;
            text-align: center;
            gap: 48px;
            padding: 48px 20px 40px;
          }
        }

        /* ─── Left Content ─── */
        .citd-content { flex: 1; max-width: 500px; }

        .citd-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 16px;
          border: 1px solid rgba(144, 0, 240, 0.4);
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #c084fc;
          margin-bottom: 32px;
        }
        .citd-badge::before {
          content: '';
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #9000F0;
          box-shadow: 0 0 6px #9000F0;
        }

        .citd-headline {
          font-family: 'Changa', sans-serif;
          font-size: clamp(36px, 5.5vw, 56px);
          font-weight: 700;
          line-height: 1.1;
          margin-bottom: 24px;
          color: #fff;
        }
        .citd-accent { color: #9000F0; }

        .citd-desc {
          font-size: 16px;
          line-height: 1.7;
          color: #a0a0b8;
          margin-bottom: 36px;
          max-width: 420px;
        }
        @media (max-width: 768px) {
          .citd-desc { margin-left: auto; margin-right: auto; }
        }

        /* Store buttons */
        .citd-store-buttons {
          display: flex;
          gap: 12px;
          margin-bottom: 28px;
        }
        @media (max-width: 768px) {
          .citd-store-buttons { justify-content: center; }
        }

        .citd-store-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 12px 24px;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          background: rgba(255,255,255,0.04);
          color: #fff;
          text-decoration: none;
          cursor: default;
          transition: border-color 0.2s;
        }
        .citd-store-btn:hover { border-color: rgba(255,255,255,0.2); }
        .citd-store-icon { width: 22px; height: 22px; flex-shrink: 0; }
        .citd-store-text { display: flex; flex-direction: column; line-height: 1.2; }
        .citd-store-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #a0a0b8; }
        .citd-store-name { font-size: 15px; font-weight: 600; }
        .citd-soon-tag {
          position: absolute;
          top: -8px; right: -8px;
          background: #9000F0;
          color: #fff;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 6px;
        }

        .citd-stat-line { font-size: 13px; color: #666680; }
        .citd-stat-line strong { color: #8888a0; font-weight: 600; }

        /* ─── Phone Bezel ─── */
        .citd-phone-wrap { flex-shrink: 0; position: relative; }

        .citd-bezel {
          position: relative;
          width: 300px;
          height: 620px;
          border-radius: 48px;
          background: linear-gradient(145deg, #2a2a3a 0%, #1a1a28 50%, #222233 100%);
          padding: 10px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.08),
            inset 0 -1px 0 rgba(0,0,0,0.3),
            0 25px 80px rgba(0,0,0,0.6),
            0 8px 30px rgba(0,0,0,0.4),
            0 0 100px rgba(144,0,240,0.06),
            0 0 200px rgba(144,0,240,0.03);
        }

        /* Side buttons */
        .citd-bezel::before {
          content: '';
          position: absolute;
          left: -3px; top: 120px;
          width: 3px; height: 30px;
          background: linear-gradient(180deg, #333 0%, #222 100%);
          border-radius: 2px 0 0 2px;
        }
        .citd-bezel::after {
          content: '';
          position: absolute;
          right: -3px; top: 150px;
          width: 3px; height: 50px;
          background: linear-gradient(180deg, #333 0%, #222 100%);
          border-radius: 0 2px 2px 0;
        }
        .citd-vol-down {
          position: absolute;
          left: -3px; top: 165px;
          width: 3px; height: 30px;
          background: linear-gradient(180deg, #333 0%, #222 100%);
          border-radius: 2px 0 0 2px;
          z-index: 5;
        }

        @media (max-width: 768px) {
          .citd-bezel { width: 260px; height: 540px; border-radius: 42px; }
          .citd-screen-wrap { border-radius: 34px !important; }
        }

        .citd-screen-wrap {
          width: 100%; height: 100%;
          border-radius: 40px;
          overflow: hidden;
          position: relative;
          background: #0d0d1a;
          border: 1px solid rgba(0,0,0,0.5);
        }

        .citd-dynamic-island {
          position: absolute;
          top: 10px; left: 50%;
          transform: translateX(-50%);
          width: 100px; height: 28px;
          background: #000;
          border-radius: 20px;
          z-index: 20;
        }

        /* Status bar */
        .citd-status-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px 0;
          height: 48px;
          position: relative;
          z-index: 15;
        }
        .citd-status-time { font-size: 13px; font-weight: 600; color: #fff; width: 54px; }
        .citd-status-icons { display: flex; align-items: center; gap: 5px; width: 54px; justify-content: flex-end; }
        .citd-status-icons svg { width: 14px; height: 14px; }

        .citd-screen {
          width: 100%; height: 100%;
          display: flex;
          flex-direction: column;
        }

        /* App header */
        .citd-app-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 2px 16px 6px;
        }
        .citd-app-logo {
          font-family: 'Changa', sans-serif;
          font-size: 17px;
          font-weight: 700;
          color: #fff;
        }
        .citd-logo-dot { color: #9000F0; }
        .citd-header-icons { display: flex; gap: 12px; }
        .citd-header-icons svg { width: 16px; height: 16px; color: #888; }

        /* Tab bar */
        .citd-tab-bar {
          display: flex;
          padding: 0 16px;
          margin-bottom: 6px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .citd-tab {
          flex: 1;
          text-align: center;
          font-size: 11px;
          font-weight: 500;
          color: #555;
          padding: 7px 0;
          position: relative;
        }
        .citd-tab-active { color: #fff; }
        .citd-tab-active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 20%; right: 20%;
          height: 2px;
          background: #9000F0;
          border-radius: 1px;
        }

        /* Filter bar */
        .citd-filter-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 5px 16px;
          margin-bottom: 2px;
        }
        .citd-filter-count { font-size: 11px; font-weight: 600; color: #a0a0b8; }
        .citd-filter-icon { width: 14px; height: 14px; color: #555; }

        /* Map area */
        .citd-map-area {
          flex: 1;
          position: relative;
          overflow: hidden;
          background: radial-gradient(ellipse at 50% 40%, rgba(144,0,240,0.03) 0%, transparent 60%), #0a0a14;
        }
        .citd-map-area::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
          background-size: 28px 28px;
          z-index: 0;
        }

        /* ─── Map Dots ─── */
        .mdot {
          position: absolute;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 8px;
          font-weight: 700;
          color: #fff;
          z-index: 2;
        }
        .mdot::before {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          opacity: 0.35;
          animation: citd-pulse 3s ease-in-out infinite;
        }
        .mdot::after {
          content: '';
          position: absolute;
          inset: -12px;
          border-radius: 50%;
          opacity: 0.12;
          animation: citd-pulse 3s ease-in-out infinite 0.5s;
        }

        .mdot-cluster {
          background: #9000F0;
          box-shadow: 0 0 16px rgba(144,0,240,0.6), 0 0 32px rgba(144,0,240,0.25);
        }
        .mdot-cluster::before, .mdot-cluster::after { background: #9000F0; }

        .mdot-c1 { width: 36px; height: 36px; top: 16%; left: 52%; font-size: 10px; }
        .mdot-c2 { width: 26px; height: 26px; top: 32%; left: 18%; }
        .mdot-c3 { width: 30px; height: 30px; top: 42%; right: 16%; font-size: 9px; }
        .mdot-c4 { width: 22px; height: 22px; top: 58%; left: 36%; }
        .mdot-c5 { width: 28px; height: 28px; top: 20%; left: 28%; }

        .mdot-sm { width: 8px; height: 8px; }
        .mdot-sm::before { inset: -3px; }
        .mdot-sm::after { inset: -6px; }

        .mdot-s1 { background: #9000F0; box-shadow: 0 0 8px rgba(144,0,240,0.5); top: 36%; left: 44%; }
        .mdot-s1::before, .mdot-s1::after { background: #9000F0; }
        .mdot-s2 { background: #9000F0; box-shadow: 0 0 8px rgba(144,0,240,0.5); top: 50%; right: 30%; }
        .mdot-s2::before, .mdot-s2::after { background: #9000F0; }
        .mdot-s3 { background: #9000F0; box-shadow: 0 0 8px rgba(144,0,240,0.5); top: 64%; left: 22%; }
        .mdot-s3::before, .mdot-s3::after { background: #9000F0; }
        .mdot-s4 { background: #9000F0; box-shadow: 0 0 8px rgba(144,0,240,0.5); top: 12%; right: 22%; }
        .mdot-s4::before, .mdot-s4::after { background: #9000F0; }
        .mdot-s5 { background: #9000F0; box-shadow: 0 0 6px rgba(144,0,240,0.4); top: 74%; left: 58%; }
        .mdot-s5::before, .mdot-s5::after { background: #9000F0; }
        .mdot-s6 { background: #9000F0; box-shadow: 0 0 6px rgba(144,0,240,0.4); top: 28%; right: 38%; }
        .mdot-s6::before, .mdot-s6::after { background: #9000F0; }

        .mdot-accent1 { width: 12px; height: 12px; background: #ec4899; box-shadow: 0 0 12px rgba(236,72,153,0.7), 0 0 24px rgba(236,72,153,0.3); top: 70%; left: 46%; }
        .mdot-accent1::before, .mdot-accent1::after { background: #ec4899; }
        .mdot-accent2 { width: 10px; height: 10px; background: #06b6d4; box-shadow: 0 0 10px rgba(6,182,212,0.7), 0 0 20px rgba(6,182,212,0.3); top: 26%; right: 10%; }
        .mdot-accent2::before, .mdot-accent2::after { background: #06b6d4; }
        .mdot-accent3 { width: 7px; height: 7px; background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.6); top: 76%; right: 20%; }
        .mdot-accent3::before, .mdot-accent3::after { background: #22c55e; }

        @keyframes citd-pulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.5); opacity: 0.08; }
        }

        /* Bottom sheet */
        .citd-bottom-sheet {
          background: rgba(18,18,32,0.97);
          border-top: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px 14px 0 0;
          padding: 6px 14px 4px;
          margin-top: auto;
          backdrop-filter: blur(12px);
        }
        .citd-sheet-handle { width: 28px; height: 3px; background: rgba(255,255,255,0.12); border-radius: 2px; margin: 0 auto 6px; }
        .citd-sheet-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .citd-sheet-count { font-size: 10px; font-weight: 600; color: #a0a0b8; }
        .citd-sheet-action { font-size: 9px; font-weight: 500; color: #9000F0; }

        /* Report card */
        .citd-report-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px;
          padding: 9px 10px;
          margin-bottom: 4px;
        }
        .citd-report-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
        .citd-report-badge { font-size: 7px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 6px; border-radius: 4px; background: rgba(144,0,240,0.2); color: #c084fc; }
        .citd-report-date { font-size: 8px; color: #555; }
        .citd-report-title { font-size: 11px; font-weight: 600; color: #fff; margin-bottom: 2px; line-height: 1.3; }
        .citd-report-desc { font-size: 8px; color: #555; line-height: 1.4; margin-bottom: 4px; }
        .citd-report-footer { display: flex; align-items: center; justify-content: space-between; }
        .citd-report-location { font-size: 8px; color: #444; display: flex; align-items: center; gap: 3px; }
        .citd-report-location svg { width: 9px; height: 9px; }
        .citd-view-report { font-size: 8px; font-weight: 600; color: #9000F0; }

        /* Bottom nav */
        .citd-bottom-nav {
          display: flex;
          justify-content: space-around;
          align-items: center;
          padding: 6px 8px 2px;
          background: rgba(18,18,32,0.97);
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        .citd-nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          font-size: 8px;
          font-weight: 500;
          color: #444;
          flex: 1;
          padding: 2px 0;
          position: relative;
        }
        .citd-nav-active { color: #9000F0; }
        .citd-nav-active::before {
          content: '';
          width: 4px; height: 4px;
          border-radius: 50%;
          background: #9000F0;
          position: absolute;
          top: -2px;
        }
        .citd-nav-item svg { width: 18px; height: 18px; }

        /* Home indicator */
        .citd-home-indicator { display: flex; justify-content: center; padding: 6px 0 4px; background: rgba(18,18,32,0.97); }
        .citd-home-bar { width: 100px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.15); }

        /* ─── V11.17.39 Phone-screen video ─── */
        .citd-screen-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
          background: #0d0d1a;
        }

        /* ─── V11.17.39 Email signup form ─── */
        .citd-signup-form {
          margin: 0 0 28px;
          max-width: 480px;
        }
        @media (max-width: 768px) {
          .citd-signup-form { margin-left: auto; margin-right: auto; }
        }
        .citd-signup-label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #c084fc;
          margin-bottom: 12px;
        }
        .citd-signup-row {
          display: grid;
          grid-template-columns: 1fr 1fr auto;
          gap: 8px;
          align-items: stretch;
        }
        @media (max-width: 640px) {
          .citd-signup-row {
            grid-template-columns: 1fr;
            gap: 8px;
          }
        }
        .citd-signup-input {
          width: 100%;
          padding: 13px 14px;
          font-size: 14px;
          font-family: inherit;
          color: #fff;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 10px;
          outline: none;
          transition: border-color 0.15s, background 0.15s;
          box-sizing: border-box;
          min-width: 0;
        }
        .citd-signup-input::placeholder { color: rgba(255,255,255,0.4); }
        .citd-signup-input:focus {
          border-color: rgba(144, 0, 240, 0.6);
          background: rgba(255,255,255,0.07);
        }
        .citd-signup-input:disabled { opacity: 0.6; cursor: not-allowed; }
        .citd-signup-button {
          padding: 13px 22px;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          color: #fff;
          background: #9000F0;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: background 0.15s, transform 0.05s;
          white-space: nowrap;
          letter-spacing: 0.01em;
        }
        .citd-signup-button:hover { background: #a020ff; }
        .citd-signup-button:active { transform: scale(0.98); }
        .citd-signup-button:disabled {
          background: rgba(144, 0, 240, 0.5);
          cursor: not-allowed;
        }
        .citd-signup-hint {
          margin-top: 10px;
          font-size: 12px;
          color: #666680;
        }
        @media (max-width: 768px) {
          .citd-signup-hint { text-align: center; }
        }
        .citd-signup-error {
          margin-top: 10px;
          padding: 10px 14px;
          font-size: 13px;
          color: #fca5a5;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 8px;
        }
        .citd-signup-success {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
          margin: 0 0 28px;
          max-width: 480px;
          background: rgba(52, 211, 153, 0.07);
          border: 1px solid rgba(52, 211, 153, 0.32);
          border-radius: 12px;
        }
        @media (max-width: 768px) {
          .citd-signup-success { margin-left: auto; margin-right: auto; }
        }
        .citd-signup-success-icon {
          flex-shrink: 0;
          width: 36px; height: 36px;
          border-radius: 50%;
          background: rgba(52, 211, 153, 0.18);
          color: #6ee7b7;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .citd-signup-success-icon svg { width: 18px; height: 18px; }
        .citd-signup-success-title {
          font-size: 15px;
          font-weight: 600;
          color: #d1fae5;
          margin-bottom: 2px;
        }
        .citd-signup-success-sub {
          font-size: 13px;
          color: #a0a0b8;
        }

        /* Secondary (smaller, dimmer) store badges below the form */
        .citd-store-buttons-secondary { opacity: 0.72; transform: scale(0.92); transform-origin: left center; margin-bottom: 24px; }
        @media (max-width: 768px) {
          .citd-store-buttons-secondary { transform-origin: center; }
        }

        /* ─── V11.17.39 Laptop section ─── */
        .citd-laptop-section {
          position: relative;
          max-width: 1100px;
          margin: 0 auto;
          padding: 20px 24px 80px;
          text-align: center;
        }
        @media (max-width: 768px) {
          .citd-laptop-section { padding: 8px 16px 64px; }
        }
        .citd-laptop-heading {
          font-family: 'Changa', sans-serif;
          font-size: clamp(24px, 4vw, 36px);
          font-weight: 700;
          line-height: 1.2;
          color: #fff;
          margin: 0 0 14px;
          max-width: 720px;
          margin-left: auto;
          margin-right: auto;
        }
        .citd-laptop-sub {
          font-size: 15px;
          line-height: 1.6;
          color: #a0a0b8;
          max-width: 520px;
          margin: 0 auto 40px;
        }
        .citd-laptop-wrap {
          position: relative;
          max-width: 840px;
          margin: 0 auto;
        }
        .citd-laptop-bezel {
          position: relative;
          border-radius: 12px 12px 4px 4px;
          background: linear-gradient(145deg, #2a2a3a 0%, #1a1a28 50%, #222233 100%);
          padding: 14px 14px 14px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.06),
            0 18px 50px rgba(0,0,0,0.55);
          aspect-ratio: 16 / 10;
        }
        @media (max-width: 640px) {
          .citd-laptop-bezel { padding: 8px 8px 8px; }
        }
        .citd-laptop-camera {
          position: absolute;
          top: 6px;
          left: 50%;
          transform: translateX(-50%);
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: rgba(255,255,255,0.12);
        }
        .citd-laptop-screen {
          width: 100%;
          height: 100%;
          border-radius: 4px;
          overflow: hidden;
          background: #0d0d1a;
          border: 1px solid rgba(0,0,0,0.5);
        }
        .citd-laptop-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
          background: #0d0d1a;
        }
        .citd-laptop-base {
          height: 14px;
          background: linear-gradient(180deg, #1a1a28 0%, #0a0a14 100%);
          border-radius: 0 0 20px 20px;
          margin: 0 -2.5%;
          box-shadow: 0 12px 24px rgba(0,0,0,0.5);
          position: relative;
        }
        .citd-laptop-notch {
          width: 80px;
          height: 6px;
          background: rgba(0,0,0,0.5);
          border-radius: 0 0 8px 8px;
          margin: -14px auto 0;
          position: relative;
          z-index: 1;
        }
      `}</style>
    </>
  )
}
