/**
 * Branded SVG logo fallbacks for artifact cards when no thumbnail is available.
 * Each logo is a simplified, recognizable representation of the source platform.
 */

interface LogoProps {
  className?: string
}

function RedditLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      {/* Antenna */}
      <line x1="24" y1="8" x2="30" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="31" cy="2.5" r="2" fill="currentColor" />
      {/* Head */}
      <circle cx="24" cy="22" r="14" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2" />
      {/* Ears */}
      <circle cx="11" cy="14" r="4" fill="currentColor" opacity="0.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="37" cy="14" r="4" fill="currentColor" opacity="0.25" stroke="currentColor" strokeWidth="1.5" />
      {/* Eyes */}
      <circle cx="18" cy="21" r="3" fill="currentColor" />
      <circle cx="30" cy="21" r="3" fill="currentColor" />
      {/* Eye shine */}
      <circle cx="19" cy="20" r="1" fill="white" opacity="0.6" />
      <circle cx="31" cy="20" r="1" fill="white" opacity="0.6" />
      {/* Mouth */}
      <path d="M17 28 C20 32, 28 32, 31 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function YoutubeLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      {/* Rounded rectangle background */}
      <rect x="4" y="10" width="40" height="28" rx="8" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2" />
      {/* Play triangle */}
      <path d="M20 17 L32 24 L20 31 Z" fill="currentColor" />
    </svg>
  )
}

function TwitterLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      {/* X shape */}
      <path d="M10 10 L22 24 L10 38" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M38 10 L26 24 L38 38" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="10" y1="10" x2="38" y2="38" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="38" y1="10" x2="10" y2="38" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

function TiktokLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      {/* Musical note shape */}
      <path d="M20 8 L20 32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M20 8 C20 8, 28 6, 32 3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="14" cy="34" r="7" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2" />
      {/* Offset duplicate for TikTok feel */}
      <path d="M24 10 L24 34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      <circle cx="18" cy="36" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
    </svg>
  )
}

function InstagramLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      {/* Outer rounded square */}
      <rect x="6" y="6" width="36" height="36" rx="10" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2" />
      {/* Inner lens circle */}
      <circle cx="24" cy="24" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" />
      {/* Flash dot */}
      <circle cx="35" cy="13" r="2.5" fill="currentColor" />
    </svg>
  )
}

function PodcastLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      {/* Mic body */}
      <rect x="18" y="8" width="12" height="20" rx="6" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2" />
      {/* Mic arc */}
      <path d="M12 24 C12 32, 18 38, 24 38 C30 38, 36 32, 36 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Stand */}
      <line x1="24" y1="38" x2="24" y2="44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="18" y1="44" x2="30" y2="44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function NewsLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      {/* Paper */}
      <rect x="8" y="6" width="32" height="36" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2" />
      {/* Headline */}
      <line x1="14" y1="14" x2="34" y2="14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {/* Text lines */}
      <line x1="14" y1="22" x2="34" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="14" y1="27" x2="30" y2="27" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="14" y1="32" x2="26" y2="32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

function WebsiteLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      {/* Globe */}
      <circle cx="24" cy="24" r="16" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2" />
      {/* Horizontal lines */}
      <ellipse cx="24" cy="24" rx="16" ry="6" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      {/* Vertical ellipse */}
      <ellipse cx="24" cy="24" rx="6" ry="16" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      {/* Center line */}
      <line x1="8" y1="24" x2="40" y2="24" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
    </svg>
  )
}

function ParadocsLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      {/* Eye shape - paranormal/investigation theme */}
      <path d="M4 24 C10 14, 20 8, 24 8 C28 8, 38 14, 44 24 C38 34, 28 40, 24 40 C20 40, 10 34, 4 24 Z" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2" />
      {/* Iris */}
      <circle cx="24" cy="24" r="7" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.5" />
      {/* Pupil */}
      <circle cx="24" cy="24" r="3" fill="currentColor" />
      {/* Shine */}
      <circle cx="26" cy="22" r="1.5" fill="white" opacity="0.5" />
    </svg>
  )
}

function DefaultLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      {/* Chain link */}
      <path d="M20 18 C20 14, 24 10, 28 10 L32 10 C36 10, 40 14, 40 18 C40 22, 36 26, 32 26 L30 26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M28 30 C28 34, 24 38, 20 38 L16 38 C12 38, 8 34, 8 30 C8 26, 12 22, 16 22 L18 22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  )
}

const SOURCE_LOGO_MAP: Record<string, React.ComponentType<LogoProps>> = {
  reddit: RedditLogo,
  youtube: YoutubeLogo,
  twitter: TwitterLogo,
  tiktok: TiktokLogo,
  instagram: InstagramLogo,
  podcast: PodcastLogo,
  news: NewsLogo,
  website: WebsiteLogo,
  paradocs_report: ParadocsLogo,
  other: DefaultLogo,
}

export function SourceLogo({ sourceType, className }: { sourceType: string; className?: string }) {
  var LogoComponent = SOURCE_LOGO_MAP[sourceType] || DefaultLogo
  return <LogoComponent className={className || 'w-12 h-12'} />
}

export default SourceLogo
