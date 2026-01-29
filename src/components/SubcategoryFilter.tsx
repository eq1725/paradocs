'use client'

import React, { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PhenomenonCategory, PhenomenonType, CategoryWithTypes } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'

interface SubcategoryFilterProps {
  selectedCategories: PhenomenonCategory[]
  selectedTypes: string[] // phenomenon_type IDs
  onCategoriesChange: (categories: PhenomenonCategory[]) => void
  onTypesChange: (typeIds: string[]) => void
  compact?: boolean
}

export default function SubcategoryFilter({
  selectedCategories,
  selectedTypes,
  onCategoriesChange,
  onTypesChange,
  compact = false
}: SubcategoryFilterProps) {
  const [categoryData, setCategoryData] = useState<CategoryWithTypes[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<PhenomenonCategory>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCategoryData()
  }, [])

  async function loadCategoryData() {
    try {
      // Get phenomenon types grouped by category
      const { data, error } = await supabase
        .rpc('get_phenomenon_types_by_category')

      if (error) {
        console.error('Error loading category data:', error)
        // Fallback: load types directly
        const { data: types } = await supabase
          .from('phenomenon_types')
          .select('*')
          .order('category')
          .order('name')

        if (types) {
          // Group manually
          const grouped = types.reduce((acc, type) => {
            const existing = acc.find(c => c.category === type.category)
            if (existing) {
              existing.types.push(type)
            } else {
              const config = CATEGORY_CONFIG[type.category as keyof typeof CATEGORY_CONFIG]
              acc.push({
                category: type.category,
                category_label: config?.label || type.category,
                types: [type]
              })
            }
            return acc
          }, [] as CategoryWithTypes[])
          setCategoryData(grouped)
        }
      } else {
        setCategoryData(data || [])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  function toggleCategory(category: PhenomenonCategory) {
    const newSelected = new Set(selectedCategories)
    if (newSelected.has(category)) {
      newSelected.delete(category)
      // Also remove any selected types from this category
      const categoryTypes = categoryData.find(c => c.category === category)?.types || []
      const typeIds = categoryTypes.map(t => t.id)
      onTypesChange(selectedTypes.filter(id => !typeIds.includes(id)))
    } else {
      newSelected.add(category)
    }
    onCategoriesChange(Array.from(newSelected))
  }

  function toggleType(typeId: string) {
    const newSelected = new Set(selectedTypes)
    if (newSelected.has(typeId)) {
      newSelected.delete(typeId)
    } else {
      newSelected.add(typeId)
    }
    onTypesChange(Array.from(newSelected))
  }

  function toggleExpanded(category: PhenomenonCategory) {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  function clearAll() {
    onCategoriesChange([])
    onTypesChange([])
  }

  const hasSelections = selectedCategories.length > 0 || selectedTypes.length > 0

  if (loading) {
    return (
      <div className="glass-card p-4">
        <div className="animate-pulse space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-white/5 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={classNames(
      'glass-card',
      compact ? 'p-3' : 'p-4'
    )}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={classNames(
          'font-medium text-white',
          compact ? 'text-sm' : 'text-base'
        )}>
          Filter by Phenomenon
        </h3>
        {hasSelections && (
          <button
            onClick={clearAll}
            className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {categoryData.map(({ category, category_label, types }) => {
          const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
          const isExpanded = expandedCategories.has(category)
          const isCategorySelected = selectedCategories.includes(category)
          const selectedTypesInCategory = types.filter(t => selectedTypes.includes(t.id)).length

          return (
            <div key={category} className="border-b border-white/5 last:border-0 pb-1">
              {/* Category Header */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleExpanded(category)}
                  className="p-1 hover:bg-white/5 rounded"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                <button
                  onClick={() => toggleCategory(category)}
                  className={classNames(
                    'flex-1 flex items-center gap-2 py-2 px-2 rounded-lg text-left transition-colors',
                    isCategorySelected
                      ? `${config.bgColor} ${config.color}`
                      : 'hover:bg-white/5 text-gray-300'
                  )}
                >
                  <span className="text-lg">{config.icon}</span>
                  <span className={compact ? 'text-sm' : 'text-sm font-medium'}>
                    {category_label}
                  </span>
                  {selectedTypesInCategory > 0 && !isCategorySelected && (
                    <span className="ml-auto text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded-full">
                      {selectedTypesInCategory}
                    </span>
                  )}
                  {isCategorySelected && (
                    <Check className="w-4 h-4 ml-auto" />
                  )}
                </button>
              </div>

              {/* Subcategories */}
              {isExpanded && types.length > 0 && (
                <div className="ml-7 mt-1 space-y-0.5 pb-2">
                  {types.map(type => {
                    const isSelected = selectedTypes.includes(type.id)
                    return (
                      <button
                        key={type.id}
                        onClick={() => toggleType(type.id)}
                        className={classNames(
                          'w-full flex items-center gap-2 py-1.5 px-3 rounded text-left text-sm transition-colors',
                          isSelected
                            ? 'bg-primary-500/20 text-primary-300'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        )}
                      >
                        <span className="text-base">{type.icon || '•'}</span>
                        <span className="flex-1 truncate">{type.name}</span>
                        {isSelected && <Check className="w-3 h-3 flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Selected Summary */}
      {hasSelections && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <p className="text-xs text-gray-400">
            {selectedCategories.length > 0 && (
              <span>{selectedCategories.length} categories</span>
            )}
            {selectedCategories.length > 0 && selectedTypes.length > 0 && (
              <span>, </span>
            )}
            {selectedTypes.length > 0 && (
              <span>{selectedTypes.length} specific types</span>
            )}
            <span> selected</span>
          </p>
        </div>
      )}
    </div>
  )
}
