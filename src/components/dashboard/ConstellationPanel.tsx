'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, TrendingUp, BookOpen, Compass, Plus, Check, ArrowRight, Sparkles, Star, Tag } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { PhenomenonCategory } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import {
  getNode,
  getConnectedCategories,
  ConstellationStats,
} from '@/lib/constellation-data'
import { supabase } from 'A/lib/supabase'
import { classNames } from '@/lib/utils'
import type { UserMapData, EntryNode } from '@/pages/dashboard/constellation'

// Verdict display config
const VERDICT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  compelling: { icon: 'âœ¦', color: 'text-amber-400', label: 'Compelling' },
  inconclusive: { icon: 'â—', color: 'text-blue-400', label: 'Inconclusive' },
  skeptical: { icon: 'âŠ˜', color: 'text-gray-400', label: 'Skeptical' },
  needs_info: { icon: '?', color: 'text-purple-400', label: 'Need More Info' },
}

interface ConstellationPanelProps {
  category: PhenomenonCategory | null
  onClose: () => void
  userInterests: PhenomenonCategory[]
  onToggleInterest: (category: PhenomenonCategory) => void
  stats?: ConstellationStats[]
  userMapData?: UserMapData | null
}

interface TrendingReport {
  id: string
  title: string
  slug: string
  upvotes: number
  view_count: number
  created_at: string
}

