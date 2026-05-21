// V11.9 — PII redactor for ingested content
//
// Strips personally-identifying information from witness-submitted text
// BEFORE quality assessment, storage, and AI processing. Built in response
// to the smoke #8 "Pale Gray Crawler" leak: a Reddit body contained the
// witness's childhood address ("1721 Fern Avenue") and it surfaced
// verbatim on the live report page.
//
// Categories redacted:
//   1. US street addresses — number + 1-4 capitalized words + street suffix
//   2. Phone numbers — US formats and common international shapes
//   3. Email addresses
//   4. SSN-like sequences (xxx-xx-xxxx)
//
// What this redactor does NOT do:
//   - First / last names. Name redaction is handled separately by
//     `stripExperiencerNames` in paradocs-analysis.service.ts because it
//     needs context (the experiencer's stated name from the source
//     metadata) to disambiguate name-words from common nouns.
//   - Social media handles. Future enhancement if we observe leaks.
//
// Returns the redacted text plus a count and category list for audit
// logging. Console-logged at the call site so we can spot-check at scale.

export interface RedactionResult {
  text: string;
  redactedCount: number;
  types: string[];
}

// 1. Street addresses.
// Match shape: 1-5 digit street number + 1-4 title-case words + street suffix.
// Suffix list covers the common US forms; common abbreviations included.
//   "1721 Fern Avenue" → matches
//   "123 Main St" → matches
//   "1234 South Oak Park Boulevard" → matches (3 words allowed between number and suffix)
//   "1971" alone → no match (no suffix)
//   "I was 12 when this happened" → no match (no suffix)
// The trailing `\.?` allows abbreviations like "St." and "Ave."
const ADDRESS_RE = /\b\d{1,5}(?:[\-]\d{1,5})?\s+(?:[A-Z][a-zA-Z']+\.?\s+){1,4}(?:Avenue|Ave|Street|St|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Terrace|Ter|Trail|Tr|Highway|Hwy|Circle|Cir|Parkway|Pkwy|Square|Sq|Crescent|Cres|Alley|Aly)\b\.?/g;

// 2. Phone numbers — US-leaning formats plus +CC variants.
//   "(555) 123-4567" / "555-123-4567" / "555.123.4567" / "+1 555 123 4567"
//   "5551234567" (10 consecutive digits at word boundary)
//   "+44 20 7946 0958" (international, 10-15 digits with separators)
// Two alternatives because the parenthesized form has no leading word
// boundary — `\b` won't match between space and `(`.
const PHONE_RE = /(?:\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\b(?:\+?\d{1,3}[-.\s]?)?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b)/g;

// 3. Email addresses — standard RFC-loose form.
const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;

// 4. SSN — xxx-xx-xxxx with strict-ish dashes.
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

/**
 * Redact PII from a single string. Returns the redacted text plus
 * metadata about what was redacted. Safe to call on null/undefined.
 */
export function redactPii(text: string | null | undefined): RedactionResult {
  if (!text) return { text: text || '', redactedCount: 0, types: [] };
  let redacted = text;
  let count = 0;
  const types: string[] = [];

  const addrMatches = redacted.match(ADDRESS_RE);
  if (addrMatches && addrMatches.length > 0) {
    redacted = redacted.replace(ADDRESS_RE, '[address redacted]');
    count += addrMatches.length;
    types.push('address');
  }

  const phoneMatches = redacted.match(PHONE_RE);
  if (phoneMatches && phoneMatches.length > 0) {
    redacted = redacted.replace(PHONE_RE, '[phone redacted]');
    count += phoneMatches.length;
    types.push('phone');
  }

  const emailMatches = redacted.match(EMAIL_RE);
  if (emailMatches && emailMatches.length > 0) {
    redacted = redacted.replace(EMAIL_RE, '[email redacted]');
    count += emailMatches.length;
    types.push('email');
  }

  const ssnMatches = redacted.match(SSN_RE);
  if (ssnMatches && ssnMatches.length > 0) {
    redacted = redacted.replace(SSN_RE, '[ssn redacted]');
    count += ssnMatches.length;
    types.push('ssn');
  }

  return { text: redacted, redactedCount: count, types: types };
}

/**
 * Redact PII across all the text fields on an ingested report shape.
 * Mutates the input report in place AND returns the aggregate redaction
 * count + types for audit logging. Returns 0 / empty if nothing was
 * redacted (caller should skip the log entry in that case).
 *
 * Fields scrubbed: title, description, summary, location_name.
 * Other fields (category, source_url, etc.) are not user-submitted text
 * so they're left alone.
 */
export function redactReportPii(report: {
  title?: string | null;
  description?: string | null;
  summary?: string | null;
  location_name?: string | null;
}): { redactedCount: number; types: string[]; fields: string[] } {
  let total = 0;
  const allTypes = new Set<string>();
  const fields: string[] = [];

  const titleR = redactPii(report.title);
  if (titleR.redactedCount > 0) {
    report.title = titleR.text;
    total += titleR.redactedCount;
    titleR.types.forEach(function(t){ allTypes.add(t); });
    fields.push('title');
  }

  const descR = redactPii(report.description);
  if (descR.redactedCount > 0) {
    report.description = descR.text;
    total += descR.redactedCount;
    descR.types.forEach(function(t){ allTypes.add(t); });
    fields.push('description');
  }

  const sumR = redactPii(report.summary);
  if (sumR.redactedCount > 0) {
    report.summary = sumR.text;
    total += sumR.redactedCount;
    sumR.types.forEach(function(t){ allTypes.add(t); });
    fields.push('summary');
  }

  const locR = redactPii(report.location_name);
  if (locR.redactedCount > 0) {
    report.location_name = locR.text;
    total += locR.redactedCount;
    locR.types.forEach(function(t){ allTypes.add(t); });
    fields.push('location_name');
  }

  return { redactedCount: total, types: Array.from(allTypes), fields: fields };
}
