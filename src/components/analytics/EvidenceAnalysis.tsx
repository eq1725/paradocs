/**
 * Evidence & Source Analysis Component
 *
 * Visualizes:
 * - Evidence type distribution (photos, physical evidence, official reports)
 * - Data source breakdown
 * - Witness statistics
 */

import React from 'react'
import {
  Camera,
  FileText,
  Shield,
  Users,
  Database,
  Eye,
  UserCheck,
  UserX,
  Percent
} from 'lucide-react'

interface EvidenceData {
  total: number
  withPhotoVideo: { count: number; percentage: number }
  withPhysicalEvidence: { count: number; percentage: number }
  withOfficialReport: { count: number; percentage: number }
  withAnyEvidence: { count: number; percentage: number }
}

interface SourceData {
  source: string
  count: number
}

interface WitnessData {
  totalReports: number
  totalWitnesses: number
  averageWitnessCount: string
  reportsWithMultipleWitnesses: number
  submitterWasWitness: number
  anonymousSubmissions: number
  anonymousPercentage: number
}

interface EvidenceAnalysisProps {
  evidenceData: EvidenceData
  sourceData: SourceData[]
  witnessData: WitnessData
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  user_submission: { label: 'User Submissions', color: '#5b63f1' },
  nuforc: { label: 'NUFORC Database', color: '#22c55e' },
  mufon: { label: 'MUFON Reports', color: '#f59e0b' },
  bfro: { label: 'BFRO Database', color: '#a855f7' },
  historical: { label: 'Historical Archives', color: '#ef4444' },
  media: { label: 'Media Reports', color: '#3b82f6' },
  other: { label: 'Other Sources', color: '#6b7280' },
}

export default function EvidenceAnalysis({
  evidenceData,
  sourceData,
  witnessData,
}: EvidenceAnalysisProps) {
  const totalSourceCount = sourceData.reduce((sum, s) => sum + s.count, 0)

  return (
    <div className="space-y-6">
      {/* Evidence Types */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-green-400" />
          Evidence Analysis
        </h3>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            {
              icon: Camera,
              label: 'Photo/Video',
              data: evidenceData.withPhotoVideo,
              color: 'blue',
            },
            {
              icon: FileText,
              label: 'Physical Evidence',
              data: evidenceData.withPhysicalEvidence,
              color: 'green',
            },
            {
              icon: Shield,
              label: 'Official Report',
              data: evidenceData.withOfficialReport,
              color: 'purple',
            },
            {
              icon: Eye,
              label: 'Any Evidence',
              data: evidenceData.withAnyEvidence,
              color: 'amber',
            },
          ].map(item => {
            const Icon = item.icon
            return (
              <div key={item.label} className="text-center p-4 rounded-lg bg-white/5">
                <Icon className={`w-6 h-6 mx-auto mb-2 text-${item.color}-400`} />
                <div className="text-2xl font-bold text-white mb-1">
                  {item.data.percentage}%
                </div>
                <div className="text-xs text-gray-400 mb-2">{item.label}</div>
                <div className="text-xs text-gray-500">
                  {item.data.count.toLocaleString()} reports
                </div>
              </div>
            )
          })}
        </div>

        {/* Evidence quality indicator */}
        <div className="p-4 rounded-lg bg-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Overall Evidence Quality</span>
            <span className="text-sm font-medium text-white">
              {evidenceData.withAnyEvidence.percentage}% with supporting evidence
            </span>
          </div>
          <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full transition-all"
              style={{ width: `${evidenceData.withAnyEvidence.percentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Data Sources */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-400" />
          Data Sources
        </h3>

        <div className="space-y-3">
          {sourceData.map(source => {
            const config = SOURCE_LABELS[source.source] || {
              label: source.source.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              color: '#6b7280'
            }
            const percentage = totalSourceCount > 0
              ? Math.round((source.count / totalSourceCount) * 100)
              : 0

            return (
              <div key={source.source}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-300">{config.label}</span>
                  <span className="text-sm text-white font-medium">
                    {source.count.toLocaleString()} ({percentage}%)
                  </span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: config.color
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {sourceData.length === 0 && (
          <div className="text-center py-4 text-gray-500">
            <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No source data available</p>
          </div>
        )}
      </div>

      {/* Witness Statistics */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-400" />
          Witness Statistics
        </h3>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-white/5 text-center">
            <Users className="w-6 h-6 mx-auto mb-2 text-purple-400" />
            <div className="text-2xl font-bold text-white">
              {witnessData.totalWitnesses.toLocaleString()}
            </div>
            <div className="text-xs text-gray-400">Total Witnesses</div>
          </div>

          <div className="p-4 rounded-lg bg-white/5 text-center">
            <Percent className="w-6 h-6 mx-auto mb-2 text-blue-400" />
            <div className="text-2xl font-bold text-white">
              {witnessData.averageWitnessCount}
            </div>
            <div className="text-xs text-gray-400">Avg per Report</div>
          </div>

          <div className="p-4 rounded-lg bg-white/5 text-center">
            <Users className="w-6 h-6 mx-auto mb-2 text-green-400" />
            <div className="text-2xl font-bold text-white">
              {witnessData.reportsWithMultipleWitnesses.toLocaleString()}
            </div>
            <div className="text-xs text-gray-400">Multi-Witness Reports</div>
          </div>

          <div className="p-4 rounded-lg bg-white/5 text-center">
            <UserCheck className="w-6 h-6 mx-auto mb-2 text-amber-400" />
            <div className="text-2xl font-bold text-white">
              {witnessData.submitterWasWitness.toLocaleString()}
            </div>
            <div className="text-xs text-gray-400">First-hand Accounts</div>
          </div>

          <div className="p-4 rounded-lg bg-white/5 text-center">
            <UserX className="w-6 h-6 mx-auto mb-2 text-gray-400" />
            <div className="text-2xl font-bold text-white">
              {witnessData.anonymousPercentage}%
            </div>
            <div className="text-xs text-gray-400">Anonymous</div>
          </div>

          <div className="p-4 rounded-lg bg-white/5 text-center">
            <Eye className="w-6 h-6 mx-auto mb-2 text-cyan-400" />
            <div className="text-2xl font-bold text-white">
              {witnessData.totalReports > 0
                ? Math.round((witnessData.submitterWasWitness / witnessData.totalReports) * 100)
                : 0}%
            </div>
            <div className="text-xs text-gray-400">Eyewitness Rate</div>
          </div>
        </div>
      </div>
    </div>
  )
}
