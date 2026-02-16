/**
 * API: GET /api/reports/[slug]/connections
 * Returns AI-detected connections for a specific report.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var slug = req.query.slug;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Report slug is required' });
  }

  var limitParam = req.query.limit;
  var maxResults = Math.min(Math.max(parseInt(limitParam as string) || 10, 1), 20);

  try {
    var supabase = createServerClient();

    // Get the source report ID and phenomenon_type_id
    var reportResult = await supabase
      .from('reports')
      .select('id, category, phenomenon_type_id')
      .eq('slug', slug)
      .single();

    if (reportResult.error || !reportResult.data) {
      return res.status(404).json({ error: 'Report not found' });
    }

    var reportId = reportResult.data.id;
    var reportCategory = reportResult.data.category;
    var reportPhenomenonTypeId = reportResult.data.phenomenon_type_id;

    // Fetch connections where this report is either source or target
    var connectionsResult = await (supabase.from('report_connections') as any)
      .select('id, source_report_id, target_report_id, connection_type, connection_strength, ai_explanation, fun_fact, created_at')
      .or('source_report_id.eq.' + reportId + ',target_report_id.eq.' + reportId)
      .order('connection_strength', { ascending: false })
      .limit(maxResults);

    if (connectionsResult.error) {
      if (connectionsResult.error.code === '42P01') {
        return res.status(200).json({ connections: [], total: 0 });
      }
      console.error('Error fetching connections:', connectionsResult.error);
      return res.status(500).json({ error: 'Failed to fetch connections' });
    }

    var rawConnections = connectionsResult.data || [];

    // If no explicit connections, fall back to finding related reports
    if (rawConnections.length === 0) {
      // Build OR filter for same category or same phenomenon type
      var orFilters = [];
      if (reportCategory) {
        orFilters.push('category.eq.' + reportCategory);
      }
      if (reportPhenomenonTypeId) {
        orFilters.push('phenomenon_type_id.eq.' + reportPhenomenonTypeId);
      }

      if (orFilters.length === 0) {
        return res.status(200).json({ connections: [], total: 0 });
      }

      var relatedResult = await supabase
        .from('reports')
        .select('id, title, slug, category, phenomenon_type_id')
        .neq('id', reportId)
        .eq('status', 'approved')
        .or(orFilters.join(','))
        .order('created_at', { ascending: false })
        .limit(maxResults);

      if (relatedResult.error) {
        console.error('Error fetching related reports:', relatedResult.error);
        return res.status(500).json({ error: 'Failed to fetch related reports' });
      }

      var relatedReports = relatedResult.data || [];

      // Map related reports to connection shape
      var connections = relatedReports
        .map(function(r: any) {
          var matchesCategory = r.category === reportCategory;
          var matchesPhenomenon = reportPhenomenonTypeId && r.phenomenon_type_id === reportPhenomenonTypeId;

          var connectionType = matchesPhenomenon && !matchesCategory ? 'Related Phenomenon' : 'Same Category';
          var connectionStrength = connectionType === 'Related Phenomenon' ? 0.85 : 0.7;
          var aiExplanation = connectionType === 'Related Phenomenon'
            ? 'These reports share a connection to the same phenomenon type'
            : 'Both reports involve ' + reportCategory + ' phenomena';
          var funFact = 'Reports in the same category often share underlying patterns that researchers find compelling.';

          return {
            id: 'fallback_' + r.id,
            connected_report_id: r.id,
            connected_report_title: r.title,
            connected_report_slug: r.slug,
            connected_report_category: r.category || 'Unknown',
            connection_type: connectionType,
            connection_strength: connectionStrength,
            ai_explanation: aiExplanation,
            fun_fact: funFact
          };
        });

      return res.status(200).json({ connections: connections, total: connections.length });
    }

    // Get connected report IDs
    var connectedIds = rawConnections.map(function(c: any) {
      return c.source_report_id === reportId ? c.target_report_id : c.source_report_id;
    });

    var reportsResult = await supabase
      .from('reports')
      .select('id, title, slug, category')
      .in('id', connectedIds);

    if (reportsResult.error) {
      return res.status(500).json({ error: 'Failed to fetch report details' });
    }

    var reportsMap: Record<string, any> = {};
    (reportsResult.data || []).forEach(function(r: any) {
      reportsMap[r.id] = r;
    });

    var connections = rawConnections
      .map(function(conn: any) {
        var connectedId = conn.source_report_id === reportId ? conn.target_report_id : conn.source_report_id;
        var connectedReport = reportsMap[connectedId];
        if (!connectedReport) return null;
        return {
          id: conn.id,
          connected_report_id: connectedId,
          connected_report_title: connectedReport.title,
          connected_report_slug: connectedReport.slug,
          connected_report_category: connectedReport.category || 'Unknown',
          connection_type: conn.connection_type,
          connection_strength: conn.connection_strength,
          ai_explanation: conn.ai_explanation,
          fun_fact: conn.fun_fact
        };
      })
      .filter(function(c: any) { return c !== null; });

    return res.status(200).json({ connections: connections, total: connections.length });
  } catch (error) {
    console.error('Connections API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
