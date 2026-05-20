/**
 * KeepExploring Component
 *
 * Replaces the old "Share Your Experience" / "Contribute Research" CTA
 * at the bottom of report detail pages. Shows 3 category-related report
 * cards to drive session depth, with a small submit link preserved.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, Calendar, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CATEGORY_CONFIG } from '@/lib/constants';
import { classNames } from '@/lib/utils';

interface RelatedReport {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  location_description: string | null;
  event_date: string | null;
}

interface Props {
  reportId: string;
  category: string;
  categoryLabel: string;
  className?: string;
}

/**
 * Map a category key to its Tailwind border-left color class.
 * Falls back to gray if the category is unknown.
 */
function getBorderColor(category: string): string {
  var colorMap: Record<string, string> = {
    ufos_aliens: 'border-l-green-400',
    cryptids: 'border-l-amber-400',
    ghosts_hauntings: 'border-l-purple-400',
    psychic_phenomena: 'border-l-blue-400',
    consciousness_practices: 'border-l-indigo-400',
    psychological_experiences: 'border-l-pink-400',
    high_strangeness: 'border-l-red-400',
    earth_mysteries: 'border-l-teal-400',
    time_anomalies: 'border-l-cyan-400',
    technology_ai: 'border-l-violet-400',
    folklore_mythology: 'border-l-orange-400',
    conspiracies: 'border-l-rose-400',
    other: 'border-l-gray-400'
  };
  return colorMap[category] || 'border-l-gray-400';
}

function getAccentColor(category: string): string {
  var config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG];
  return config ? config.color : 'text-gray-400';
}

function formatEventDate(dateStr: string): string {
  try {
    var d = new Date(dateStr);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  } catch (_e) {
    return dateStr;
  }
}

export default function KeepExploring({ reportId, category, categoryLabel, className }: Props) {
  var [reports, setReports] = useState<RelatedReport[]>([]);
  var [loading, setLoading] = useState(true);

  useEffect(function() {
    var cancelled = false;

    supabase
      .from('reports')
      .select('id, slug, title, summary, location_description, event_date')
      .eq('category', category)
      .eq('status', 'published')
      .neq('id', reportId)
      .order('view_count', { ascending: false })
      .limit(3)
      .then(function(result) {
        if (!cancelled) {
          if (result.data) {
            setReports(result.data as RelatedReport[]);
          }
          setLoading(false);
        }
      });

    return function() { cancelled = true; };
  }, [reportId, category]);

  if (loading) {
    return null;
  }

  if (reports.length < 2) {
    return null;
  }

  var borderColor = getBorderColor(category);
  var accentColor = getAccentColor(category);

  return (
    <div className={classNames('mt-12', className)}>
      {/* Section header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-white">
          {'Keep exploring '}
          <span className={accentColor}>{categoryLabel}</span>
        </h3>
        <Link
          href={'/explore?category=' + category}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
        >
          {'View all'}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Report cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {reports.map(function(report) {
          var hasLocation = report.location_description && report.location_description.length > 0;
          var hasDate = report.event_date && report.event_date.length > 0;

          return (
            <Link
              key={report.id}
              href={'/report/' + report.slug}
              className={classNames(
                'block bg-white/[0.03] border border-white/[0.06] rounded-xl',
                'border-l-4',
                borderColor,
                'p-4 transition-all duration-200 hover:bg-white/[0.06] hover:border-white/[0.1]'
              )}
            >
              <h4 className="text-sm font-medium text-white line-clamp-2 mb-2">
                {report.title}
              </h4>

              {(hasLocation || hasDate) && (
                <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                  {hasLocation && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      {report.location_description}
                    </span>
                  )}
                  {hasDate && (
                    <span className="flex items-center gap-1 flex-shrink-0">
                      <Calendar className="w-3 h-3" />
                      {formatEventDate(report.event_date as string)}
                    </span>
                  )}
                </div>
              )}

              {report.summary && (
                <p className="text-xs text-gray-400 line-clamp-2">
                  {report.summary}
                </p>
              )}
            </Link>
          );
        })}
      </div>

      {/* Small submit link */}
      <p className="mt-4 text-center text-xs text-gray-500">
        {'Have your own experience? '}
        <Link
          href="/start"
          className="text-gray-400 underline underline-offset-2 hover:text-white transition-colors"
        >
          {'Share a report'}
        </Link>
      </p>
    </div>
  );
}
