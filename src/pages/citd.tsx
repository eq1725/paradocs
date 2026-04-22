import React from 'react'
import Head from 'next/head'

/**
 * /citd — "Contact in the Desert" event landing page.
 *
 * Polished standalone design with phone mockup, app store buttons,
 * and glowing map dots. Self-contained styles via <style jsx>.
 *
 * Phase 2 (app launch): Auto-detect iOS / Android and redirect
 *   to the appropriate app store. Fallback to this page for desktop.
 */

// ── Uncomment when apps are live ──────────────────────────────
// const APP_STORE_URL = 'https://apps.apple.com/app/paradocs/id...'
// const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=...'

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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@700&display=swap"
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

        {/* Right: Phone mockup */}
        <div className="citd-phone-wrap">
          <div className="citd-bezel">
            <div className="citd-vol-down" />
            <div className="citd-screen-wrap">
              <div className="citd-dynamic-island" />
              <div className="citd-screen">
                {/* Status bar */}
                <div className="citd-status-bar">
                  <span className="citd-status-time">9:41</span>
                  <div style={{ width: 100 }} />
                  <div className="citd-status-icons">
                    <svg viewBox="0 0 18 14" fill="#fff">
                      <rect x="0" y="10" width="3" height="4" rx="0.5" />
                      <rect x="5" y="7" width="3" height="7" rx="0.5" />
                      <rect x="10" y="3" width="3" height="11" rx="0.5" />
                      <rect x="15" y="0" width="3" height="14" rx="0.5" />
                    </svg>
                    <svg viewBox="0 0 16 12" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M1 3.5a11 11 0 0 1 14 0" />
                      <path d="M3.5 6.5a7 7 0 0 1 9 0" />
                      <path d="M6 9.3a3.5 3.5 0 0 1 4 0" />
                      <circle cx="8" cy="11.5" r="0.5" fill="#fff" stroke="none" />
                    </svg>
                    <svg viewBox="0 0 28 14" fill="none">
                      <rect x="0.5" y="0.5" width="23" height="13" rx="3" stroke="rgba(255,255,255,0.35)" />
                      <rect x="24.5" y="4" width="2.5" height="6" rx="1" fill="rgba(255,255,255,0.3)" />
                      <rect x="2" y="2" width="17" height="10" rx="1.5" fill="#34d399" />
                    </svg>
                  </div>
                </div>

                {/* App header */}
                <div className="citd-app-header">
                  <div className="citd-app-logo">
                    Paradocs<span className="citd-logo-dot">.</span>
                  </div>
                  <div className="citd-header-icons">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M5.5 21a7.5 7.5 0 0 1 13 0" />
                    </svg>
                  </div>
                </div>

                {/* Tab bar */}
                <div className="citd-tab-bar">
                  <div className="citd-tab citd-tab-active">Map</div>
                  <div className="citd-tab">Browse</div>
                  <div className="citd-tab">Search</div>
                </div>

                {/* Filter bar */}
                <div className="citd-filter-bar">
                  <span className="citd-filter-count">41 sightings</span>
                  <svg className="citd-filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 6h18M7 12h10M10 18h4" />
                  </svg>
                </div>

                {/* Map with glowing dots */}
                <div className="citd-map-area">
                  <div className="mdot mdot-cluster mdot-c1">11</div>
                  <div className="mdot mdot-cluster mdot-c2">5</div>
                  <div className="mdot mdot-cluster mdot-c3">6</div>
                  <div className="mdot mdot-cluster mdot-c4">2</div>
                  <div className="mdot mdot-cluster mdot-c5">8</div>
                  <div className="mdot mdot-sm mdot-s1" />
                  <div className="mdot mdot-sm mdot-s2" />
                  <div className="mdot mdot-sm mdot-s3" />
                  <div className="mdot mdot-sm mdot-s4" />
                  <div className="mdot mdot-sm mdot-s5" />
                  <div className="mdot mdot-sm mdot-s6" />
                  <div className="mdot mdot-accent1" />
                  <div className="mdot mdot-accent2" />
                  <div className="mdot mdot-accent3" />
                </div>

                {/* Bottom sheet */}
                <div className="citd-bottom-sheet">
                  <div className="citd-sheet-handle" />
                  <div className="citd-sheet-header">
                    <span className="citd-sheet-count">41 sightings mapped</span>
                    <span className="citd-sheet-action">View selected</span>
                  </div>
                  <div className="citd-report-card">
                    <div className="citd-report-top">
                      <span className="citd-report-badge">UFOs &amp; Aliens</span>
                      <span className="citd-report-date">2 days ago</span>
                    </div>
                    <div className="citd-report-title">Triangle craft over Stephenville, TX</div>
                    <div className="citd-report-desc">
                      Multiple witnesses report large, silent triangular object with lights at each vertex
                      hovering over...
                    </div>
                    <div className="citd-report-footer">
                      <span className="citd-report-location">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        Stephenville, TX
                      </span>
                      <span className="citd-view-report">View Full Report &rarr;</span>
                    </div>
                  </div>
                </div>

                {/* Bottom nav */}
                <div className="citd-bottom-nav">
                  <div className="citd-nav-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14 0-5.5 2.5-7 .5 2 1.5 3 3 4.5s2.5 3.5 2.5 6c0 4.14-3.36 7.5-7.5 7.5S3 16.64 3 12.5c0-1.64.42-2.97 1.07-4.07.27-.44.55-.83.83-1.18.56.84 1.53 1.4 2.1 2.75.5 1.18.5 2 .5 3 0 .81.32 1.5.5 1.5z" />
                    </svg>
                    Feed
                  </div>
                  <div className="citd-nav-item citd-nav-active">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10" />
                      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                    </svg>
                    Explore
                  </div>
                  <div className="citd-nav-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44" />
                      <path d="m13.56 11.747 4.332-.924" />
                      <path d="m16.243 5.594 2.272.749a.934.934 0 0 1 .578 1.173l-1.186 3.605a.935.935 0 0 1-1.147.581l-.783-.245" />
                      <path d="m10.065 12.493-.53 1.493a1.93 1.93 0 0 0 1.186 2.455l.013.005a1.93 1.93 0 0 0 2.455-1.186l.53-1.493" />
                      <path d="M14 22v-6" />
                      <path d="M6 22v-2.5" />
                      <path d="M10 22H2" />
                      <path d="M18 22h-4" />
                    </svg>
                    Lab
                  </div>
                  <div className="citd-nav-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="8" r="5" />
                      <path d="M20 21a8 8 0 0 0-16 0" />
                    </svg>
                    Profile
                  </div>
                </div>

                {/* Home indicator */}
                <div className="citd-home-indicator">
                  <div className="citd-home-bar" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
          font-family: 'Space Grotesk', sans-serif;
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
          font-family: 'Space Grotesk', sans-serif;
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
      `}</style>
    </>
  )
}
