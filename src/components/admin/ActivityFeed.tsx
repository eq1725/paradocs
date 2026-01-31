import { useEffect, useState } from 'react'

interface LogEntry {
  id: string
  level: 'info' | 'warning' | 'error' | 'success'
  message: string
  created_at: string
  metadata?: Record<string, unknown>
  data_sources?: { name: string; slug: string }
}

interface ActivityFeedProps {
  maxItems?: number
  refreshInterval?: number
}

const levelIcons = {
  info: '📊',
  warning: '⚠️',
  error: '❌',
  success: '✅'
}

const levelColors = {
  info: 'text-blue-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
  success: 'text-green-400'
}

export default function ActivityFeed({ maxItems = 20, refreshInterval = 30000 }: ActivityFeedProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchLogs() {
    try {
      const res = await fetch(`/api/admin/logs?limit=${maxItems}`)
      const data = await res.json()
      setLogs(data.logs || [])
    } catch (error) {
      console.error('Failed to fetch logs:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    const interval = setInterval(fetchLogs, refreshInterval)
    return () => clearInterval(interval)
  }, [maxItems, refreshInterval])

  function formatTime(timestamp: string) {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  function formatDate(timestamp: string) {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
  }

  if (loading) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
        <h3 className="text-lg font-semibold mb-4">Activity Feed</h3>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-8 bg-gray-700/50 rounded"></div>
          ))}
        </div>
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
        <h3 className="text-lg font-semibold mb-4">Activity Feed</h3>
        <p className="text-gray-400 text-center py-8">
          No activity logs yet. Run an ingestion to see activity here.
        </p>
      </div>
    )
  }

  // Group logs by date
  const groupedLogs: Record<string, LogEntry[]> = {}
  logs.forEach(log => {
    const dateKey = formatDate(log.created_at)
    if (!groupedLogs[dateKey]) {
      groupedLogs[dateKey] = []
    }
    groupedLogs[dateKey].push(log)
  })

  return (
    <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Activity Feed</h3>
        <button
          onClick={fetchLogs}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
        {Object.entries(groupedLogs).map(([dateLabel, dateLogs]) => (
          <div key={dateLabel}>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{dateLabel}</p>
            <div className="space-y-2">
              {dateLogs.map(log => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-700/30 transition-colors"
                >
                  <span className="text-lg">{levelIcons[log.level]}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${levelColors[log.level]}`}>
                      {log.data_sources?.name && (
                        <span className="font-medium">{log.data_sources.name}: </span>
                      )}
                      {log.message}
                    </p>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {Object.entries(log.metadata)
                          .filter(([, v]) => v !== null && v !== undefined)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' • ')}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {formatTime(log.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
