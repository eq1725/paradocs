/**
 * Dashboard Overview Page
 *
 * Engagement-focused dashboard: streak & CTA up top, smart stats,
 * recent activity, and sidebar with constellation + quick actions.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  FileText,
  Bookmark,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
  Sparkles,
  BarChart3,
  Stars,
  Plus,
} from 'lucide-react'
import { DashboardLayout } from 'A/components/dashboard/DashboardLayout'
import { UsageMeter } from '@/components/dashboard/UsageMeter'
import { UpgradeCard } from 'A/components/dashboard/UpgradeCard'
import { TierBadge } from 'A/components/dashboard/TierBadge'
import ResearchStreak from '@/components/dashboard/ResearchStreak'
import DashboardTour, { hasDashboardTourCompleted } from 'A/components/dashboard/DashboardTour'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { supabase } from 'A/lib/supabase'
import type { TierName } from '@/lib/subscription'

interface DashboardStats {
  profile: {
    username: string | null
    display_name: string | null
    avatar_url: string | null
    reputation_score: number
    member_since: string
  }
  reports: {
    total: number
    pending: number
    approved: number
    rejected: number
  }
  Y…Ù•èì(€€€Ñ½Ñ…°è¹Õµ‰•È(€ô(€ÍÕ‰ÍÉ¥ÁÑ¥½¸èèY\ˆY\“˜[YBˆY\—Ù\Ü^Nˆİš[™Âˆİ]\Îˆİš[™Âˆ\ØYÙNˆÂˆ™\Ü×ÜİX›Z]Yˆ[X™\‚ˆ™\Ü×ÜØ]™Yˆ[X™\‚ˆ\WØØ[×ÛXYNˆ[X™\‚ˆBˆ[Z]ÎˆÂˆ™\Ü×Ü\—Û[Ûˆ[X™\‚ˆØ]™YÜ™\Ü×ÛX^ˆ[X™\‚ˆ\WØØ[×Ü\—Û[Ûˆ[X™\‚ˆBˆØ[”İX›Z]™\Üˆ›ÛÛX[‚ˆØ[”Ø]™T™\Üˆ›ÛÛX[‚ˆH[ˆ™XÙ[ØXİ]š]Nˆ\œ˜^OÂˆYˆİš[™Âˆ]Nˆİš[™ÂˆÛYÎˆİš[™Âˆİ]\Îˆİš[™ÂˆÜ™X]YØ]ˆİš[™ÂˆO‚ŸB‚™[˜İ[Ûˆ™XÙ[Xİ]š]R][JÂˆ™\ÜŸNˆÂˆ™\ÜˆÂˆYˆİš[™Âˆ]Nˆİš[™ÂˆÛYÎˆİš[™Âˆİ]\Îˆİš[™ÂˆÜ™X]YØ]ˆİš[™ÂˆBŸJHÂˆÛÛœİİ]\ĞÛÛ™šYÈHÂˆ[™[™ÎˆÈXÛÛˆÛØÚËÛÛÜˆ	İ^X[X™\‹M‹™Îˆ	Ø™ËX[X™\‹NLÌÌ	ËX™[ˆ	Ô[™[™ÉÈKˆ\›İ™YˆÈXÛÛˆÚXÚĞÚ\˜ÛKÛÛÜˆ	İ^YÜ™Y[‹M	Ë™Îˆ	Ø™ËYÜ™Y[‹NLŒÌ	ËX™[ˆ	Ğ\›İ™Y	ÈKˆ™Z™XİYˆÈXÛÛˆÚ\˜ÛKÛÛÜˆ	İ^\™YM‹™Îˆ	Ø™Ë\™YNLŒÌ	ËX™[ˆ	Ô™Z™XİY	ÈKˆ˜YˆÈXÛÛˆ[\Ú\˜ÛKÛÛÜˆ	İ^YÜ˜^KM	Ë™Îˆ	Ø™ËYÜ˜^KN‹X™[ˆ	Ñ˜Y	ÈBˆB‚ˆÛÛœİÛÛ™šYÈHİ]\ĞÛÛ™šYÖÜ™\Üœİ]\È\ÈÙ^[Ùˆ\[Ùˆİ]\ĞÛÛ™šY×Hİ]\ĞÛÛ™šYË™˜YˆÛÛœİXÛÛˆHÛÛ™šYËšXÛÛ‚‚ˆÛÛœİ›Ü›X]]HH
]Tİš[™Îˆİš[™ÊHOˆÂˆÛÛœİ]HH™]È]J]Tİš[™ÊBˆÛÛœİ›İÈH™]È]J
BˆÛÛœİY™“\ÈH›İË™Ù][YJ
HH]K™Ù][YJ
BˆÛÛœİY™‘^\ÈHX]™›ÛÜŠY™“\ÈÈ
L
ˆŒ
ˆŒ
ˆ
JB‚ˆYˆ
Y™‘^\ÈOOH
H™]\›ˆ	ÕÙ^IÂˆYˆ
Y™‘^\ÈOOHJH™]\›ˆ	ÖY\İ\™^IÂˆYˆ
Y™‘^\ÈÊH™]\›ˆ	ÙY™‘^\ßYYÛØˆ™]\›ˆ]KÓØØ[Q]Tİš[™Ê	Ù[‹UTÉËÈ[Ûˆ	ÜÚÜ	Ë^Nˆ	Û[Y\šXÉÈJBˆB‚ˆ™]\›ˆ
ˆ[šÂˆ™Y^ØÜ™\ÜÉÜ™\ÜœÛYßXBˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆØ\LÈLÈ™ËYÜ˜^KNL›İ[™Y[È›Ü™\ˆ›Ü™\‹YÜ˜^KNİ™\˜›Ü™\‹YÜ˜^KMÌ˜[œÚ][Û‹XÛÛÜœÈ‚ˆ‚ˆ]ˆÛ\ÜÓ˜[YO^ØLKH›İ[™Y[È	ØÛÛ™šYË˜™ßHÚš[šËLO‚ˆXÛÛˆÛ\ÜÓ˜[YO^ØËMM	ØÛÛ™šYË˜ÛÛÜŸXHÏ‚ˆÙ]‚ˆ]ˆÛ\ÜÓ˜[YOH™›^LHZ[‹]ËL‚ˆÛ\ÜÓ˜[YOH^]Ú]H^\ÛH›Û[YY][H[˜Ø]HÜ™\Ü]_OÜ‚ˆÛ\ÜÓ˜[YOH^^È^YÜ˜^KMLÙ›Ü›X]]J™\Ü˜Ü™X]YØ]
_OÜ‚ˆÙ]‚ˆÜ[ˆÛ\ÜÓ˜[YO^Ø^^È	ØÛÛ™šYË˜ÛÛÜŸHÚš[šËLOØÛÛ™šYË›X™[OÜÜ[‚ˆÓ[šÏ‚ˆ
BŸB‚™^ÜY˜][[˜İ[Ûˆ\Ú›Ø\™YÙJ
HÈ