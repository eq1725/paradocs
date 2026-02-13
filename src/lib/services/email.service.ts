/**
 * Email Service
 *
 * Handles sending transactional emails via Resend.
 * Used for weekly digests, notifications, and other automated emails.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
let ResendClass: any = null
try {
  ResendClass = require('resend').Resend
} catch {
  // Resend not installed — will throw at runtime if used
}

// Initialize Resend client (lazy - only when needed)
let resendClient: any = null

const getResend = (): any => {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is required')
    }
    if (!ResendClass) {
      throw new Error('Resend package is not installed. Run: npm install resend')
    }
    resendClient = new ResendClass(apiKey)
  }
  return resendClient
}

// Default sender
const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || 'ParaDocs <digest@discoverparadocs.com>'

export interface EmailOptions {
  to: string
  subject: string
  html: string
  from?: string
  replyTo?: string
  tags?: { name: string; value: string }[]
}

export interface EmailResult {
  success: boolean
  id?: string
  error?: string
}

/**
 * Send a single email
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  try {
    const resend = getResend()
    const { data, error } = await resend.emails.send({
      from: options.from || DEFAULT_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
      tags: options.tags,
    })

    if (error) {
      console.error('[Email Service] Send error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: data?.id }
  } catch (err) {
    console.error('[Email Service] Exception:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

/**
 * Send batch emails (up to 100 at a time via Resend)
 */
export async function sendBatchEmails(
  emails: EmailOptions[]
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = { sent: 0, failed: 0, errors: [] as string[] }

  // Process in chunks of 10 to avoid rate limits
  const chunkSize = 10
  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize)
    const promises = chunk.map(email => sendEmail(email))
    const chunkResults = await Promise.all(promises)

    for (const result of chunkResults) {
      if (result.success) {
        results.sent++
      } else {
        results.failed++
        if (result.error) results.errors.push(result.error)
      }
    }

    // Small delay between chunks to respect rate limits
    if (i + chunkSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  return results
}
