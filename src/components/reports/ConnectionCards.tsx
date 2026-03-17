/**
 * ConnectionCards ("Did You Know?") Component
 *
 * Displays AI-detected connections between reports.
 * Filters out same-case connections (those belong in Related Reports).
 * Prioritizes cross-category and genuinely surprising links.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, MapPin, Clock, Fingerprint, ChevronRight, Lightbulb } from 'lucide-react';
import { CATEGORY_CONFIG } from '@/lib/constants';

interface Connection {
  id: string;
  connected_report_id: string;
  connected_report_title: string;
  connected_report_slug: string;
  connected_report_category: string;
  connected_report_case_group: string | null;
  connection_type: string;
  connection_strength: number;
  ai_explanation: string;
  fun_fact: string | null;
}

interface Props {
  reportSlug: string;
  caseGroup?: string | null;
  className?: string;
}

var CONNECTION_ICONS: Record<string, React.ReactNode> = {
  geographic: <MapPin className="w-4 h-4" />,
  temporal: <Clock className="w-4 h-4" />,
  characteristic: <Fingerprint className="w-4 h-4" />,
  cross_phenomenon: <Sparkles className="w-4 h-4" />,
  witness_pattern: <Fingerprint className="w-4 h-4" />,
  evidence_similarity: <Sparkles className="w-4 h-4" />,
  default: <Lightbulb className="w-4 h-4" />
};

var CONNECTION_LABELS: Record<string, string> = {
  geographic: 'Same Region',
  temporal: 'Same Time Period',
  characteristic: 'Similar Details',
  cross_phenomenon: 'Cross-Phenomenon Link',
  witness_pattern: 'Witness Pattern',
  evidence_similarity: 'Similar Evidence'
};

var CONNECTION_COLORS: Record<string, string> = {
  geographic: 'from-blue-500/20 to-blue-600/5 border-blue-500/30',
  temporal: 'from-amber-500/20 to-amber-600/5 border-amber-500/30',
  characteristic: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/30',
  cross_phenomenon: 'from-purple-500/20 to-purple-600/5 border-purple-500/30',
  witness_pattern: 'from-rose-500/20 to-rose-600/5 border-rose-500/30',
  evidence_similarity: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/30'
};

var CONNECTION_TEXT_COLORS: Record<string, string> = {
  geographic: 'text-blue-400',
  temporal: 'text-amber-400',
  characteristic: 'text-emerald-400',
  cross_phenomenon: 'text-purple-400',
  witness_pattern: 'text-rose-400',
  evidence_similarity: 'text-cyan-400'
};

function getCategoryLabel(category: string): string {
  var config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG];
  return config ? config.label : category.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

export default function ConnectionCards({ reportSlug, caseGroup, className }: Props) {
  var [connections, setConnections] = useState<Connection[]>([]);
  var [loading, setLoading] = useState(true);
  var [expanded, setExpanded] = useState(false);

  useEffect(function() {
    var cancelled = false;
    fetch('/api/reports/' + reportSlug + '/connections')
      .then(function(res) {
        if (!res.ok) { throw new Error('Failed'); }
        return res.json();
      })
      .then(function(data) {
        if (!cancelled) {
          setConnections(data.connections || []);
        }
      })
      .catch(function() {
        if (!cancelled) {
          setConnections([]);
        }
      })
      .finally(function() {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return function() { cancelled = true; };
  }, [reportSlug]);

  if (loading) {
    return (
      <div className={className || ''}>
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-semibold text-white">Did You Know?</h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="h-32 bg-white/5 rounded-xl animate-pulse" />
          <div className="h-32 bg-white/5 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  // Filter out same-case connections — those belong in the Related Reports sidebar
  var filtered = connections.filter(function(conn) {
    if (caseGroup && conn.connected_report_case_group === caseGroup) return false;
    return true;
  });

  // Sort: cross-phenomenon first (most surprising), then by strength
  filtered.sort(function(a, b) {
    var typeOrder: Record<string, number> = {
      cross_phenomenon: 0,
      evidence_similarity: 1,
      characteristic: 2,
      geographic: 3,
      temporal: 4,
      witness_pattern: 5
    };
    var aOrder = typeOrder[a.connection_type] !== undefined ? typeOrder[a.connection_type] : 6;
    var bOrder = typeOrder[b.connection_type] !== undefined ? typeOrder[b.connection_type] : 6;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.connection_strength - a.connection_strength;
  });

  // Don't render if no non-case connections
  if (filtered.length === 0) {
    return null;
  }

  var visible = expanded ? filtered : filtered.slice(0, 4);

  return (
    <div className={className || ''}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-semibold text-white">Did You Know?</h3>
          <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
            {filtered.length + ' connection' + (filtered.length !== 1 ? 's' : '')}
          </span>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {visible.map(function(conn) {
          var bgClass = CONNECTION_COLORS[conn.connection_type] || 'from-gray-500/20 to-gray-600/5 border-gray-500/30';
          var textColor = CONNECTION_TEXT_COLORS[conn.connection_type] || 'text-gray-400';
          var icon = CONNECTION_ICONS[conn.connection_type] || CONNECTION_ICONS.default;
          var label = CONNECTION_LABELS[conn.connection_type] || 'Related';

          return (
            <Link
              key={conn.id}
              href={'/report/' + conn.connected_report_slug}
              className={'block rounded-xl border bg-gradient-to-br p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg ' + bgClass}
            >
              <div className="flex items-start justify-between mb-2">
                <span className={'flex items-center gap-1.5 text-xs font-medium ' + textColor}>
                  {icon}
                  {label}
                </span>
              </div>

              <p className="text-sm text-gray-200 font-medium mb-1 line-clamp-2">
                {conn.connected_report_title}
              </p>

              <p className="text-xs text-gray-400 line-clamp-2 mb-2">
                {conn.ai_explanation}
              </p>

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {getCategoryLabel(conn.connected_report_category)}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              </div>
            </Link>
          );
        })}
      </div>

      {filtered.length > 4 && !expanded && (
        <button
          onClick={function(e) { e.preventDefault(); setExpanded(true); }}
          className="mt-3 text-sm text-primary-400 hover:text-primary-300 transition-colors"
        >
          {'Show ' + (filtered.length - 4) + ' more connections'}
        </button>
      )}
    </div>
  );
}
