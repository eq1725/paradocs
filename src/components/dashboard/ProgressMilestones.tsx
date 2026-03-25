/**
 * ProgressMilestones — localStorage-based milestone tracking.
 *
 * Tracks which dashboard sections the user has "unlocked":
 * - First save → unlocks Saved section celebration
 * - First case file → unlocks Investigations highlight
 * - 5+ constellation entries → unlocks Constellation preview
 * - 5+ artifacts → unlocks AI Insights
 *
 * Each milestone fires once and persists in localStorage.
 */

import { useState, useEffect } from 'react'

interface Milestones {
  firstSave: boolean
  firstCaseFile: boolean
  constellationUnlocked: boolean
  aiInsightsUnlocked: boolean
}

interface MilestonesState {
  milestones: Milestones
  newMilestoneMessage: string | null
}

var STORAGE_KEY = 'paradocs_milestones'

function getMilestonesFromStorage(): Milestones {
  if (typeof window === 'undefined') {
    return {
      firstSave: false,
      firstCaseFile: false,
      constellationUnlocked: false,
      aiInsightsUnlocked: false,
    }
  }

  var stored = window.localStorage.getItem(STORAGE_KEY)
  if (!stored) {
    return {
      firstSave: false,
      firstCaseFile: false,
      constellationUnlocked: false,
      aiInsightsUnlocked: false,
    }
  }

  try {
    return JSON.parse(stored)
  } catch (e) {
    return {
      firstSave: false,
      firstCaseFile: false,
      constellationUnlocked: false,
      aiInsightsUnlocked: false,
    }
  }
}

function saveMilestonesToStorage(milestones: Milestones) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(milestones))
}

export function useProgressMilestones() {
  var [state, setState] = useState<MilestonesState>({
    milestones: {
      firstSave: false,
      firstCaseFile: false,
      constellationUnlocked: false,
      aiInsightsUnlocked: false,
    },
    newMilestoneMessage: null,
  })
  var [isHydrated, setIsHydrated] = useState(false)

  useEffect(function() {
    var milestones = getMilestonesFromStorage()
    setState(function(prev) {
      return {
        ...prev,
        milestones: milestones,
      }
    })
    setIsHydrated(true)
  }, [])

  function checkAndUpdate(stats: {
    savedCount: number
    caseFileCount: number
    constellationEntries: number
    artifactCount: number
  }) {
    if (!isHydrated) return

    var current = state.milestones
    var updated = { ...current }
    var newMessage: string | null = null

    // Check first save
    if (!current.firstSave && stats.savedCount > 0) {
      updated.firstSave = true
      newMessage = 'Congrats! You saved your first report!'
    }

    // Check first case file
    if (!current.firstCaseFile && stats.caseFileCount > 0) {
      updated.firstCaseFile = true
      if (!newMessage) {
        newMessage = 'Great start! Your first investigation is underway.'
      }
    }

    // Check constellation unlock (5+ entries)
    if (!current.constellationUnlocked && stats.constellationEntries >= 5) {
      updated.constellationUnlocked = true
      if (!newMessage) {
        newMessage = 'Your constellation is coming to life!'
      }
    }

    // Check AI insights unlock (5+ artifacts)
    if (!current.aiInsightsUnlocked && stats.artifactCount >= 5) {
      updated.aiInsightsUnlocked = true
      if (!newMessage) {
        newMessage = 'You\'ve unlocked AI insights!'
      }
    }

    // Only update if something changed
    if (JSON.stringify(updated) !== JSON.stringify(current)) {
      saveMilestonesToStorage(updated)
      setState(function(prev) {
        return {
          milestones: updated,
          newMilestoneMessage: newMessage,
        }
      })
    }
  }

  function dismissMilestoneMessage() {
    setState(function(prev) {
      return {
        ...prev,
        newMilestoneMessage: null,
      }
    })
  }

  return {
    milestones: state.milestones,
    newMilestoneMessage: state.newMilestoneMessage,
    checkAndUpdate: checkAndUpdate,
    dismissMilestoneMessage: dismissMilestoneMessage,
    isHydrated: isHydrated,
  }
}
