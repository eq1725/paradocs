/**
 * Batch Process API - Generate AI content + Link reports
 *
 * Comprehensive endpoint to:
 * 1. Generate AI content for phenomena without it
 * 2. Link all reports to phenomena
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { generatePhenomenonContent, generateQuickFacts } from '@/lib/services/phenomena.service';

var ADMIN_EMAIL = 'williamschaseh@gmail.com';

// Supabase admin client
function getSupabaseAdmin() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Helper to get user from cookies/headers
function getAuthenticatedUser(req) {
  return new Promise(function(resolve) {
    var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Check for admin key auth (service role key in x-admin-key header)
    var adminKey = req.headers['x-admin-key'] || (req.body && req.body.adminKey);
    if (adminKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      resolve({ id: 'admin', email: ADMIN_EMAIL });
      return;
    }

    var authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      var token = authHeader.substring(7);
      var supabase = createClient(supabaseUrl, supabaseAnonKey);
      supabase.auth.getUser(token).then(function(result) {
        if (!result.error && result.data.user) {
          resolve({ id: result.data.user.id, email: result.data.user.email || '' });
        } else {
          checkCookies();
        }
      }).catch(function() { checkCookies(); });
      return;
    }

    checkCookies();

    function checkCookies() {
      var cookies = req.headers.cookie || '';
      var accessTokenMatch = cookies.match(/sb-[^-]+-auth-token=([^;]+)/);
      if (accessTokenMatch) {
        try {
          var tokenData = JSON.parse(decodeURIComponent(accessTokenMatch[1]));
          if (tokenData && tokenData.access_token) {
            var supabaseWithToken = createClient(supabaseUrl, supabaseAnonKey, {
              global: { headers: { Authorization: 'Bearer ' + tokenData.access_token } },
            });
            supabaseWithToken.auth.getUser().then(function(result) {
              if (result.data.user) {
                resolve({ id: result.data.user.id, email: result.data.user.email || '' });
              } else {
                resolve(null);
              }
            }).catch(function() { resolve(null); });
            return;
          }
        } catch (e) { /* ignore */ }
      }
      resolve(null);
    }
  });
}

