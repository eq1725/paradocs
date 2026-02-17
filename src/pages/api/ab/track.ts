import { createClient } from '@supabase/supabase-js';

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var { test_name, variant, event_type, session_id, page_path, metadata } = req.body;

    if (!test_name || !variant || !event_type || !session_id) {
      return res.status(400).json({ error: 'Missing required fields: test_name, variant, event_type, session_id' });
    }

    var supabase = createClient(supabaseUrl, supabaseServiceKey);

    var { error } = await supabase.from('ab_events').insert({
      test_name: test_name,
      variant: variant,
      event_type: event_type,
      session_id: session_id,
      page_path: page_path || null,
      metadata: metadata || {},
    });

    if (error) {
      console.error('A/B track insert error:', error);
      return res.status(500).json({ error: 'Failed to track event' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('A/B track error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
