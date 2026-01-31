interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: number
  icon?: string
  color?: 'green' | 'blue' | 'purple' | 'orange' | 'red'
}

const colorClasses = {
  green: 'from-green-500/20 to-green-600/10 border-green-500/30',
  blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
  purple: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
  orange: 'from-orange-500/20 to-orange-600/10 border-orange-500/30',
  red: 'from-red-500/20 to-red-600/10 border-red-500/30'
}

const iconColors = {
  green: 'text-green-400',
  blue: 'text-blue-400',
  purple: 'text-purple-400',
  orange: 'text-orange-400',
  red: 'text-red-400'
}

export default function StatsCard({ title, value, subtitle, trend, icon, color = 'green' }: StatsCardProps) {
  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-xl p-6 border`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-400 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold mt-1 text-white">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle && (
            <p className="text-gray-500 text-sm mt-1">{subtitle}</p>
          )}
          {trend !== undefined && (
            <p className={`text-sm mt-2 ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)} this week
            </p>
          )}
        </div>
        {icon && (
          <span className={`text-3xl ${iconColors[color]}`}>{icon}</span>
        )}
      </div>
    </div>
  )
}