// Escape regex special characters
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var supabase = getSupabaseAdmin();
  var action = req.body.action;
  var batchSize = req.body.batchSize || 10;
  var offset = req.body.offset || 0;

  try {
    if (action === 'generate_content') {
      // Get phenomena without AI content
      var phenomenaResult = await supabase
        .from('phenomena')
        .select('id, name')
        .eq('status', 'active')
        .is('ai_description', null)
        .order('report_count', { ascending: false })
        .range(offset, offset + batchSize - 1);

      var phenomena = phenomenaResult.data;

      if (!phenomena || phenomena.length === 0) {
        return res.status(200).json({
          success: true,
          done: true,
          message: 'All phenomena have content',
          results: { processed: 0, success: 0, failed: 0 }
        });
      }

      var success = 0;
      var failed = 0;
      var details = [];

      for (var i = 0; i < phenomena.length; i++) {
        var p = phenomena[i];
        try {
          var result = await generatePhenomenonContent(p.id);
          if (result) {
            success++;
            details.push({ name: p.name, status: 'success' });
          } else {
            failed++;
            details.push({ name: p.name, status: 'failed' });
          }
          // Rate limit
          await new Promise(function(resolve) { setTimeout(resolve, 2000); });
        } catch (error) {
          failed++;
          details.push({ name: p.name, status: 'error' });
        }
      }

      // Check if more to process
      var countResult = await supabase
        .from('phenomena')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .is('ai_description', null);

      return res.status(200).json({
        success: true,
        done: (countResult.count || 0) === 0,
        nextOffset: offset + batchSize,
        remaining: countResult.count || 0,
        results: { processed: phenomena.length, success: success, failed: failed, details: details }
      });
    }

    if (action === 'link_reports') {
      // Get phenomena patterns
      var phenomenaResult2 = await supabase
        .from('phenomena')
        .select('id, name, aliases, category')
        .eq('status', 'active');

      var phenomenaPatterns = (phenomenaResult2.data || []).map(function(p) {
        return {
          id: p.id,
          name: p.name,
          category: p.category,
          patterns: [p.name.toLowerCase()].concat((p.aliases || []).map(function(a) { return a.toLowerCase(); }))
        };
      });

      // Get reports batch
      var reportsResult = await supabase
        .from('reports')
        .select('id, title, summary, description, category')
        .eq('status', 'approved')
        .order('created_at', { ascending: true })
        .range(offset, offset + batchSize - 1);

      var reports = reportsResult.data;

      if (!reports || reports.length === 0) {
        return res.status(200).json({
          success: true,
          done: true,
          message: 'All reports processed',
          results: { processed: 0, linked: 0, matches: 0 }
        });
      }

      var totalMatches = 0;
      var totalLinked = 0;

      for (var j = 0; j < reports.length; j++) {
        var report = reports[j];
        var searchText = [report.title || '', report.summary || '', report.description || ''].join(' ').toLowerCase();

        for (var k = 0; k < phenomenaPatterns.length; k++) {
          var phenomenon = phenomenaPatterns[k];
          var matched = false;
          for (var m = 0; m < phenomenon.patterns.length; m++) {
            var pattern = phenomenon.patterns[m];
            var regex = new RegExp('\\b' + escapeRegex(pattern) + '\\b', 'i');
            if (regex.test(searchText)) {
              var confidence = 0.6;
              if (regex.test((report.title || '').toLowerCase())) {
                confidence = 0.85;
              } else if (regex.test((report.summary || '').toLowerCase())) {
                confidence = 0.75;
              }

              totalMatches++;
              var upsertResult = await supabase
                .from('report_phenomena')
                .upsert({
                  report_id: report.id,
                  phenomenon_id: phenomenon.id,
                  confidence: confidence,
                  tagged_by: 'auto',
                }, {
                  onConflict: 'report_id,phenomenon_id',
                  ignoreDuplicates: true
                });

              if (!upsertResult.error) totalLinked++;
              matched = true;
              break;
            }
          }
          if (matched) break;
        }
      }

      // Check total
      var totalResult = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved');

      var done = offset + batchSize >= (totalResult.count || 0);

      return res.status(200).json({
        success: true,
        done: done,
        nextOffset: offset + batchSize,
        totalReports: totalResult.count,
        results: { processed: reports.length, matches: totalMatches, linked: totalLinked }
      });
    }

    if (action === 'generate_quick_facts') {
      // Get phenomena without quick facts
      var qfResult = await supabase
        .from('phenomena')
        .select('id, name')
        .eq('status', 'active')
        .is('ai_quick_facts', null)
        .order('report_count', { ascending: false })
        .range(offset, offset + batchSize - 1);

      var qfPhenomena = qfResult.data;

      if (!qfPhenomena || qfPhenomena.length === 0) {
        return res.status(200).json({
          success: true,
          done: true,
          message: 'All phenomena have quick facts',
          results: { processed: 0, success: 0, failed: 0 }
        });
      }

      var qfSuccess = 0;
      var qfFailed = 0;
      var qfDetails = [];

      for (var qi = 0; qi < qfPhenomena.length; qi++) {
        var qp = qfPhenomena[qi];
        try {
          var qfRes = await generateQuickFacts(qp.id);
          if (qfRes) {
            qfSuccess++;
            qfDetails.push({ name: qp.name, status: 'success' });
          } else {
            qfFailed++;
            qfDetails.push({ name: qp.name, status: 'failed' });
          }
          await new Promise(function(resolve) { setTimeout(resolve, 1000); });
        } catch (error) {
          qfFailed++;
          qfDetails.push({ name: qp.name, status: 'error' });
        }
      }

      var qfCountResult = await supabase
        .from('phenomena')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .is('ai_quick_facts', null);

      return res.status(200).json({
        success: true,
        done: (qfCountResult.count || 0) === 0,
        nextOffset: offset + batchSize,
        remaining: qfCountResult.count || 0,
        results: { processed: qfPhenomena.length, success: qfSuccess, failed: qfFailed, details: qfDetails }
      });
    }

    if (action === 'status') {
      var totalPhenomena = await supabase
        .from('phenomena')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      var phenomenaWithContent = await supabase
        .from('phenomena')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .not('ai_description', 'is', null);

      var totalReports = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved');

      var linkedReports = await supabase
        .from('report_phenomena')
        .select('report_id', { count: 'exact', head: true });

      return res.status(200).json({
        success: true,
        status: {
          phenomena: {
            total: totalPhenomena.count || 0,
            withContent: phenomenaWithContent.count || 0,
            needsContent: (totalPhenomena.count || 0) - (phenomenaWithContent.count || 0)
          },
          reports: {
            total: totalReports.count || 0,
            linked: linkedReports.count || 0
          }
        }
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use: generate_content, link_reports, or status' });
  } catch (error) {
    console.error('[BatchProcess] Error:', error);
    return res.status(500).json({ error: 'Processing failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export var config = {
  api: {
    bodyParser: { sizeLimit: '1mb' },
    responseLimit: false,
  },
  maxDuration: 300,
};
