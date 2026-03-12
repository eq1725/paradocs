'use client'

import type { CaseFile } from '@/lib/database.types'
import { classNames } from '@/lib/utils'
import { X, Folder, Plus, Circle } from 'lucide-react'
import { useState, useCallback } from 'react'

interface CaseFileWithCount extends CaseFile {
  artifact_count: number
}

interface CaseFilePickerProps {
  isOpen: boolean
  onClose: () => void
  caseFiles: CaseFileWithCount[]
  onSelect: (caseFileId: string) => void
  onCreateNew: () => void
  title?: string
}

export function CaseFilePicker({
  isOpen,
  onClose,
  caseFiles,
  onSelect,
  onCreateNew,
  title,
}: CaseFilePickerProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <Folder className="w-4 h-4 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">
              {title || 'Move to Case File'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Case File List */}
        <div className="max-h-64 overflow-y-auto py-2">
          {caseFiles.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-gray-500 mb-3">No case files yet</p>
            </div>
          ) : (
            <div className="space-y-0.5 px-2">
              {caseFiles.map(function(cf) {
                return (
                  <button
                    key={cf.id}
                    onClick={function() { onSelect(cf.id); onClose() }}
                    className={classNames(
                      'w-full text-left px-3 py-2.5 rounded-lg transition-colors',
                      'flex items-center gap-3',
                      'hover:bg-gray-800 group'
                    )}
                  >
                    <Circle
                      className="w-2.5 h-2.5 flex-shrink-0"
                      fill={cf.cover_color || '#4B5563'}
                      color={cf.cover_color || '#4B5563'}
                    />
                    <span className="text-sm text-gray-200 group-hover:text-white truncate flex-1">
                      {cf.title}
                    </span>
                    <span className="text-xs text-gray-600 flex-shrink-0">
                      {cf.artifact_count + ' artifact' + (cf.artifact_count !== 1 ? 's' : '')}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Create New */}
        <div className="px-3 py-3 border-t border-gray-800">
          <button
            onClick={function() { onCreateNew(); onClose() }}
            className={classNames(
              'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg',
              'text-sm text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors'
            )}
          >
            <Plus className="w-4 h-4" />
            Create New Case File
          </button>
        </div>
      </div>
    </div>
  )
}

export default CaseFilePicker
