'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { TrendingUp, ChevronRight, Loader2, Sparkles } from 'lucide-react'
import PatternCard, { Pattern } from './PatternCard'

interface TrendingPatternsWidgetProps {
    limit?: number
    showHeader?: boolean
    variant?: 'sidebar' | 'inline'
}

export default function TrendingPatternsWidget({
    limit = 5,
    showHeader = true,
    variant = 'sidebar'
}: TrendingPatternsWidgetProps) {
    const [patterns, setPatterns] = useState<Pattern[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

  useEffect(() => {
        async function fetchTrendingPatterns() {
                try {
                          const response = await fetch(`/api/patterns/trending?limit=${limit}`)
                          if (!response.ok) throw new Error('Failed to fetch patterns')
                          const data = await response.json()
                          setPatterns(data.patterns || [])
                } catch (err) {
                          setError(err instanceof Error ? err.message : 'Failed to load patterns')
                } finally {
                          setLoading(false)
                }
        }
        fetchTrendingPatterns()
  }, [limit])

  if (loading) {
        return (
                <div className="glass-card p-4">
                  {showHeader && (
                            <div className="flex items-center gap-2 mb-4">
                                        <TrendingUp className="w-5 h-5 text-primary-400" />
                                        <h3 className="font-display font-semibold text-white">Trending Patterns</h3>h3>
                            </div>div>
                        )}
                        <div className="flex items-center justify-center py-8">
                                  <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
                        </div>div>
                </div>div>
              )
  }
  
    if (error || patterns.length === 0) {
          return (
                  <div className="glass-card p-4">
                    {showHeader && (
                              <div className="flex items-center gap-2 mb-4">
                                          <TrendingUp className="w-5 h-5 text-primary-400" />
                                          <h3 className="font-display font-semibold text-white">Trending Patterns</h3>h3>
                              </div>div>
                          )}
                          <div className="text-center py-6">
                                    <Sparkles className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                                    <p className="text-gray-500 text-sm">
                                      {error || 'No patterns detected yet. Check back soon!'}
                                    </p>p>
                          </div>div>
                  </div>div>
                )
    }
  
    if (variant === 'inline') {
          return (
                  <div>
                    {showHeader && (
                              <div className="flex items-center justify-between mb-4">
                                          <div className="flex items-center gap-2">
                                                        <TrendingUp className="w-5 h-5 text-primary-400" />
                                                        <h3 className="font-display font-semibold text-white">Emerging Patterns</h3>h3>
                                          </div>div>
                                          <Link href="/insights" className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1">
                                                        View All <ChevronRight className="w-4 h-4" />
                                          </Link>Link>
                              </div>div>
                          )}
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {patterns.map(pattern => (
                                <PatternCard key={pattern.id} pattern={pattern} variant="featured" />
                              ))}
                          </div>div>
                  </div>div>
                )
    }
  
    return (
          <div className="glass-card p-4">
            {showHeader && (
                    <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                          <TrendingUp className="w-5 h-5 text-primary-400" />
                                          <h3 className="font-display font-semibold text-white">Trending Patterns</h3>h3>
                              </div>div>
                              <Link href="/insights" className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
                                          View All <ChevronRight className="w-3 h-3" />
                              </Link>Link>
                    </div>div>
                )}
                <div className="space-y-2">
                  {patterns.map(pattern => (
                      <PatternCard key={pattern.id} pattern={pattern} variant="compact" />
                    ))}
                </div>div>
                <div className="mt-4 pt-4 border-t border-gray-700/50">
                        <Link href="/insights" className="block text-center text-sm text-gray-400 hover:text-primary-400 transition-colors">
                                  Explore all patterns &rarr;
                        </Link>Link>
                </div>div>
          </div>div>
        )
}</div>
