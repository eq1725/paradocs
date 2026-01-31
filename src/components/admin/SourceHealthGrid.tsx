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
  wikipedia: '📖'
}

function getHealthStatus(source: DataSource): 'healthy' | 'warning' | 'inactive' | 'error' {
  if (!source.is_active) return 'inactive'
  if (source.error_count > 5) return 'error'
  if (source.error_count > 0) return 'warning'
  return 'healthy'
}

const healthColors = {
  healthy: 'border-green-500/50 bg-green-500/10',
  warning: 'border-yellow-500/50 bg-yellow-500/10',
  error: 'border-red-500/50 bg-red-500/10',
  inactive: 'border-gray-600/50 bg-gray-700/30'
}

const healthIndicators = {
  healthy: '🟢',
  warning: '🟡',
  error: '🔴',
  inactive: '⚫'
}

export default function SourceHealthGrid({ sources, onToggle, onRunIngestion, ingesting }: SourceHealthGridProps) {
  const activeSources = sources.filter(s => s.adapter_type)

  function formatLastSync(timestamp: string | null) {
    if (!timestamp) return 'Never synced'
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  return (
    <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
      <h3 className="text-lg font-semibold mb-4">Source Health</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeSources.map(source => {
          const health = getHealthStatus(source)
          const isRunning = ingesting === source.id

          return (
            <div
              key={source.id}
              className={`rounded-lg border p-4 transition-all ${healthColors[health]}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{sourceIcons[source.adapter_type || ''] || '📄'}</span>
                  <div>
                    <h4 className="font-medium">{source.name}</h4>
                    <p className="text-xs text-gray-400">{source.adapter_type}</p>
                  </div>
                </div>
                <span className="text-lg" title={health}>{healthIndicators[health]}</span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Last sync</span>
                  <span className="text-gray-300">{formatLastSync(source.last_synced_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total records</span>
                  <span className="text-green-400">{source.total_records?.toLocaleString() || 0}</span>
                </div>
                {source.error_count > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Errors</span>
                    <span className="text-red-400">{source.error_count}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => onRunIngestion(source.id)}
                  disabled={ingesting !== null || !source.is_active}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                >
                  {isRunning ? (
                    <span className="flex items-center justify-center gap-1">
                      <span className="animate-spin">⟳</span> Running...
                    </span>
                  ) : (
                    '▶ Run Now'
                  )}
                </button>
                <button
                  onClick={() => onToggle(source.id, source.is_active)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    source.is_active
                      ? 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                      : 'bg-green-600 hover:bg-green-500 text-white'
                  }`}
                >
                  {source.is_active ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
