import { formatDistanceToNow, format, parseISO } from 'date-fns'

/**
 * API base URL — empty string for web (relative paths), or the full
 * origin when running inside Capacitor (native app shell).
 * Set NEXT_PUBLIC_API_BASE in .env for Capacitor builds.
 */
export function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE || ''
}

export function formatRelativeDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return formatDistanceToNow(d, { addSuffix: true })
}

export function formatDate(date: string | Date, formatStr: string = 'MMM d, yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, formatStr)
}

/**
 * V11.12 — Precision-aware event date formatter.
 *
 * Ingested reports store event_date as a YYYY-MM-DD ISO string padded
 * with placeholders for unknown components: year-only precision stores
 * "1945-01-01", month-only stores "2016-04-01". The default formatDate
 * blindly prints "Jan 1, 1945" / "Apr 1, 2016" — misleading because
 * the day (and possibly month) are placeholders, not source data.
 *
 * This helper respects event_date_precision and prints only the
 * components we actually know:
 *   - exact:     "Jan 15, 2024"  (full source-stated date)
 *   - month:     "April 2016"    (source stated month + year)
 *   - year:      "1945"          (source stated year only)
 *   - decade:    "1940s"         (rough decade only)
 *   - estimated: "around 2010"   (best-guess from prose)
 *   - unknown:   ""              (no usable signal)
 *
 * Callers should prefer this over formatDate() whenever they have
 * access to event_date_precision (which every ingested report does).
 */
export function formatEventDate(
  date: string | Date | null | undefined,
  precision: 'exact' | 'month' | 'year' | 'decade' | 'estimated' | 'unknown' | null | undefined,
): string {
  if (!date) return ''
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!d || isNaN(d.getTime())) return ''
  const p = precision || 'exact'
  switch (p) {
    case 'exact':
      return format(d, 'MMM d, yyyy')
    case 'month':
      return format(d, 'MMMM yyyy')
    case 'year':
      return format(d, 'yyyy')
    case 'decade': {
      const decade = Math.floor(d.getFullYear() / 10) * 10
      return decade + 's'
    }
    case 'estimated':
      return 'around ' + format(d, 'yyyy')
    case 'unknown':
    default:
      return ''
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 100)
}

export function generateSlug(title: string): string {
  const base = slugify(title)
  const suffix = Math.random().toString(36).substring(2, 8)
  return `${base}-${suffix}`
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.substring(0, length).trim() + '...'
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || `${singular}s`)
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

export function classNames(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .substring(0, 2)
}

export function getCoordinatesFromString(coordString: string): { lat: number; lng: number } | null {
  const match = coordString.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/)
  if (match) {
    return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) }
  }
  return null
}

export function isValidUrl(string: string): boolean {
  try {
    new URL(string)
    return true
  } catch {
    return false
  }
}

export function estimateReadingTime(text: string): number {
  if (!text) return 1
  return Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length / 200))
}
