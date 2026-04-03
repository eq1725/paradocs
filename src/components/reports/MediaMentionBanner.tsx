/**
 * MediaMentionBanner Component
 *
 * When a report description mentions video, image, or photo but the report
 * has no media items in report_media, this banner surfaces a prominent link
 * to the source page so users can find the referenced media.
 *
 * SWC compliant: var, function(){}, string concat, no template literals in JSX.
 */

import React from 'react'
import { Camera, Video, ExternalLink, Image } from 'lucide-react'
import { classNames } from '@/lib/utils'

interface Props {
  description: string | null
  sourceUrl: string | null
  sourceLabel: string | null
  hasMediaItems: boolean
  className?: string
}

// Patterns indicating media was mentioned but ultimately failed/unusable
var MEDIA_FAILURE_PATTERNS = /\b(pitch\s*black|total\s*black|black\s*nothingness|blank\s*(footage|video|recording|screen)|unusable|corrupted|blurry|too\s*dark|couldn.?t\s*(record|capture|film|save|get)|could\s*not\s*(record|capture|film)|unable\s*to\s*(record|capture|film)|failed\s*to\s*(record|capture|film)|phone\s*(died|crashed|froze)|battery\s*died|recording\s*was\s*(?:just\s*)?(?:black|blank|nothing|empty|gone|lost|deleted)|no\s*(?:usable\s*)?(?:footage|video|photo|image|recording))\b/i

// Detect what kind of media the description references
function detectMediaMentions(description: string): { hasVideo: boolean; hasImage: boolean; hasPhoto: boolean } {
  var descLower = description.toLowerCase()

  // If the description describes media failure, don't flag it as having media
  if (MEDIA_FAILURE_PATTERNS.test(descLower)) {
    return { hasVideo: false, hasImage: false, hasPhoto: false }
  }

  return {
    hasVideo: /\b(video|footage|film|record(?:ing|ed)|capture[ds]?\s+on\s+(?:camera|video)|caught\s+on\s+(?:camera|video)|dashcam|dash\s+cam|security\s+cam|ring\s+cam|doorbell\s+cam)\b/.test(descLower),
    hasImage: /\b(image|picture|illustration|sketch|drawing|render)\b/.test(descLower),
    hasPhoto: /\b(photo|photograph|snapshot|pic\b|pics\b|camera)\b/.test(descLower)
  }
}

export default function MediaMentionBanner({
  description,
  sourceUrl,
  sourceLabel,
  hasMediaItems,
  className
}: Props) {
  // Don't show if there's no description, or if the report already has media items
  if (!description || hasMediaItems) return null

  var mentions = detectMediaMentions(description)
  if (!mentions.hasVideo && !mentions.hasImage && !mentions.hasPhoto) return null

  // Determine the primary media type mentioned
  var mediaType = mentions.hasVideo ? 'video' : (mentions.hasPhoto ? 'photo' : 'image')
  var Icon = mentions.hasVideo ? Video : (mentions.hasPhoto ? Camera : Image)

  var label = mentions.hasVideo ? 'Video referenced in this report'
    : mentions.hasPhoto ? 'Photo referenced in this report'
    : 'Image referenced in this report'

  var actionText = sourceUrl
    ? 'View on ' + (sourceLabel || 'original source')
    : 'Referenced in witness description'

  var bgColor = mentions.hasVideo
    ? 'from-red-500/10 via-red-500/5 to-transparent border-red-500/20'
    : 'from-blue-500/10 via-blue-500/5 to-transparent border-blue-500/20'

  var iconColor = mentions.hasVideo ? 'text-red-400 bg-red-500/20' : 'text-blue-400 bg-blue-500/20'
  var textColor = mentions.hasVideo ? 'text-red-300' : 'text-blue-300'

  return (
    <div className={classNames(
      'rounded-xl border bg-gradient-to-r p-4 sm:p-5',
      bgColor,
      className
    )}>
      <div className="flex items-center gap-3">
        <div className={classNames('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', iconColor)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={classNames('text-sm font-medium', textColor)}>{label}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {'The witness description mentions ' + mediaType + ' evidence'}
          </p>
        </div>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={classNames(
              'flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-colors flex-shrink-0',
              mentions.hasVideo
                ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30'
                : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30'
            )}
          >
            {actionText}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  )
}
