/**
 * UsageWarningBanner
 *
 * Shows a dismissable banner when the user is approaching or has hit
 * their free-tier usage limits. Appears at top of dashboard/explore pages.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface UsageData {
  reports_submitted: number;
  reports_saved: number;
  api_calls_made: number;
  ai_insights_viewed: number;
}

interface LimitsData {
  reports_per_month: number;
  saved_reports_max: number;
  api_calls_per_month: number;
}

interface UsageWarningBannerProps {
  usage: UsageData | null;
  limits: LimitsData | null;
  tierName: string;
}

export default function UsageWarningBanner(props: UsageWarningBannerProps) {
  var usage = props.usage;
  var limits = props.limits;
  var tierName = props.tierName;
  var dismissed = useState(false);
  var isDismissed = dismissed[0];
  var setDismissed = dismissed[1];

  if (!usage || !limits || isDismissed) return null;

  // Calculate usage percentages
  var warnings: Array<{ label: string; used: number; max: number; pct: number }> = [];

  if (limits.reports_per_month > 0) {
    var rPct = Math.round((usage.reports_submitted / limits.reports_per_month) * 100);
    if (rPct >= 70) {
      warnings.push({
        label: 'Report submissions',
        used: usage.reports_submitted,
        max: limits.reports_per_month,
        pct: rPct
      });
    }
  }

  if (limits.saved_reports_max > 0) {
    var sPct = Math.round((usage.reports_saved / limits.saved_reports_max) * 100);
    if (sPct >= 70) {
      warnings.push({
        label: 'Saved reports',
        used: usage.reports_saved,
        max: limits.saved_reports_max,
        pct: sPct
      });
    }
  }

  if (limits.api_calls_per_month > 0) {
    var aPct = Math.round((usage.api_calls_made / limits.api_calls_per_month) * 100);
    if (aPct >= 70) {
      warnings.push({
        label: 'AI queries',
        used: usage.api_calls_made,
        max: limits.api_calls_per_month,
        pct: aPct
      });
    }
  }

  if (warnings.length === 0) return null;

  var hasHitLimit = warnings.some(function(w) { return w.pct >= 100; });
  var bgColor = hasHitLimit ? 'bg-red-900/50 border-red-700' : 'bg-amber-900/30 border-amber-700/50';
  var iconColor = hasHitLimit ? 'text-red-400' : 'text-amber-400';
  var title = hasHitLimit
    ? 'You\u2019ve hit your ' + tierName + ' plan limit'
    : 'You\u2019re approaching your ' + tierName + ' plan limits';

  return (
    <div className={'relative rounded-lg border px-4 py-3 mb-4 ' + bgColor}>
      <button
        onClick={function() { setDismissed(true); }}
        className="absolute top-2 right-2 text-gray-500 hover:text-gray-300 transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="flex items-start gap-3">
        <span className={'text-xl mt-0.5 ' + iconColor}>
          {hasHitLimit ? '\u26A0\uFE0F' : '\u26A1'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-100 mb-1">{title}</p>
          <div className="space-y-2">
            {warnings.map(function(w, i) {
              var barColor = w.pct >= 100 ? 'bg-red-500' : w.pct >= 90 ? 'bg-amber-500' : 'bg-amber-400';
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>{w.label}</span>
                    <span>{w.used} / {w.max}</span>
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={'h-full rounded-full transition-all ' + barColor}
                      style={{ width: Math.min(w.pct, 100) + '%' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Link
              href="/dashboard/settings#subscription"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors"
            >
              Upgrade your plan
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            {!hasHitLimit && (
              <span className="text-xs text-gray-500">
                Resets on the 1st of each month
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
