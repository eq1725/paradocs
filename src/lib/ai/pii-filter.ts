/**
 * pii-filter — V10.4 Phase 1
 *
 * Render-time backstop for PII leakage in AI-rewritten text.
 * The PRIMARY safeguard against PII is the anonymization rule
 * in the rewrite prompts (see rewrite-pipeline.ts). This filter
 * is defense-in-depth: it runs on any AI-rewritten text JUST
 * BEFORE it leaves an API endpoint, scrubbing anything that
 * looks like contact info or precise location/time identifiers
 * that snuck through.
 *
 * What it strips:
 *   - Email addresses → '[email removed]'
 *   - Phone numbers (US-style + international) → '[phone removed]'
 *   - SSN-like patterns → '[ID removed]'
 *   - Full street addresses (number + street name) → '[address removed]'
 *
 * What it does NOT touch:
 *   - City / state / region names — those are fine to surface
 *   - Years / decades — fine
 *   - Witness counts — fine
 *
 * This is a string-in / string-out function. Apply it to every
 * AI-rewritten field before it's serialized into a response.
 */

const EMAIL_RX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g

// Phone numbers — US/CA-style (with or without country code) plus
// generic international. Conservative: looks for 10-11 digits with
// common separators, with at least one non-digit context char on
// either side to avoid matching things like dates.
const PHONE_RX = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g

// SSN pattern: XXX-XX-XXXX.
const SSN_RX = /\b\d{3}-\d{2}-\d{4}\b/g

// Street address: NUMBER WORD WORD ... where one of the words is
// a street suffix. Conservative — only matches when the suffix
// keyword is present, so "123 Main St" matches but "1947" doesn't.
const STREET_SUFFIX = '(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Ln|Lane|Dr|Drive|Ct|Court|Way|Pkwy|Parkway|Pl|Place|Hwy|Highway|Trl|Trail|Ter|Terrace)'
const STREET_ADDRESS_RX = new RegExp(`\\b\\d{1,6}\\s+(?:[A-Z][\\w'\\-]*\\.?\\s+){1,4}${STREET_SUFFIX}\\b\\.?`, 'g')

/**
 * Strip PII patterns from a single string. Returns the cleaned
 * string and a metadata object describing what (if anything)
 * was redacted. Use the metadata to emit a one-line warning
 * in server logs when PII slips through — that signals the
 * upstream prompt is regressing and needs review.
 */
export function stripPii(input: string | null | undefined): {
  clean: string
  redactions: { emails: number; phones: number; ssns: number; addresses: number }
} {
  if (!input) {
    return { clean: '', redactions: { emails: 0, phones: 0, ssns: 0, addresses: 0 } }
  }
  let s = input
  let emails = 0
  let phones = 0
  let ssns = 0
  let addresses = 0

  s = s.replace(EMAIL_RX, () => { emails++; return '[email removed]' })
  s = s.replace(SSN_RX, () => { ssns++; return '[ID removed]' })
  s = s.replace(STREET_ADDRESS_RX, () => { addresses++; return '[address removed]' })
  s = s.replace(PHONE_RX, () => { phones++; return '[phone removed]' })

  return { clean: s, redactions: { emails, phones, ssns, addresses } }
}

/**
 * Convenience wrapper for the common case: apply stripPii and
 * log a warning if anything was redacted (so we can detect
 * upstream prompt regressions in the server logs).
 */
export function stripPiiWithLogging(
  input: string | null | undefined,
  context: { field: string; reportId?: string; artifactId?: string },
): string {
  const result = stripPii(input)
  const total = result.redactions.emails + result.redactions.phones +
                result.redactions.ssns + result.redactions.addresses
  if (total > 0) {
    console.warn('[pii-filter] PII redacted at render time — prompt may need review', {
      field: context.field,
      reportId: context.reportId,
      artifactId: context.artifactId,
      redactions: result.redactions,
    })
  }
  return result.clean
}
