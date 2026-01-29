'use client'

import React, { useState } from 'react'
import { X, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX, Maximize2 } from 'lucide-react'
import { classNames } from '@/lib/utils'

interface MediaItem {
  id: string
  url: string
  media_type: 'image' | 'video' | 'audio'
  caption?: string | null
  is_primary?: boolean
}

interface MediaGalleryProps {
  media: MediaItem[]
  className?: string
}

export default function MediaGallery({ media, className }: MediaGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)

  if (!media || media.length === 0) return null

  const selectedMedia = selectedIndex !== null ? media[selectedIndex] : null

  const openLightbox = (index: number) => {
    setSelectedIndex(index)
    setIsPlaying(false)
  }

  const closeLightbox = () => {
    setSelectedIndex(null)
    setIsPlaying(false)
  }

  const goToPrevious = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1)
      setIsPlaying(false)
    }
  }

  const goToNext = () => {
    if (selectedIndex !== null && selectedIndex < media.length - 1) {
      setSelectedIndex(selectedIndex + 1)
      setIsPlaying(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') closeLightbox()
    if (e.key === 'ArrowLeft') goToPrevious()
    if (e.key === 'ArrowRight') goToNext()
  }

  // Sort to put primary image first
  const sortedMedia = [...media].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1
    if (!a.is_primary && b.is_primary) return 1
    return 0
  })

  return (
    <>
      {/* Thumbnail grid */}
      <div className={classNames('grid gap-2', className)}>
        {sortedMedia.length === 1 ? (
          // Single image - larger display
          <div
            className="relative aspect-video rounded-lg overflow-hidden cursor-pointer group"
            onClick={() => openLightbox(0)}
          >
            {sortedMedia[0].media_type === 'image' ? (
              <img
                src={sortedMedia[0].url}
                alt={sortedMedia[0].caption || 'Evidence'}
                className="w-full h-full object-cover"
              />
            ) : sortedMedia[0].media_type === 'video' ? (
              <div className="relative w-full h-full bg-black">
                <video
                  src={sortedMedia[0].url}
                  className="w-full h-full object-contain"
                  poster=""
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <Play className="w-8 h-8 text-white ml-1" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-purple-900/50 to-blue-900/50 flex items-center justify-center">
                <Volume2 className="w-12 h-12 text-white/50" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ) : sortedMedia.length === 2 ? (
          // Two images - side by side
          <div className="grid grid-cols-2 gap-2">
            {sortedMedia.map((item, index) => (
              <div
                key={item.id}
                className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
                onClick={() => openLightbox(index)}
              >
                {item.media_type === 'image' ? (
                  <img
                    src={item.url}
                    alt={item.caption || `Evidence ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-purple-900/50 to-blue-900/50 flex items-center justify-center">
                    {item.media_type === 'video' ? (
                      <Play className="w-8 h-8 text-white/50" />
                    ) : (
                      <Volume2 className="w-8 h-8 text-white/50" />
                    )}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              </div>
            ))}
          </div>
        ) : (
          // Multiple images - grid with "+X more"
          <div className="grid grid-cols-3 gap-2">
            {sortedMedia.slice(0, 3).map((item, index) => (
              <div
                key={item.id}
                className={classNames(
                  'relative rounded-lg overflow-hidden cursor-pointer group',
                  index === 0 ? 'col-span-2 row-span-2 aspect-square' : 'aspect-square'
                )}
                onClick={() => openLightbox(index)}
              >
                {item.media_type === 'image' ? (
                  <img
                    src={item.url}
                    alt={item.caption || `Evidence ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-purple-900/50 to-blue-900/50 flex items-center justify-center">
                    {item.media_type === 'video' ? (
                      <Play className="w-8 h-8 text-white/50" />
                    ) : (
                      <Volume2 className="w-8 h-8 text-white/50" />
                    )}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />

                {/* Show "+X more" overlay on last visible item */}
                {index === 2 && sortedMedia.length > 3 && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="text-white text-lg font-semibold">
                      +{sortedMedia.length - 3} more
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selectedMedia && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={closeLightbox}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          {/* Close button */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors z-10"
          >
            <X className="w-8 h-8" />
          </button>

          {/* Navigation arrows */}
          {selectedIndex !== null && selectedIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); goToPrevious() }}
              className="absolute left-4 p-2 text-white/70 hover:text-white transition-colors z-10"
            >
              <ChevronLeft className="w-10 h-10" />
            </button>
          )}
          {selectedIndex !== null && selectedIndex < media.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goToNext() }}
              className="absolute right-4 p-2 text-white/70 hover:text-white transition-colors z-10"
            >
              <ChevronRight className="w-10 h-10" />
            </button>
          )}

          {/* Media content */}
          <div
            className="max-w-5xl max-h-[90vh] w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedMedia.media_type === 'image' ? (
              <img
                src={selectedMedia.url}
                alt={selectedMedia.caption || 'Evidence'}
                className="max-w-full max-h-[85vh] mx-auto object-contain"
              />
            ) : selectedMedia.media_type === 'video' ? (
              <div className="relative">
                <video
                  src={selectedMedia.url}
                  className="max-w-full max-h-[85vh] mx-auto"
                  controls
                  autoPlay={isPlaying}
                  muted={isMuted}
                />
              </div>
            ) : (
              <div className="bg-white/5 rounded-lg p-8 max-w-md mx-auto">
                <audio
                  src={selectedMedia.url}
                  className="w-full"
                  controls
                />
              </div>
            )}

            {/* Caption */}
            {selectedMedia.caption && (
              <p className="text-center text-white/80 mt-4 text-sm">
                {selectedMedia.caption}
              </p>
            )}

            {/* Counter */}
            <p className="text-center text-white/50 mt-2 text-xs">
              {selectedIndex !== null ? selectedIndex + 1 : 0} / {media.length}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
