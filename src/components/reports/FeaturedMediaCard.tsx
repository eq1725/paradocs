// FeaturedMediaCard — Prominent card below report header
// Shows "Watch Video", "Listen to Audio", "View Original Image" links
// for media attached to the report. Embedded media (YouTube iframes) are
// rendered inline; external links open in a new tab.

import React from 'react'

interface MediaItem {
  id: string
  url: string
  media_type: 'image' | 'video' | 'audio' | 'document'
  caption?: string | null
  is_primary?: boolean
}

interface FeaturedMediaCardProps {
  media: MediaItem[]
}

// Icons as inline SVGs to avoid adding lucide imports (SWC-compliant)
function VideoIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
  )
}

function AudioIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"></path>
      <circle cx="6" cy="18" r="3"></circle>
      <circle cx="18" cy="16" r="3"></circle>
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <circle cx="8.5" cy="8.5" r="1.5"></circle>
      <polyline points="21 15 16 10 5 21"></polyline>
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
      <polyline points="15 3 21 3 21 9"></polyline>
      <line x1="10" y1="14" x2="21" y2="3"></line>
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
    </svg>
  )
}

/**
 * Get a YouTube embed URL from a regular YouTube URL
 */
function getYouTubeEmbedUrl(url: string): string | null {
  try {
    var u = new URL(url)
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return 'https://www.youtube.com/embed/' + u.searchParams.get('v')
    }
    if (u.hostname === 'youtu.be') {
      return 'https://www.youtube.com/embed' + u.pathname
    }
    return null
  } catch {
    return null
  }
}

/**
 * Get the source name from a URL
 */
function getSourceName(url: string): string {
  try {
    var host = new URL(url).hostname.replace('www.', '')
    if (host.includes('youtube.com') || host === 'youtu.be') return 'YouTube'
    if (host.includes('archive.org')) return 'Internet Archive'
    if (host.includes('reddit.com')) return 'Reddit'
    if (host.includes('wikimedia.org')) return 'Wikimedia'
    if (host.includes('nuforc.org')) return 'NUFORC'
    if (host.includes('bfro.net')) return 'BFRO'
    return host.split('.')[0].charAt(0).toUpperCase() + host.split('.')[0].slice(1)
  } catch {
    return 'Source'
  }
}

/**
 * Check if a URL is an embeddable video
 */
function isEmbeddableVideo(url: string): boolean {
  return getYouTubeEmbedUrl(url) !== null
}

/**
 * Determine button style based on media type
 */
function getMediaStyle(type: string): { bg: string; border: string; text: string; hover: string } {
  switch (type) {
    case 'video':
      return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', hover: 'hover:bg-red-500/20' }
    case 'audio':
      return { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', hover: 'hover:bg-purple-500/20' }
    case 'document':
      return { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', hover: 'hover:bg-blue-500/20' }
    default: // image
      return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', hover: 'hover:bg-emerald-500/20' }
  }
}

export default function FeaturedMediaCard({ media }: FeaturedMediaCardProps) {
  if (!media || media.length === 0) return null

  // Filter to non-image media that should be featured (video, audio, documents)
  // Also include external images that aren't stored locally (i.e., link to original source)
  var featuredItems: MediaItem[] = []
  var embeddableVideos: MediaItem[] = []

  for (var i = 0; i < media.length; i++) {
    var item = media[i]
    if (item.media_type === 'video') {
      if (isEmbeddableVideo(item.url)) {
        embeddableVideos.push(item)
      } else {
        featuredItems.push(item)
      }
    } else if (item.media_type === 'audio' || item.media_type === 'document') {
      featuredItems.push(item)
    }
    // Images are handled by MediaGallery — don't duplicate here
    // UNLESS it's an external source image that should be linked prominently
    // (we'll skip images to avoid redundancy with the hero gallery)
  }

  // Nothing to feature
  if (featuredItems.length === 0 && embeddableVideos.length === 0) return null

  return (
    <div className="mb-6">
      {/* Embeddable videos — render inline with iframe */}
      {embeddableVideos.map(function(video) {
        var embedUrl = getYouTubeEmbedUrl(video.url)
        if (!embedUrl) return null
        return (
          <div key={video.id} className="mb-4">
            <div className="rounded-xl overflow-hidden border border-white/10 bg-black/30">
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  src={embedUrl}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={video.caption || 'Video'}
                />
              </div>
              {video.caption && (
                <div className="px-4 py-2 text-xs text-gray-400 border-t border-white/5">
                  {video.caption}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Non-embeddable media — prominent link buttons */}
      {featuredItems.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {featuredItems.map(function(item) {
            var style = getMediaStyle(item.media_type)
            var sourceName = getSourceName(item.url)
            var label = ''
            var IconComponent = DocumentIcon

            if (item.media_type === 'video') {
              label = 'Watch Video'
              IconComponent = VideoIcon
            } else if (item.media_type === 'audio') {
              label = 'Listen to Audio'
              IconComponent = AudioIcon
            } else if (item.media_type === 'document') {
              label = 'View Document'
              IconComponent = DocumentIcon
            }

            return (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={'flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ' + style.bg + ' ' + style.border + ' ' + style.hover}
              >
                <span className={style.text}>
                  <IconComponent />
                </span>
                <span className="flex flex-col">
                  <span className={'text-sm font-medium ' + style.text}>{label}</span>
                  <span className="text-xs text-gray-500">
                    {item.caption ? item.caption.substring(0, 60) : 'on ' + sourceName}
                    {item.caption && item.caption.length > 60 ? '...' : ''}
                  </span>
                </span>
                <span className="ml-auto text-gray-600">
                  <ExternalLinkIcon />
                </span>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
