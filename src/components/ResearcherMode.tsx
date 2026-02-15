/**
 * ResearcherMode
 *
 * Settings panel + feature gate for "Researcher Mode" — a collection of
 * advanced power-user tools gated behind Pro/Enterprise tiers:
 *   - Advanced pattern detection across reports
 *   - AI research assistant (unlimited)
 *   - Bulk export & data downloads
 *   - Investigation journal with AI summaries
 *   - Custom alert rules
 *
 * When toggled ON by a qualifying user, these features become available
 * throughout the app. Free/Basic users see an upgrade prompt instead.
 */

import { useState } from 'react';

interface ResearcherModeProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  tier: string;
  onUpgrade: () => void;
}

var RESEARCHER_FEATURES = [
  {
    id: 'pattern_detection',
    name: 'Advanced Pattern Detection',
    description: 'Cross-reference reports by location, date, and phenomena type to discover hidden connections.',
    icon: '\uD83D\uDD0D',
    minTier: 'pro'
  },
  {
    id: 'ai_unlimited',
    name: 'Unlimited AI Assistant',
    description: 'Ask unlimited questions to our AI research assistant with full context awareness.',
    icon: '\uD83E\uDD16',
    minTier: 'pro'
  },
  {
    id: 'bulk_export',
    name: 'Bulk Export & Downloads',
    description: 'Export report data, analysis results, and collections as CSV, JSON, or PDF.',
    icon: '\uD83D\uDCE5',
    minTier: 'pro'
  },
  {
    id: 'journal_ai',
    name: 'Investigation Journal + AI Summaries',
    description: 'Keep detailed investigation notes with automatic AI-generated summaries and insights.',
    icon: '\uD83D\uDCD3',
    minTier: 'pro'
  },
  {
    id: 'custom_alerts',
    name: 'Custom Alert Rules',
    description: 'Create personalized alert rules for specific phenomena, locations, or credibility thresholds.',
    icon: '\uD83D\uDD14',
    minTier: 'pro'
  },
  {
    id: 'heatmap',
    name: 'Sighting Heatmaps',
    description: 'Visualize report density and patterns on interactive geographic heatmaps.',
    icon: '\uD83D\uDDFA\uFE0F',
    minTier: 'enterprise'
  },
  {
    id: 'api_access',
    name: 'API Access',
    description: 'Programmatic access to ParaDocs data for your own research tools and integrations.',
    icon: '\u2699\uFE0F',
    minTier: 'enterprise'
  }
];

var TIER_ORDER: Record<string, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  enterprise: 3
};

function hasTierAccess(userTier: string, requiredTier: string) {
  var userLevel = TIER_ORDER[userTier] || 0;
  var requiredLevel = TIER_ORDER[requiredTier] || 0;
  return userLevel >= requiredLevel;
}

