const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const r = await s.from('phenomena')
    .select('slug, name, primary_image_url, image_gallery')
    .eq('status', 'active')
    .not('primary_image_url', 'is', null)
    .limit(50);
  const candidates = (r.data || []).filter(p => {
    const g = Array.isArray(p.image_gallery) ? p.image_gallery : [];
    return g.length === 0;
  });
  console.log('Sample of 5 with primary only (no gallery yet):');
  for (const p of candidates.slice(0, 5)) {
    console.log('  ' + p.slug + ' | ' + p.name);
  }
})();
