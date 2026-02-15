/**
 * API: GET /api/reports/[slug]/connections
 *
 * Returns AI-detected connections for a specific report.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
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

    // Get the source report ID
    var reportResult = await supabase
      .from('reports')
      .select('id, category')
      .eq('slug', slug)
      .single();

    if (reportResult.error || !reportResult.data) {
      return res.status(404).json({ error: 'Report not found' });
    }

    var reportId = reportResult.data.id;

    // Fetch connections where this report is either source or target
    var connectionsResult = await (supabase
      .from('report_connections') as any)
      .select('id, source_report_id, target_report_id, connection_type, connection_strength, ai_explanation, fun_fact, created_at')
      .or('source_report_id.eq.' + reportId + ',target_report_id.eq.' + reportId)
      .order('connection_strength', { ascending: false })
      .limit(maxResults);

    if (connectionsResult.error) {
      // Table might not exist yet - return empty gracefully
      if (connectionsResult.error.code === '42P01') {
        return res.status(200).json({ connections: [], total: 0 });
      }
      console.error('Error fetching connections:', connectionsResult.error);
      return res.status(500).json({ error: 'Failed to fetch connections' });
    }

    var rawConnections = connectionsResult.data || [];

    if (rawConnections.length === 0) {
      return res.status(200).json({ connections: [], total: 0 });
    }

    // Get the connected report IDs (the other report in each pair)
    var connectedIds = rawConnections.map(function(c: any) {
      return c.source_report_id === reportId ? c.target_report_id : c.source_report_id;
    });

    // Fetch connected report details
    var reportsResult = await supabase
      .from('reports')
      .select('id, title, slug, category')
      .in('id', connectedIds);

    if (reportsResult.error) {
      console.error('Error fetching connected reports:', reportsResult.error);
      return res.status(500).json({ error: 'Failed to fetch report details' });
    }

    var reportsMap: Record<string, any> = {};
    (reportsResult.data || []).forEach(function(r: any) {
      reportsMap[r.id] = r;
    });

    // Build response
    var connections = rawConnections
      .map(function(conn: any) {
        var connectedId = conn.source_report_id === reportId ? conn.target_report_id : conn.source_report_id;
        var connectedReport = reportsMap[connectedId];
        if (!connectedReport) { return null; }

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

    return res.status(200).json({
      connections: connections,
      total: connections.length
    });
  } catch (error) {
    console.error('Connections API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}