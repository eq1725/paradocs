'use client'

import React, { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Settings2,
  Calendar,
  Database,
  AlertTriangle,
  Info,
  ExternalLink
} from 'lucide-react'
import { classNames } from '@/lib/utils'
import type { MethodologyData } from '@/lib/services/pattern-scoring.service'

interface MethodologyPanelProps {
  methodology: MethodologyData
  className?: string
  defaultExpanded?: boolean
}

export default function MethodologyPanel({
  methodology,
  className = '',
  defaultExpanded = false
}: MethodologyPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  return (
    <div className={classNames('glass-card overflow-hidden', className)}>
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="text-left">
            <h3 className="font-medium text-white">Methodology</h3>
            <p className="text-sm text-gray-400">{methodology.algorithmName}</p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-700/50">
          {/* Algorithm Description */}
          <div className="pt-4">
            <p className="text-sm text-gray-300 leading-relaxed">
              {methodology.algorithmDescription}
            </p>
          </div>

          {/* Parameters Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Settings2 className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-400 uppercase tracking-wide">Parameters</span>
              </div>
              <div className="space-y-1">
                {Object.entries(methodology.parameters).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-gray-400">{key.replace(/_/g, ' ')}</span>
                    <span className="text-white font-mono">
                      {typeof value === 'number' ? value.toLocaleString() : value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-400 uppercase tracking-wide">Data</span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Sample Size</span>
                  <span className="text-white font-mono">{methodology.sampleSize.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Time Range</span>
                  <span className="text-white text-xs">
                    {formatDate(methodology.dataTimeRange.start)} - {formatDate(methodology.dataTimeRange.end)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Limitations */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-amber-400 uppercase tracking-wide">Limitations</span>
            </div>
            <ul className="space-y-1">
              {methodology.limitations.map((limitation, i) => (
                <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                  <span className="text-amber-400 mt-1">•</span>
                  <span>{limitation}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Last Run Info */}
          <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-700/50">
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>Analysis run: {formatDateTime(methodology.lastRunAt)}</span>
            </div>
            <a
              href="/insights/methodology"
              className="flex items-center gap-1 text-gray-400 hover:text-primary-400 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Full methodology documentation</span>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
