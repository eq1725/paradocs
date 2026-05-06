/**
 * Push notification subscription helpers — client-side.
 *
 * V9.4 — wraps the browser Web Push API:
 *   1. Request permission
 *   2. Register / wake service worker
 *   3. Subscribe with VAPID public key
 *   4. POST subscription to /api/push/subscribe
 *
 * Browser support:
 *   - iOS Safari 16.4+ (PWA standalone only — no in-browser push)
 *   - Android Chrome (in-browser + PWA)
 *   - Desktop Chrome / Firefox / Edge / Opera
 *
 * Usage from a UI component:
 *   var result = await requestPushSubscription()
 *   if (result.subscribed) showSuccessToast()
 *   else if (result.denied) showInstructionsToReEnable()
 *
 * SWC compliant: var, function expressions, string concat.
 */

var ANON_CLIENT_ID_KEY = 'paradocs_anon_client_id'

function getOrCreateAnonClientId(): string {
  if (typeof window === 'undefined') return ''
  try {
    var existing = localStorage.getItem(ANON_CLIENT_ID_KEY)
    if (existing) return existing
    var fresh = 'anon_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now()
    localStorage.setItem(ANON_CLIENT_ID_KEY, fresh)
    return fresh
  } catch (e) {
    return 'anon_fallback_' + Date.now()
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  var padding = '='.repeat((4 - base64.length % 4) % 4)
  var base64Padded = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  var raw = atob(base64Padded)
  var arr = new Uint8Array(raw.length)
  for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export interface PushSubscribeResult {
  subscribed: boolean
  denied?: boolean
  unsupported?: boolean
  error?: string
}

/**
 * Returns whether the current browser supports the Web Push API.
 * Worth calling before showing the opt-in CTA so we don't promise
 * something we can't deliver.
 */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

/**
 * Returns the current Notification.permission state ('granted',
 * 'denied', 'default'). 'default' = not yet asked.
 */
export function getPushPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined') return 'unsupported'
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

/**
 * Full opt-in flow. Requests permission, registers the service
 * worker, subscribes with VAPID, posts to /api/push/subscribe.
 *
 * Pass the VAPID public key (NEXT_PUBLIC_VAPID_PUBLIC_KEY env). The
 * subscription is auto-tied to the signed-in user via the
 * /api/push/subscribe endpoint's session cookie. For anonymous
 * users, anon_client_id (localStorage UUID) is used.
 */
export async function requestPushSubscription(opts?: {
  topics?: string[]
}): Promise<PushSubscribeResult> {
  if (!isPushSupported()) {
    return { subscribed: false, unsupported: true }
  }

  var vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    return { subscribed: false, error: 'VAPID public key not configured' }
  }

  // Permission
  var permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { subscribed: false, denied: permission === 'denied' }
  }

  // Service worker
  var registration: ServiceWorkerRegistration
  try {
    registration = await navigator.serviceWorker.ready
  } catch (err) {
    // SW not registered yet — register it
    try {
      registration = await navigator.serviceWorker.register('/sw.js')
    } catch (regErr: any) {
      return { subscribed: false, error: 'Service worker registration failed: ' + regErr.message }
    }
  }

  // Subscribe
  var subscription: PushSubscription
  try {
    var existing = await registration.pushManager.getSubscription()
    if (existing) {
      subscription = existing
    } else {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })
    }
  } catch (err: any) {
    return { subscribed: false, error: 'Subscribe failed: ' + err.message }
  }

  // POST to server
  try {
    var subJson = subscription.toJSON()
    var response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        subscription: subJson,
        anon_client_id: getOrCreateAnonClientId(),
        topics: opts?.topics || ['daily_lead'],
      }),
    })
    if (!response.ok) {
      return { subscribed: false, error: 'Server returned ' + response.status }
    }
  } catch (err: any) {
    return { subscribed: false, error: 'Network error: ' + err.message }
  }

  return { subscribed: true }
}

/**
 * Tear down the local subscription. Useful for an "unsubscribe"
 * button in settings. Does NOT remove the row from the server —
 * the server will mark it inactive on the next failed delivery
 * (410 Gone). For an explicit server-side unsubscribe, call
 * /api/push/unsubscribe (future endpoint).
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    var registration = await navigator.serviceWorker.ready
    var subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await subscription.unsubscribe()
    }
    return true
  } catch (e) {
    return false
  }
}
