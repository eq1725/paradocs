'use client'

import React from 'react'
import { LucideIcon } from 'lucide-react'
import { classNames } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: string | number
  change?: number
  icon: LucideIcon
  color?: 'primary' | 'green' | 'amber' | 'purple' | 'red'
}

export default function StatsCard({
  title,
  value,
  change,
  icon: Icon,
  color = 'primary'
}: StatsCardProps) {
  const colorClasses = {
    primary: 'bg-primary-500/10 text-primary-400',
    green: 'bg-green-500/10 text-green-400',
    amber: 'bg-amber-500/10 text-amber-400',
    purple: 'bg-purple-500/10 text-purple-400',
    red: 'bg-red-500/10 text-red-400',
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400">{title}</p>
          <p className="mt-2 text-3xl font-display font-bold text-white">{value}</p>
          {typeof change === 'number' && (
            <p className={classNames(
              'mt-1 text-sm',
              change >= 0 ? 'text-green-400' : 'text-red-400'
            )}>
              {change >= 0 ? '+' : ''}{change}% from last month
            </p>
          )}
        </div>
        <div className={classNames('p-3 rounded-xl', colorClasses[color])}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  )
}
