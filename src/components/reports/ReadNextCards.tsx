/**
 * ReadNextCards — "Continue Reading" inline section
 *
 * Shows 2 related report cards from the same category between the
 * main content and the engagement bar. Primary session-depth driver.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CATEGORY_CONFIG } from '@/lib/constants';
import { classNames } from '@/lib/utils';

interface RelatedReport {
  id: string;
  slug: string;
  title: string;
  category: string;
  location: string | null;
  summary: string | null;
  view_count: number;
}

interface Props {
  reportId: string;
  category: string;
  className?: string;
}

function pickRandom(items: RelatedReport[], count: number): RelatedReport[] {
  if (items.length <= count) return items;
  var shuffled = items.slice();
  // Fisher-Yates for the first `count` slots
  for (var i = 0; i < count; i++) {
    var j = i + Math.floor(Math.random() * (shuffled.length - i));
    var tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }
  return shuffled.slice(0, count);
}

function getCategoryDot(category: string): string {
  var config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG];
  if (!config) return 'bg-gray-400';
  // Extract the color name from the text color class, e.g. "text-green-400" -> "bg-green-400"
  return config.color.replace('text-', 'bg-');
}

function getCategoryLabel(category: string): string {
  var config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG];
  return config
    ? config.label
    : category.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

async function fetchRelated(reportId: string, category: string): Promise<RelatedReport[]> {
  var { data, error } = await supabase
    .from('reports')
    .select('id, slug, title, category, location, summary, view_count')
    .eq('category', category)
    .eq('status', 'approved')
    .neq('id', reportId)
    .order('view_count', { ascending: false })
    .limit(3);

  if (error || !data) return [];
  return data as RelatedReport[];
}

/**
 * Returns the single best related report for a given report/category.
 * Used by StickyMobileBar for the "Read Next" CTA.
 */
export async function getTopRelatedReport(
  reportId: string,
  category: string
): Promise<{ slug: string; title: string } | null> {
  var results = await fetchRelated(reportId, category);
  if (results.length === 0) return null;
  return { slug: results[0].slug, title: results[0].title };
}

export default function ReadNextCards({ reportId, category, className }: Props) {
  var [cards, setCards] = useState<RelatedReport[]>([]);
  var [loading, setLoading] = useState(true);

  useEffect(function() {
    var cancelled = false;

    fetchRelated(reportId, category)
      .then(function(results) {
        if (!cancelled) {
          setCards(pickRandom(results, 2));
        }
      })
      .catch(function() {
        if (!cancelled) {
          setCards([]);
        }
      })
      .finally(function() {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return function() { cancelled = true; };
  }, [reportId, category]);

  if (loading) {
    return (
      <div className={classNames('py-6', className)}>
        <div className="flex items-center gap-1.5 mb-4">
          <h3 className="text-base font-semibold text-white">Continue Reading</h3>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="h-36 bg-white/5 rounded-xl animate-pulse" />
          <div className="h-36 bg-white/5 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (cards.length === 0) return null;

  return (
    <div className={classNames('py-6', className)}>
      <div className="flex items-center gap-1.5 mb-4">
        <h3 className="text-base font-semibold text-white">Continue Reading</h3>
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map(function(report) {
          var dotClass = getCategoryDot(report.category);
          var label = getCategoryLabel(report.category);

          return (
            <Link
              key={report.id}
              href={'/report/' + report.slug}
              className="block rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 transition-all duration-200 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02]"
            >
              {/* Category badge */}
              <div className="flex items-center gap-1.5 mb-2">
                <span className={classNames('w-2 h-2 rounded-full shrink-0', dotClass)} />
                <span className="text-xs text-gray-400 font-medium">{label}</span>
              </div>

              {/* Title — 2 line clamp */}
              <p className="text-sm text-gray-100 font-medium line-clamp-2 mb-1.5">
                {report.title}
              </p>

              {/* Location if present */}
              {report.location && (
                <div className="flex items-center gap-1 mb-1.5">
                  <MapPin className="w-3 h-3 text-gray-500 shrink-0" />
                  <span className="text-xs text-gray-500 truncate">{report.location}</span>
                </div>
              )}

              {/* Summary — 1 line clamp */}
              {report.summary && (
                <p className="text-xs text-gray-400 line-clamp-1">
                  {report.summary}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
