/**
 * A/B Testing Framework
 *
 * Lightweight client-side A/B testing system for ParaDocs.
 * - Assigns users to experiment variants via cookie-based bucketing
 * - Tracks impressions and conversions
 * - Supports multiple concurrent experiments
 * - Server-side API for creating experiments and viewing results
 *
 * Usage:
 *   import { useExperiment } from '@/lib/ab-testing';
 *   var variant = useExperiment('landing-hero-cta');
 *   // variant is 'control' | 'variant_a' | 'variant_b' etc.
 */

// Cookie-based variant assignment (deterministic by user fingerprint)
function hashString(str: string): number {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    var char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

function getUserId(): string {
  if (typeof window === 'undefined') return 'server';
  var stored = '';
  try {
    stored = document.cookie.split('; ').find(function(c) { return c.startsWith('pdx_uid='); }) || '';
    stored = stored.split('=')[1] || '';
  } catch(e) {}
  if (stored) return stored;
  var uid = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  try {
    document.cookie = 'pdx_uid=' + uid + '; path=/; max-age=31536000; SameSite=Lax';
  } catch(e) {}
  return uid;
}

export interface Experiment {
  id: string;
  name: string;
  variants: string[];
  weights?: number[];
  active: boolean;
}

// Default experiments for launch
export var EXPERIMENTS: Experiment[] = [
  {
    id: 'landing-hero-cta',
    name: 'Landing Page Hero CTA',
    variants: ['control', 'variant_a', 'variant_b'],
    weights: [34, 33, 33],
    active: true
  },
  {
    id: 'paywall-copy',
    name: 'Paywall Upgrade Copy',
    variants: ['control', 'urgency', 'social_proof'],
    weights: [34, 33, 33],
    active: true
  },
  {
    id: 'onboarding-steps',
    name: 'Onboarding Step Count',
    variants: ['three_steps', 'two_steps'],
    weights: [50, 50],
    active: true
  },
  {
    id: 'signup-cta-color',
    name: 'Signup Button Color',
    variants: ['purple', 'green', 'blue'],
    weights: [34, 33, 33],
    active: false
  }
];

/**
 * Assign a user to a variant for a given experiment.
 * Uses deterministic hashing so the same user always gets the same variant.
 */
export function getVariant(experimentId: string, userId?: string): string {
  var experiment = EXPERIMENTS.find(function(e) { return e.id === experimentId; });
  if (!experiment || !experiment.active) return 'control';

  var uid = userId || getUserId();
  var hash = hashString(uid + ':' + experimentId);
  var weights = experiment.weights || experiment.variants.map(function() { return Math.floor(100 / experiment!.variants.length); });
  var totalWeight = weights.reduce(function(a, b) { return a + b; }, 0);
  var bucket = hash % totalWeight;
  var cumulative = 0;

  for (var i = 0; i < experiment.variants.length; i++) {
    cumulative += weights[i];
    if (bucket < cumulative) {
      return experiment.variants[i];
    }
  }
  return experiment.variants[0];
}

/**
 * Track an impression for an experiment variant.
 * Sends to the analytics API endpoint.
 */
export function trackImpression(experimentId: string, variant: string) {
  if (typeof window === 'undefined') return;
  try {
    var beacon = navigator.sendBeacon || function() {};
    beacon.call(navigator, '/api/ab/track', JSON.stringify({
      experiment_id: experimentId,
      variant: variant,
      event: 'impression',
      timestamp: new Date().toISOString(),
      user_id: getUserId()
    }));
  } catch(e) {}
}

/**
 * Track a conversion for an experiment variant.
 */
export function trackConversion(experimentId: string, variant: string, metadata?: Record<string, any>) {
  if (typeof window === 'undefined') return;
  try {
    fetch('/api/ab/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        experiment_id: experimentId,
        variant: variant,
        event: 'conversion',
        timestamp: new Date().toISOString(),
        user_id: getUserId(),
        metadata: metadata || {}
      })
    });
  } catch(e) {}
}

/**
 * React hook for A/B testing.
 * Returns the variant string and auto-tracks impressions.
 */
export function useExperiment(experimentId: string): string {
  if (typeof window === 'undefined') return 'control';
  var variant = getVariant(experimentId);
  // Track impression on first render (uses a simple dedup flag)
  var key = 'pdx_ab_' + experimentId;
  try {
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, variant);
      trackImpression(experimentId, variant);
    }
  } catch(e) {
    trackImpression(experimentId, variant);
  }
  return variant;
}
