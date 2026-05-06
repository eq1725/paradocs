/**
 * Minimal type shim for web-push so local tsc can resolve the import
 * before the package is npm-installed. Vercel will pull in the real
 * @types/web-push at build time and these stubs will be shadowed.
 */
declare module 'web-push' {
  export interface PushSubscription {
    endpoint: string
    keys: {
      p256dh: string
      auth: string
    }
  }
  export interface SendOptions {
    TTL?: number
    headers?: Record<string, string>
    contentEncoding?: string
    urgency?: 'very-low' | 'low' | 'normal' | 'high'
    topic?: string
  }
  export function setVapidDetails(
    subject: string,
    publicKey: string,
    privateKey: string
  ): void
  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer | null,
    options?: SendOptions
  ): Promise<{ statusCode: number; body: string; headers: Record<string, string> }>
  const _default: {
    setVapidDetails: typeof setVapidDetails
    sendNotification: typeof sendNotification
  }
  export default _default
}
