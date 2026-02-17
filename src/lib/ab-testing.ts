// A/B Testing Utility
// Cookie-based variant assignment with Supabase event tracking

var AB_COOKIE_PREFIX = 'ab_';
var SESSION_COOKIE = 'ab_session_id';

function generateSessionId() {
  return 'ab_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export function getSessionId() {
  if (typeof window === 'undefined') return '';
  var existing = getCookie(SESSION_COOKIE);
  if (existing) return existing;
  var sessionId = generateSessionId();
  setCookie(SESSION_COOKIE, sessionId, 365);
  return sessionId;
}

export function getVariant(testName, variants) {
  if (typeof window === 'undefined') return variants[0];
  var cookieName = AB_COOKIE_PREFIX + testName;
  var existing = getCookie(cookieName);
  if (existing && variants.includes(existing)) return existing;
  var variant = variants[Math.floor(Math.random() * variants.length)];
  setCookie(cookieName, variant, 365);
  return variant;
}

export async function trackEvent(testName, variant, eventType, metadata) {
  try {
    var sessionId = getSessionId();
    var pagePath = typeof window !== 'undefined' ? window.location.pathname : '';
    await fetch('/api/ab/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        test_name: testName,
        variant: variant,
        event_type: eventType,
        session_id: sessionId,
        page_path: pagePath,
        metadata: metadata || {},
      }),
    });
  } catch (err) {
    console.warn('A/B tracking failed:', err);
  }
}

export function useABTest(testName, variants) {
  var variant = getVariant(testName, variants);
  if (typeof window !== 'undefined') {
    var viewKey = 'ab_viewed_' + testName;
    if (!sessionStorage.getItem(viewKey)) {
      sessionStorage.setItem(viewKey, '1');
      trackEvent(testName, variant, 'view');
    }
  }
  return {
    variant: variant,
    trackClick: function(label) { trackEvent(testName, variant, 'click', label ? { label: label } : undefined); },
    trackConversion: function(label) { trackEvent(testName, variant, 'conversion', label ? { label: label } : undefined); },
  };
}

function setCookie(name, value, days) {
  var expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax';
}

function getCookie(name) {
  var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}