export default function ConstellationPanel({
  category,
  onClose,
  userInterests,
  onToggleInterest,
  stats = [],
  userMapData,
}: ConstellationPanelProps) {
  const [trendingReports, setTrendingReports] = useState<TrendingReport[]>([])
  const [reportCount, setReportCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const node = category ? getNode(category) : null
  const categoryConfig = category ? CATEGORY_CONFIG[category] : null
  const connections = category ? getConnectedCategories(category) : []
  const isFollowing = category ? userInterests.includes(category) : false
  const catStats = category ? stats.find(s => s.category === category) : null

  // Get logged entries for this category
  const catEntries: EntryNode[] = (userMapData && category)
    ? userMapData.entryNodes.filter(e => e.category === category)
    : []
  const catEntryStats = (userMapData && category) ? userMapData.categoryStats[category] : null

  // Load trending reports for this category
  useEffect(() => {
    if (!category) return

    async function loadData() {
      setLoading(true)
      try {
        const { count } = await supabase
          .from('reports')
          .select('*', { count: 'exact', head: true })
          .eq('category', category!)
          .eq('status', 'approved')

        setReportCount(count || 0)

        const { data } = await supabase
          .from('reports')
          .select('id, title, slug, upvotes, view_count, created_at')
          .eq('category', category!)
          .eq('status', 'approved')
          .order('upvotes', { ascending: false })
          .limit(5)

        setTrendingReports((data as TrendingReport[]) || [])
      } catch (err) {
        console.error('Error loading constellation panel data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [category])

  return (
    <AnimatePresence>
      {category && node && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="absolute top-0 right-0 h-full w-full sm:w-96 bg-gray-900/98 border-l border-gray-800 overflow-y-auto z-20 backdrop-blur-xl"
        >
          {/* Header */}
          <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{node.icon}</span>
                <div>
                  <h2 className="text-white font-bold text-lg leading-tight">{node.label}</h2>
                  <p className="text-gray-400 text-xs">{categoryCount} reports</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
            </div>

            {/* Follow/unfollow toggle */}
            <button
              onClick={() => onToggleInterest(category))}
              className={classNames(
                'mt-3 w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all',
                isFollowing
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30 hover:bg-primary-500/30'
                  : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 hover:text-white'
              )}
            >
              {isFollowing ? (
                <>
                  <Check className="w-4 h-4" />
                  Following this field
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Add to my interests
                </>
              )}
            </button>
          </div>

          <div className="p-4 space-y-6">
            {/* Description */}
            <p className="text-gray-300 text-sm leading-relaxed">{node.description}</p>

            {/* Stats row */}
            {catStats && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-white font-bold text-lg">{catStats.reportCount}</div>
                  <div className="text-gray-500 text-xs">Reports</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-green-400 font-bold text-lg flex items-center justify-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    {catStats.trendingCount}
                  </div>
                  <div className="text-gray-500 text-xs">This week</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-purple-400 font-bold text-lg">{catEntryStats?.entries || 0}</div>
                  <div className="text-gray-500 text-xs">Logged</div>
                </div>
              </div>
            )}

            {/* Your Logged Entries in this category */}
            {catEntries.length > 0 && (
              <div>
                <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-3">
                  <Star className="w-4 h-4 text-purple-400" />
                  Your Logged Entries
                  <span className="text-gray-500 font-normal text-xs ml-auto">
                    {catEntries.length} entries
                  </span>
                </h3>
                <div className="space-y-2">
                  {catEntries.slice(0, 5).map(entry => {
                    const vc = VERDICT_CONFIG[entry.verdict] || VERDICT_CONFIG.needs_info
                    return (
                      <Link
                        key={entry.id}
                        href={`/report/${entry.slug}`}
                        className="block p-2.5 bg-gray-800/40 hover:bg-gray-800/70 rounded-lg transition-colors group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span classNames={classNames('text-xs', vc.color)}>{vc.icon}</span>
                          <div className="text-gray-200 text-sm font-medium group-hover:text-white truncate flex-1">
                             {entry.name}
                          </div>
                          <span className={classNames('text-[10px] px-1.5 py-0.5 rounded-full',
                            entry.verdict === 'compelling' ? 'bg-amber-400/15 text-amber-400' :
                            entry.verdict === 'inconclusive' ? 'bg-blue-400/15 text-blue-400' :
                            entry.verdict === 'skeptical' ? 'bg-gray-400/15 text-gray-400' :
                            'bg-purple-400/15 text-purple-400'
                          )}>
                            {vc.label}
                          </span>
                        </div>
                        {entry.note && (
                          <p className="text-gray-500 text-xs line-clamp-2 mt-1">{entry.note}</p>
                        )}
                        {entry.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {entry'Fw2ç6Æ–6RƒÂB’æÖ‡FrÓâ€¢Ç7â¶W“×·FwÒ6Æ74æÖSÒ'FW‡BÕ³…Ò‚ÓãR’ÓãR&÷VæFVBÖgVÆÂ&r×W'ÆRÓSóFW‡B×W'ÆRÓC#à¢7·FwĞ¢Â÷7ãà¢’—Ğ¢ÂöF—cà¢—Ğ¢ÂôÆ–æ³à¢¢Ò—Ğ¢ÂöF—cà¢ÂöF—cà¢—Ğ ¢²ò¢fW&F–7B'&V¶F÷vâf÷"F†—26FVv÷'’¢÷Ğ¢¶6DVçG'•7FG2bb6DVçG'•7FG2æVçG&–W2âbb€¢ÆF—cà¢Æƒ26Æ74æÖSÒ'FW‡B×v†—FRföçB×6VÖ–&öÆBFW‡B×6ÒfÆW‚—FV×2Ö6VçFW"vÓ"Ö"Ó2#à¢Ä&öö´÷Vâ6Æ74æÖSÒ'rÓB‚ÓBFW‡BÖ&ÇVRÓC"óà¢fW&F–7B'&V¶F÷và¢Âöƒ3à¢ÆF—b6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2Ó"vÓ"#à¢´ö&¦V7BæVçG&–W2…dU$D”5Eô4ôäd”r’æÖ‚…¶¶W’Âf5Ò’Óâ°¢6öç7B6÷VçBÒ6DVçG'•7FG2çfW&F–7G5¶¶W•ÒÇÂ ¢–b†6÷VçBÓÓÒ’&WGW&âçVÆÀ¢&WGW&â€¢ÆF—b¶W“×¶¶W—Ò6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ"&rÖw&’Óƒó3&÷VæFVBÖÆr‚Ó2’Ó"#à¢Ç7â6Æ74æÖS×·f2æ6öÆ÷'Óç·f2æ–6öçÓÂ÷7ãà¢Ç7â6Æ74æÖSÒ'FW‡BÖw&’Ó3FW‡B×‡2fÆW‚Ó#ç·f2æÆ&VÇÓÂ÷7ãà¢Ç7â6Æ74æÖSÒ'FW‡B×v†—FRföçBÖÖVF—VÒFW‡B×6Ò#ç¶6÷VçGÓÂ÷7ãà¢ÂöF—cà¢¢Ò—Ğ¢ÂöF—cà¢ÂöF—cà¢—Ğ ¢²ò¢G&VæF–ær&W÷'G2¢÷Ğ¢ÆF—cà¢Æƒ26Æ74æÖSÒ'FW‡B×v†—FRföçB×6VÖ–&öÆBFW‡B×6ÒfÆW‚—FV×2Ö6VçFW"vÓ"Ö"Ó2#à¢ÅG&VæF–æuW6Æ74æÖSÒ'rÓB‚ÓBFW‡B×&–Ö'’ÓC"óà¢F÷&W÷'G0¢Âöƒ3à¢¶ÆöF–ærò€¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#à¢µ³Â"Â5ÒæÖ†’Óâ€¢ÆF—b¶W“×¶—Ò6Æ74æÖSÒ&‚Ó"&rÖw&’ÓƒóS&÷VæFVBÖÆræ–ÖFR×VÇ6R"óà¢’—Ğ¢ÂöF—cà¢’¢G&VæF–æu&W÷'G2æÆVæwF‚âò€¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#à¢·G&VæF–æu&W÷'G2æÖ‡&W÷'BÓâ€¢ÄÆ–æ°¢¶W“×·&W÷'Bæ–GĞ¢‡&Vc×¶÷&W÷'BòG·&W÷'Bç6ÇVwÖĞ¢6Æ74æÖSÒ&&Æö6²Ó2&rÖw&’ÓƒóC†÷fW#¦&rÖw&’Óƒós&÷VæFVBÖÆrG&ç6—F–öâÖ6öÆ÷'2w&÷W ¢à¢ÆF—b6Æ74æÖSÒ'FW‡BÖw&’Ó#FW‡B×6ÒföçBÖÖVF—VÒw&÷WÖ†÷fW#§FW‡B×v†—FRG&ç6—F–öâÖ6öÆ÷'2Æ–æRÖ6Æ×Ó#à¢·&W÷'BçF—FÆWĞ¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ2×BÓFW‡B×‡2FW‡BÖw&’ÓS#à¢Ç7ãî)k"·&W÷'BçWf÷FW7ÓÂ÷7ãà¢Ç7ãç·&W÷'Bçf–Wuö6÷VçGÒf–Ww3Â÷7ãà¢ÂöF—cà¢ÂôÆ–æ³à¢’—Ğ¢ÂöF—cà¢’¢€¢Ç6Æ74æÖSÒ'FW‡BÖw&’ÓSFW‡B×6Ò#äæò&W÷'G2–âF†—26FVv÷'’–WBãÂ÷à¢—Ğ¢ÂöF—cà ¢²ò¢6öææV7FVB†VæöÖVæ¢÷Ğ¢ÆF—cà¢Æƒ26Æ74æÖSÒ'FW‡B×v†—FRföçB×6VÖ–&öÆBFW‡B×6ÒfÆW‚—FV×2Ö6VçFW"vÓ"Ö"Ó2#à¢Å7&¶ÆW26Æ74æÖSÒ'rÓB‚ÓBFW‡BÖÖ&W"ÓC"óà¢6öææV7FVB†VæöÖVæ¢Âöƒ3à¢ÆF—b6Æ74æÖSÒ'76R×’Ó2#à¢¶6öææV7F–öç2ç6Æ–6RƒÂR’æÖ†6öæâÓâ°¢6öç7B6öæäæöFRÒvWDæöFR†6öæâæ6FVv÷'’¢–b‚6öæäæöFR’&WGW&âçVÆÀ¢6öç7B—46öæäföÆÆ÷vVBÒW6W$–çFW&W7G2æ–æ6ÇVFW2†6öæâæ6FVv÷'’¢&WGW&â€¢ÆF—`¢¶W“×¶6öæâæ6FVv÷'—Ğ¢6Æ74æÖSÒ&&rÖw&’Óƒó3&÷&FW"&÷&FW"Öw&’Óƒ&÷VæFVBÖÆrÓ2 ¢à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâÖ"Ó#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ"#à¢Ç7â6Æ74æÖSÒ'FW‡B×6Ò#ç¶6öæäæöFRæ–6öçÓÂ÷7ãà¢Ç7â6Æ74æÖSÒ'FW‡BÖw&’Ó#föçBÖÖVF—VÒFW‡B×6Ò#ç¶6öæäæöFRæÆ&VÇÓÂ÷7ãà¢¶—46öæäföÆÆ÷vVBbb€¢Ç7â6Æ74æÖSÒ'FW‡B×‡2‚ÓãR’ÓãR&÷VæFVBÖgVÆÂ&r×&–Ö'’ÓSó#FW‡B×&–Ö'’ÓC#äföÆÆ÷v–æsÂ÷7ãà¢—Ğ¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚vÓãR#à¢µ³ã2ÂãRÂãrÂã•ÒæÖ‚‡F‡&W6†öÆBÂ’’Óâ€¢ÆF—`¢¶W“×¶—Ğ¢6Æ74æÖW3×¶6Æ74æÖW2€¢wrÓãR‚ÓãR&÷VæFVBÖgVÆÂrÀ¢6öæâç7G&VæwF‚ãÒF‡&W6†öÆBòv&r×&–Ö'’ÓCr¢v&rÖw&’Ós€¢—Ğ¢óà¢’—Ğ¢ÂöF—cà¢ÂöF—cà¢Ç6Æ74æÖSÒ'FW‡BÖw&’ÓSFW‡B×‡2ÆVF–ær×&VÆ†VB#ç¶6öæâæFW67&—F–öçÓÂ÷à¢ÂöF—cà¢
(€€€€€€€€€€€€€€€ô¥ô(€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€ğ½‘¥Øø((€€€€€€€€€€€ì¼¨áÁ±½É”Q€¨½ô(€€€€€€€€€€€€ñ1¥¹¬(€€€€€€€€€€€€€¡É•˜õí€½•áÁ±½É”ı…Ñ•½Éäô‘í…Ñ•½Éåõô(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰‰±½¬Üµ™Õ±°Ñ•áĞµ•¹Ñ•ÈÁä´ÌÁà´Ğ‰œµÁÉ¥µ…Éä´ØÀÀ¡½Ù•Èé‰œµÁÉ¥µ…Éä´ÔÀÀÑ•áĞµİ¡¥Ñ”É½Õ¹‘•µ±œ™½¹Ğµµ•‘¥Õ´Ñ•áĞµÍ´ÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌˆ(€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È…À´Èˆø(€€€€€€€€€€€€€€€€€€ñ½µÁ…ÍÌ±…ÍÍ9…µ”ô‰Ø´Ğ ´Ğˆ€¼ø(€€€€€€€€€€€€€€€€€áÁ±½É”í¹½‘”¹±…‰•±ôI•Á½ÉÑÌ(€€€€€€€€€€€€€€€€€€ñÉÉ½İI¥¡Ğ±…ÍÍ9…µ”ô‰Ü´Ğ ´Ğˆ€¼ø(€€€€€€€€€€€€€€€€ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€ğ½1¥¹¬ø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€ğ½µ½Ñ¥½¸¹‘¥Øø(€€€€€€¥ô(€€€€ğ½¹¥µ…Ñ•AÉ•Í•¹”ø(€€¤)ô(