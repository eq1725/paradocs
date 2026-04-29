/**
 * Constellation V2 — barrel exports
 *
 * ConstellationReveal: The radial visualization + reveal sequence
 * ExperienceOnboarding: Sensory-first submission flow
 */

export { default as ConstellationReveal } from './ConstellationReveal'
export type {
  MatchedReport,
  MatchDimension,
  UserExperience,
  ConstellationRevealProps,
} from './ConstellationReveal'

export { default as ExperienceOnboarding } from './ExperienceOnboarding'
export {
  hasCompletedExperienceOnboarding,
  markExperienceOnboardingComplete,
} from './ExperienceOnboarding'
export type { ExperienceData } from './ExperienceOnboarding'

export { default as PaywallModal } from './PaywallModal'
