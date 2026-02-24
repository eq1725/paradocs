'use client'

/**
 * NodeDetailPanel — Slide-out detail view for a selected constellation entry.
 *
 * Shows report image, verdict, user's note, tags, connections,
 * and links to the full report page.
 */

import React from 'react'
import Link from 'next/link'
import {
  X as XIcon,
  ExternalLink,
  Tag,
  Link2,
  MapPin,
  Calendar,
  ChevronRight,
  Star,
  Stars,
  Lightbulb,
  BookOpen,
} from 'lucide-react'
import type { EntryNode, UserMapData } from '@/pages/dashboard/constellation'

// Category display config
const CATEGORY_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  ufos_aliens: { label: 'UFOs & Aliens', icon: '🛸', color: 'text-green-400' },
  cryptids: { label: 'Cryptids', icon: '🦶', color: 'text-amber-400' },
  ghosts_hauntings: { label: 'Ghosts & Hauntings', icon: '👻', color: 'text-purple-400' },
  psychic_phenomena: { label: 'Psychic Phenomena', icon: '🔮', color: 'text-blue-400' },
  consciousness_practices: { label: 'Consciousness', icon: '🧘', color: 'text-violet-400' },
  psychological_experiences: { label: 'Psychological', icon: '🧠', color: 'text-pink-400' },
  biological_factors: { label: 'Biological', icon: '🧬', color: 'text-teal-400' },
  perception_sensory: { label: 'Perception', icon: '👁️', color: 'text-cyan-400' },
  religion_mythology: { label: 'Religion & Mythology', icon: '⛩️', color: 'text-orange-400' },
  esoteric_practices: { label: 'Esoteric', icon: '✨', color: 'text-indigo-400' },
  combination: { label: 'Multi-Category', icon: '🌀', color: 'text-gray-400' },
}
