'use client'

import React from 'react'
import Link from 'next/link'
import { FileText, MapPin, Zap, Lock, ArrowRight } from 'lucide-react'
import { classNames } from '@/lib/utils'

interface FeatureItemProps {
  icon: React.ReactNode
  title: string
  description: string
}

function FeatureItem({ icon, title, description }: FeatureItemProps) {
  return (
    <div className="flex gap-4">
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500/20 to-purple-500/20 flex items-center justify-center text-primary-400 flex-shrink-0">
        {icon}
      </div>
      <div>
        <h4 className="font-semibold text-white mb-1">{title}</h4>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
    </div>
  )
}

export default function DashboardPreview() {
  return (
    <section className="py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left side: Mockup/Preview */}
          <div className="relative">
            <div className="glass-card rounded-xl overflow-hidden border border-white/10 p-6 md:p-8">
              {/* Mock dashboard header */}
              <div className="mb-6 pb-6 border-b border-white/10">
                <h3 className="text-xl font-semibold text-white mb-2">Research Command Center</h3>
                <p className="text-sm text-gray-400">Manage your paranormal investigations</p>
              </div>

              {/* Mock feature cards */}
              <div className="space-y-5">
                <FeatureItem
                  icon={<FileText className="w-5 h-5" />}
                  title="Case Files"
                  description="Organize reports, links, files, and videos into cohesive investigations"
                />
                <FeatureItem
                  icon={<MapPin className="w-5 h-5" />}
                  title="Constellation"
                  description="Map connections between reports and see the bigger picture"
                />
                <FeatureItem
                  icon={<Zap className="w-5 h-5" />}
                  title="AI Analysis"
                  description="Cross\u2013reference your case files against the entire database"
                />
              </div>

              {/* Decorative badge */}
              <div className="mt-6 pt-6 border-t border-white/10 flex items-center gap-2 text-xs text-gray-400">
                <Lock className="w-4 h-4 text-primary-400" />
                Pro features available with upgrade
              </div>
            </div>

            {/* Floating accent */}
            <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-primary-500/10 rounded-full blur-3xl -z-10"></div>
          </div>

          {/* Right side: Content */}
          <div>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-4">
              Your Research Command Center
            </h2>
            <p className="text-lg text-gray-400 mb-8">
              Everything you need to organize, investigate, and share your paranormal research. Build comprehensive case files, map connections between incidents, and let our AI help you find patterns across the entire Paradocs database.
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                  <svg className="w-3 h-3 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293\u20137.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-white">Centralize your research in one secure workspace</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                  <svg className="w-3 h-3 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293\u20137.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-white">Connect disparate incidents and find hidden patterns</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                  <svg className="w-3 h-3 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293\u20137.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-white">Leverage AI to cross\u2013reference millions of sources</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/login?reason=research"
                className={classNames(
                  'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg',
                  'bg-primary-500 hover:bg-primary-600 text-white font-medium transition-colors'
                )}
              >
                Start Researching Free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/pricing"
                className={classNames(
                  'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg',
                  'border border-white/10 hover:border-white/20 text-white hover:bg-white/5 font-medium transition-colors'
                )}
              >
                See Pro Features
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
