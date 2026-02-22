'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { Search, ChevronDown, ChevronRight, Check, X, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PhenomenonCategory } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'

interface SubcategoryFilterProps {
  selectedCategories: PhenomenonCategory[]
  selectedTypes: string[]
  onCategoriesChange: (categories: PhenomenonCategory[]) => void
  onTypesChange: (typeIds: string[]) => void
  compact?: boolean
}

interface Phenomenon {
  id: string
  name: string
  icon: string
  report_count: number
}

interface CategoryGroup {
  category: PhenomenonCategory
  category_label: string
  types: Phenomenon[]
}

export default function SubcategoryFilter({
  selectedCategories,
  selectedTypes,
  onCategoriesChange,
  onTypesChange,
  compact = false
}: SubcategoryFilterProps) {
  const [categoryData, setCategoryData] = useState<CategoryGroup[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<PhenomenonCategory>>(new Set())
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadCategoryData()
  }, [])

  // Auto-expand categories that have search matches
  useEffect(() => {
    if (searchQuery.trim()) {
      const categoriesWithMatches = new Set<PhenomenonCategory>()
      categoryData.forEach(group => {
        const hasMatches = group.types.some(t =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
        if (hasMatches) {
          categoriesWithMatches.add(group.category)
        }
      })
      setExpandedCategories(categoriesWithMatches)
    }
  }, [searchQuery, categoryData])

  async function loadCategoryData() {
    try {
      const { data: phenomena, error } = await supabase
        .from('phenomena')
        .select('id, name, slug, icon, category, report_count')
        .eq('status', 'active')
        .order('category')
        .order('report_count', { ascending: false })

      if (error) {
        console.error('Error loading phenomena:', error)
        setCategoryData([])
        return
      }

      if (phenomena) {
        const grouped = phenomena.reduce((acc: CategoryGroup[], phenomenon: any) => {
          const existing = acc.find(c => c.category === phenomenon.category)
          if (existing) {
            existing.types.push({
              id: phenomenon.id,
              name: phenomenon.name,
              icon: phenomenon.icon,
              report_count: phenomenon.report_count
            })
          } else {
            const config = CATEGORY_CONFIG[phenomenon.category as keyof typeof CATEGORY_CONFIG]
            acc.push({
              category: phenomenon.category,
              category_label: config?.label || phenomenon.category,
              types: [{
                id: phenomenon.id,
                name: phenomenon.name,
                icon: phenomenon.icon,
                report_count: phenomenon.report_count
              }]
            })
          }
          return acc
        }, [])
        setCategoryData(grouped)
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
      const categoryTypes = categoryData.find(c => c.category === category)?.types || []
      const typeIds = categoryTypes.map((t: Phenomenon) => t.id)
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

  function removeSelectedType(typeId: string) {
    const newSelected = new Set(selectedTypes)
    newSelected.delete(typeId)
    onTypesChange(Array.from(newSelected))
  }

  function removeSelectedCategory(category: PhenomenonCategory) {
    const newSelected = new Set(selectedCategories)
    newSelected.delete(category)
    onCategoriesChange(Array.from(newSelected))

    // Also remove all types in this category
    const categoryTypes = categoryData.find(c => c.category === category)?.types || []
    const typeIds = categoryTypes.map((t: Phenomenon) => t.id)
    onTypesChange(selectedTypes.filter(id => !typeIds.includes(id)))
  }

  function clearAll() {
    onCategoriesChange([])
    onTypesChange([])
  }

  // Filter categories based on search
  const filteredCategoryData = useMemo(() => {
    if (!searchQuery.trim()) return categoryData

    return categoryData
      .map(group => ({
        ...group,
        types: group.types.filter(t =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      }))
      .filter(group => group.types.length > 0)
  }, [categoryData, searchQuery])

  // Calculate statistics for selected items
  const selectedPhenomena = categoryData.flatMap(g => g.types).filter(t => selectedTypes.includes(t.id))
  const totalReports = selectedPhenomena.reduce((sum, p) => sum + p.report_count, 0)

  // Determine checkbox state for category
  function getCategoryCheckState(category: PhenomenonCategory): 'none' | 'partial' | 'full' {
    const categoryTypes = categoryData.find(c => c.category === category)?.types || []
    const selectedCount = categoryTypes.filter((t: Phenomenon) => selectedTypes.includes(t.id)).length

    if (selectedCount === 0) return 'none'
    if (selectedCount === categoryTypes.length) return 'full'
    return 'partial'
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
    <div className={classNames('glass-card flex flex-col', compact ? 'p-3' : 'p-4')}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <h3 className={classNames('font-medium text-white', compact ? 'text-sm' : 'text-base')}>
            Filter by Phenomenon
          </h3>
        </div>
        {hasSelections && (
          <button
            onClick={clearAll}
            className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Clear All
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="mb-4 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search phenomena..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={classNames(
              'w-full pl-9 pr-3 py-2 rounded-lg',
              'bg-white/5 border border-white/10',
              'text-white placeholder-gray-500',
              'focus:outline-none focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50',
              'transition-colors',
              compact ? 'text-sm' : 'text-sm'
            )}
          />
        </div>
      </div>

      {/* Selected Items Chips */}
      {hasSelections && (
        <div className="mb-4 pb-4 border-b border-white/10 flex-shrink-0">
          <div className="flex flex-wrap gap-2">
            {selectedCategories.map(category => {
              const config = CATEGORY_CONFIG[category]
              return (
                <div
                  key={category}
                  className={classNames(
                    'inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs',
                    'bg-white/5 border border-white/10',
                    'text-gray-300'
                  )}
                >
                  <span className="text-sm">{config.icon}</span>
                  <span>{config.label}</span>
                  <button
                    onClick={() => removeSelectedCategory(category)}
                    className="ml-1 hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
            {selectedTypes.map(typeId => {
              const phenomenon = categoryData
                .flatMap(g => g.types)
                .find(t => t.id === typeId)

              if (!phenomenon) return null

              return (
                <div
                  key={typeId}
                  className={classNames(
                    'inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs',
                    'bg-primary-500/20 border border-primary-500/30',
                    'text-primary-300'
                  )}
                >
                  <span className="text-sm">{phenomenon.icon}</span>
                  <span>{phenomenon.name}</span>
                  <button
                    onClick={() => removeSelectedType(typeId)}
                    className="ml-1 hover:text-primary-200 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Category List */}
      <div className="flex-1 overflow-y-auto max-h-[60vh] pr-2">
        {filteredCategoryData.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
            <p>No phenomena match your search</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredCategoryData.map(({ category, category_label, types }) => {
              const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
              const isExpanded = expandedCategories.has(category)
              const checkState = getCategoryCheckState(category)
              const selectedTypesInCategory = types.filter((t: Phenomenon) => selectedTypes.includes(t.id)).length

              return (
                <div key={category} className="border-b border-white/5 last:border-0">
                  {/* Category Header */}
                  <div className="flex items-center gap-2 group">
                    {/* Chevron Button */}
                    <button
                      onClick={() => toggleExpanded(category)}
                      className="p-1 hover:bg-white/5 rounded transition-colors flex-shrink-0"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-500 group-hover:text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-400" />
                      )}
                    </button>

                    {/* Category Row Button */}
                    <button
                      onClick={() => toggleCategory(category)}
                      className={classNames(
                        'flex-1 flex items-center gap-3 py-2 px-2 rounded-lg text-left transition-all border',
                        'border-transparent',
                        checkState === 'full'
                          ? `${config.bgColor} ${config.color} border-white/10`
                          : 'hover:bg-white/5 text-gray-300 hover:text-white'
                      )}
                    >
                      {/* Icon and Label */}
                      <span className="text-lg flex-shrink-0">{config.icon}</span>
                      <span className={classNames('font-medium flex-1', compact ? 'text-sm' : 'text-sm')}>
                        {category_label}
                      </span>

                      {/* Count Badge */}
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {types.length}
                      </span>

                      {/* Checkbox State */}
                      <div className="w-4 h-4 rounded border-2 border-gray-400 flex items-center justify-center flex-shrink-0">
                        {checkState === 'full' && (
                          <Check className="w-3 h-3 text-white" strokeWidth={3} />
                        )}
                        {checkState === 'partial' && (
                          <div className="w-2 h-2 bg-gray-400 rounded-sm" />
                        )}
                      </div>
                    </button>
                  </div>

                  {/* Expanded Category Border and Items */}
                  {isExpanded && types.length > 0 && (
                    <div className={classNames(
                      'ml-6 mt-1 pb-2 space-y-0.5',
                      'border-l-2',
                      checkState !== 'none' ? 'border-primary-500/30' : 'border-white/5'
                    )}>
                      {types.map((type: Phenomenon) => {
                        const isSelected = selectedTypes.includes(type.id)
                        return (
                          <button
                            key={type.id}
                            onClick={() => toggleType(type.id)}
                            className={classNames(
                              'w-full flex items-center gap-2 py-2 px-3 rounded transition-all text-left text-sm',
                              'border border-transparent',
                              isSelected
                                ? 'bg-primary-500/20 border-primary-500/30 text-primary-300'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                            )}
                          >
                            <span className="text-base flex-shrink-0">{type.icon || '•'}</span>
                            <span className="flex-1 truncate">{type.name}</span>
                            <span className={classNames(
                              'text-xs flex-shrink-0',
                              isSelected ? 'text-primary-400' : 'text-gray-500'
                            )}>
                              {type.report_count}
                            </span>
                            {isSelected && (
                              <Check className="w-3 h-3 flex-shrink-0 text-primary-400" strokeWidth={2.5} />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Summary Footer */}
      {hasSelections && (
        <div className="mt-4 pt-3 border-t border-white/10 flex-shrink-0">
          <p className="text-xs text-gray-400 leading-relaxed">
            <span className="font-medium text-gray-300">
              {selectedCategories.length > 0 && `${selectedCategories.length} ${selectedCategories.length === 1 ? 'category' : 'categories'}`}
              {selectedCategories.length > 0 && selectedTypes.length > 0 && ', '}
              {selectedTypes.length > 0 && `${selectedTypes.length} ${selectedTypes.length === 1 ? 'phenomenon' : 'phenomena'}`}
              {selectedCategories.length > 0 || selectedTypes.length > 0 ? ' selected' : ''}
            </span>
            {totalReports > 0 && (
              <>
                <span className="text-gray-500"> • </span>
                <span>{totalReports.toLocaleString()} total reports</span>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
