'use client'

import { classNames } from '@/lib/utils'
import { X, Link2, Copy, Check, Code, Globe, ExternalLink } from 'lucide-react'
import { useState, useCallback } from 'react'

interface SharePanelProps {
  isOpen: boolean
  onClose: () => void
  shareType: 'theory' | 'case_file' | 'profile'
  title: string
  shareUrl: string
  embedId?: string
}

export function SharePanel({
  isOpen,
  onClose,
  shareType,
  title,
  shareUrl,
  embedId,
}: SharePanelProps) {
  var [copiedLink, setCopiedLink] = useState(false)
  var [copiedEmbed, setCopiedEmbed] = useState(false)

  var handleCopyLink = useCallback(function() {
    navigator.clipboard.writeText(shareUrl).then(function() {
      setCopiedLink(true)
      setTimeout(function() { setCopiedLink(false) }, 2000)
    })
  }, [shareUrl])

  var embedCode = embedId
    ? '<iframe src="' + shareUrl + '/embed" width="100%" height="400" frameborder="0" style="border:1px solid #1f2937;border-radius:12px;background:#030712;" allowtransparency="true"></iframe>'
    : ''

  var handleCopyEmbed = useCallback(function() {
    if (!embedCode) return
    navigator.clipboard.writeText(embedCode).then(function() {
      setCopiedEmbed(true)
      setTimeout(function() { setCopiedEmbed(false) }, 2000)
    })
  }, [embedCode])

  var typeLabel = shareType === 'theory' ? 'Theory' : shareType === 'case_file' ? 'Case File' : 'Profile'

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Globe className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">
              {"Share " + typeLabel}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* What's being shared */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 rounded-lg">
            <Link2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-200 truncate">{title}</span>
          </div>

          {/* Copy Link */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Share Link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className={classNames(
                  'flex-1 px-3 py-2 rounded-lg text-sm text-gray-300',
                  'bg-gray-800 border border-gray-700',
                  'outline-none cursor-text select-all'
                )}
                onClick={function(e) { (e.target as HTMLInputElement).select() }}
              />
              <button
                onClick={handleCopyLink}
                className={classNames(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
                  copiedLink
                    ? 'bg-green-600/20 text-green-400'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500'
                )}
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedLink ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Embed Code */}
          {embedCode && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Embed Code
              </label>
              <div className="relative">
                <pre className={classNames(
                  'px-3 py-2.5 rounded-lg text-xs text-gray-400 font-mono',
                  'bg-gray-800 border border-gray-700',
                  'overflow-x-auto whitespace-pre-wrap break-all'
                )}>
                  {embedCode}
                </pre>
                <button
                  onClick={handleCopyEmbed}
                  className={classNames(
                    'absolute top-2 right-2 p-1.5 rounded text-xs transition-all flex items-center gap-1',
                    copiedEmbed
                      ? 'bg-green-600/20 text-green-400'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  )}
                >
                  {copiedEmbed ? <Check className="w-3 h-3" /> : <Code className="w-3 h-3" />}
                  {copiedEmbed ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                Paste this into any website or blog to embed this {typeLabel.toLowerCase()}.
              </p>
            </div>
          )}

          {/* Open in new tab */}
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={classNames(
              'flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg',
              'text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors'
            )}
          >
            <ExternalLink className="w-4 h-4" />
            Open in New Tab
          </a>
        </div>
      </div>
    </div>
  )
}

export default SharePanel
