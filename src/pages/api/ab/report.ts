import { createClient } from '@supabase/supabase-js';

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require admin key
  var adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    var supabase = createClient(supabaseUrl, supabaseServiceKey);
    var testName = req.query.test_name;

    if (!testName) {
      // List all active tests with summary counts
      var { data, error } = await supabase
        .from('ab_events')
        .select('test_name, variant, event_type')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Aggregate by test_name -> variant -> event_type
      var tests = {};
      (data || []).forEach(function(row) {
        if (!tests[row.test_name]) tests[row.test_name] = {};
        if (!tests[row.test_name][row.variant]) tests[row.test_name][row.variant] = {};
        if (!tests[row.test_name][row.variant][row.event_type]) tests[row.test_name][row.variant][row.event_type] = 0;
        tests[row.test_name][row.variant][row.event_type]++;
      });

      return res.status(200).json({ tests: tests });
    }

    // Detailed report for a specific test
    var { data: events, error: evError } = await supabase
      .from('ab_events')
      .select('*')
      .eq('test_name', testName)
      .order('created_at', { ascending: false });

    if (evError) throw evError;

    // Build stats per variant
    var variants = {};
    var uniqueSessions = {};

    (events || []).forEach(function(ev) {
      if (!variants[ev.variant]) {
        variants[ev.variant] = { views: 0, clicks: 0, conversions: 0, unique_sessions: new Set() };
      }
      variants[ev.variant].unique_sessions.add(ev.session_id);
      if (ev.event_type === 'view') variants[ev.variant].views++;
      if (ev.event_type === 'click') variants[ev.variant].clicks++;
      if (ev.event_type === 'conversion') variants[ev.variant].conversions++;
    });

    // Convert Sets to counts and calculate rates
    var report = {};
    Object.keys(variants).forEach(function(v) {
      var d = variants[v];
      var sessions = d.unique_sessions.size;
      report[v] = {
        unique_sessions: sessions,
        views: d.views,
        clicks: d.clicks,
        conversions: d.conversions,
        click_rate: d.views > 0 ? (d.clicks / d.views * 100).toFixed(2) + '%' : '0%',
        conversion_rate: d.views > 0 ? (d.conversions / d.views * 100).toFixed(2) + '%' : '0%',
      };
    });

    return res.status(200).json({
      test_name: testName,
      total_events: (events || []).length,
      variants: report,
    });
  } catch (err) {
    console.error('A/B report error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