export default function ResearcherMode(props: ResearcherModeProps) {
  var isEnabled = props.isEnabled;
  var onToggle = props.onToggle;
  var tier = props.tier;
  var onUpgrade = props.onUpgrade;

  var expandedState = useState('');
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];

  var canUseResearcherMode = hasTierAccess(tier, 'pro');

  // If user doesn't have access, show upgrade prompt
  if (!canUseResearcherMode) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-purple-900/30 border border-purple-700/50 flex items-center justify-center">
            <span className="text-xl">{'\uD83D\uDD2C'}</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Researcher Mode</h3>
            <p className="text-sm text-gray-400">Advanced tools for serious investigators</p>
          </div>
        </div>

        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50 mb-4">
          <p className="text-sm text-gray-300 mb-3">
            Unlock powerful research tools designed for dedicated paranormal investigators:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {RESEARCHER_FEATURES.map(function(feat) {
              return (
                <div key={feat.id} className="flex items-center gap-2 text-sm text-gray-400">
                  <span>{feat.icon}</span>
                  <span>{feat.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={onUpgrade}
          className="w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 text-white font-semibold text-sm hover:from-purple-700 hover:to-violet-700 transition-all"
        >
          Upgrade to Pro to Unlock
        </button>
        <p className="text-center text-xs text-gray-500 mt-2">
          Starting at $9.99/month
        </p>
      </div>
    );
  }

  // User has access — show toggle + feature list
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-900/30 border border-purple-700/50 flex items-center justify-center">
            <span className="text-xl">{'\uD83D\uDD2C'}</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Researcher Mode</h3>
            <p className="text-sm text-gray-400">
              {isEnabled ? 'Active' : 'Inactive'} {'\u2014'} {tier.charAt(0).toUpperCase() + tier.slice(1)} plan
            </p>
          </div>
        </div>

        {/* Toggle switch */}
        <button
          onClick={function() { onToggle(!isEnabled); }}
          className={
            'relative w-12 h-6 rounded-full transition-colors ' +
            (isEnabled ? 'bg-purple-600' : 'bg-gray-600')
          }
        >
          <span
            className={
              'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ' +
              (isEnabled ? 'translate-x-6' : 'translate-x-0.5')
            }
          />
        </button>
      </div>

      {isEnabled && (
        <div className="space-y-2">
          {RESEARCHER_FEATURES.map(function(feat) {
            var hasAccess = hasTierAccess(tier, feat.minTier);
            var isExpanded = expanded === feat.id;

            return (
              <button
                key={feat.id}
                onClick={function() { setExpanded(isExpanded ? '' : feat.id); }}
                className={
                  'w-full text-left p-3 rounded-lg border transition-all ' +
                  (hasAccess
                    ? 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600'
                    : 'bg-gray-800/20 border-gray-700/30 opacity-60')
                }
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{feat.icon}</span>
                    <span className={'text-sm font-medium ' + (hasAccess ? 'text-gray-200' : 'text-gray-500')}>
                      {feat.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!hasAccess && (
                      <span className="text-xs px-2 py-0.5 bg-amber-900/30 text-amber-400 rounded-full border border-amber-700/50">
                        {feat.minTier}
                      </span>
                    )}
                    <svg
                      className={'w-4 h-4 text-gray-500 transition-transform ' + (isExpanded ? 'rotate-180' : '')}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {isExpanded && (
                  <p className="text-xs text-gray-400 mt-2 pl-7">{feat.description}</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!isEnabled && (
        <p className="text-sm text-gray-500 text-center py-4">
          Enable Researcher Mode to access advanced investigation tools.
        </p>
      )}
    </div>
  );
}

/**
 * ResearcherGate
 *
 * Inline wrapper component that checks if a feature is accessible.
 * Wraps any gated UI — shows the children if allowed, or a lock overlay if not.
 */
export function ResearcherGate(props: {
  featureId: string;
  tier: string;
  researcherEnabled: boolean;
  onUpgrade: () => void;
  children: React.ReactNode;
}) {
  var featureId = props.featureId;
  var tier = props.tier;
  var researcherEnabled = props.researcherEnabled;
  var onUpgrade = props.onUpgrade;
  var children = props.children;

  var feature = RESEARCHER_FEATURES.find(function(f) { return f.id === featureId; });
  if (!feature) return <>{children}</>;

  var hasAccess = hasTierAccess(tier, feature.minTier) && researcherEnabled;

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="filter blur-sm pointer-events-none select-none opacity-50">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60 rounded-lg backdrop-blur-[2px]">
        <div className="text-center p-4">
          <span className="text-2xl mb-2 block">{'\uD83D\uDD12'}</span>
          <p className="text-sm font-medium text-gray-200 mb-1">{feature.name}</p>
          <p className="text-xs text-gray-400 mb-3">
            {!hasTierAccess(tier, feature.minTier)
              ? 'Requires ' + feature.minTier.charAt(0).toUpperCase() + feature.minTier.slice(1) + ' plan'
              : 'Enable Researcher Mode in Settings'}
          </p>
          {!hasTierAccess(tier, feature.minTier) && (
            <button
              onClick={onUpgrade}
              className="px-4 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 transition-colors"
            >
              Upgrade
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
