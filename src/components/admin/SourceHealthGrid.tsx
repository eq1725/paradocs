interface DataSource {
  id: string
  name: string
  slug: string
  adapter_type: string | null
  is_active: boolean
  last_synced_at: string | null
  total_records: number
  error_count: number
}

interface SourceHealthGridProps {
  sources: DataSource[]
  onToggle: (sourceId: string, isActive: boolean) => void
  onRunIngestion: (sourceId: string) => void
  ingesting: string | null
}

const sourceIcons: Record<string, string> = {
  nuforc: '🛸',
  bfro: '🦶',
  reddit: '🔗',
  shadowlands: '👻',
  ghostsofamerica: '🏚️',
  wikipedia: '📖',
  nde: '✨',
  mufon: '🌌',
}

function getHealthStatus(source: DataSource): 'healthy' | 'warning' | 'inactive' | 'error' {
  if (!source.is_active) return 'inactive'
  if (source.error_count > 5) return 'error'
  if (source.error_count > 0) return 'warning'
  return 'healthy'
}

const healthStyles = {
  healthy: {
    border: 'border-green-500/30',
    bg: 'bg-green-500/5',
    hoverBg: 'hover:bg-green-500/10',
    dot: 'bg-green-500',
    text: 'text-green-400',
  },
  warning: {
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-500/5',
    hoverBg: 'hover:bg-yellow-500/10',
    dot: 'bg-yellow-500',
    text: 'text-yellow-400',
  },
  error: {
    border: 'border-red-500/30',
    bg: 'bg-red-500/5',
    hoverBg: 'hover:bg-red-500/10',
    dot: 'bg-red-500',
    text: 'text-red-400',
  },
  inactive: {
    border: 'border-gray-600/30',
    bg: 'bg-gray-800/30',
    hoverBg: 'hover:bg-gray-700/30',
    dot: 'bg-gray-500',
    text: 'text-gray-500',
  },
}

export default function SourceHealthGrid({ sources, onToggle, onRunIngestion, ingesting }: SourceHealthGridProps) {
  const activeSources = sources.filter(s => s.adapter_type)

  // Calculate summary stats
  const healthCounts = activeSources.reduce((acc, source) => {
    const health = getHealthStatus(source)
    acc[health] = (acc[health] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const totalRecords = activeSources.reduce((sum, s) => sum + (s.total_records || 0), 0)

  function formatLastSync(timestamp: string | null) {
    if (!timestamp) return 'Never'
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <span>🔌</span> Source Health
          </h3>
          <div className="flex items-center gap-3 text-xs">
            {healthCounts.healthy > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className="text-gray-400">{healthCounts.healthy}</span>
              </span>
            )}
            {healthCounts.warning > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                <span className="text-gray-400">{healthCounts.warning}</span>
              </span>
            )}
            {healthCounts.error > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span className="text-gray-400">{healthCounts.error}</span>
              </span>
            )}
            {healthCounts.inactive > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                <span className="text-gray-400">{healthCounts.inactive}</span>
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {totalRecords.toLocaleString()} total records across {activeSources.length} sources
        </p>
      </div>

      {/* Source Grid */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {activeSources.map(source => {
          const health = getHealthStatus(source)
          const styles = healthStyles[health]
          const isRunning = ingesting === source.id

          return (
            <div
              key={source.id}
              className={`rounded-lg border p-3 transition-all ${styles.border} ${styles.bg} ${styles.hoverBg}`}
            >
              {/* Top row: Icon, name, status */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-gray-700/50 flex items-center justify-center text-lg shrink-0">
                  {sourceIcons[source.adapter_type || ''] || '📄'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm truncate">{source.name}</h4>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${styles.dot}`}></span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{source.adapter_type}</p>
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 text-xs mb-3">
                <div>
                  <span className="text-gray-500">Records</span>
                  <p className="font-mono text-green-400">{(source.total_records || 0).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-gray-500">Last sync</span>
                  <p className="text-gray-300">{formatLastSync(source.last_synced_at)}</p>
                </div>
                {source.error_count > 0 && (
                  <div>
                    <span className="text-gray-500">Errors</span>
                    <p className="text-red-400">{source.error_count}</p>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => onRunIngestion(source.id)}
                  disabled={ingesting !== null || !source.is_active}
                  className="flex-1 bg-blue-600/80 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
                >
                  {isRunning ? (
                    <span className="flex items-center justify-center gap-1">
                      <span className="animate-spin">⟳</span> Running
                    </span>
                  ) : (
                    '▶ Run'
                  )}
                </button>
                <button
                  onClick={() => onToggle(source.id, source.is_active)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    source.is_active
                      ? 'bg-gray-700/50 hover:bg-gray-600 text-gray-400 hover:text-gray-200'
                      : 'bg-green-600/80 hover:bg-green-600 text-white'
                  }`}
                >
                  {source.is_active ? 'Off' : 'On'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
