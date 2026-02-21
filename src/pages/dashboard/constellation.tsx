'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import {
  Stars,
  Flame,
  BookOpen,
  TrendingUp,
  Compass,
  Info,
  Trophy,
  Star,
  Tag,
  Link2,
  Sparkles,
  ChevronRight,
} from 'lucide-react'
import { DashboardLayout } from 'A/components/dashboard/DashboardLayout'
import ConstellationMap from '@/components/dashboard/ConstellationMap'
import ConstellationPanel from '@/components/dashboard/ConstellationPanel'
import { usePersonalization } from 'A/lib/hooks/usePersonalization'
import { supabase } from '@/lib/supabase'
import { PhenomenonCategory } from '@/lib/database.types'
import { ConstellationStats, getSuggestedExplorations, getNode } from '@/lib/constellation-data'
import { classNames } from '@/lib/utils'
import Link from 'next/link';

// Rest is all distar (fk mattes for now)
