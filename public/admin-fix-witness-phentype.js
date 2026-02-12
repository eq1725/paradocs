// Quick fix: Set phenomenon_type_id on witness reports to match Roswell showcase
(async function() {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const sb = createClient(
    'https://bhkbctdmwnowfmqpksed.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoa2JjdGRtd25vd2ZtcXBrc2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTk4NjIsImV4cCI6MjA4NTA5NTg2Mn0.eQAyAKbNwfmJZzSgGTz1hTH-I5IWYa7E2pLJER6M8bc'
  );

  // Get showcase phenomenon_type_id
  const { data: showcase } = await sb.from('reports').select('phenomenon_type_id')
    .eq('slug', 'the-roswell-incident-july-1947-showcase').single();

  if (!showcase?.phenomenon_type_id) {
    console.log('Showcase phenomenon_type_id:', showcase);
    // If showcase also has null, list all phenomenon_types to find the right one
    const { data: types } = await sb.from('phenomenon_types').select('id, name, slug');
    console.table(types);
    return;
  }

  const witnessSlugs = [
    'jesse-marcel-roswell-debris-field-1947',
    'mac-brazel-roswell-debris-discovery-1947',
    'walter-haut-roswell-press-release-1947',
    'thomas-dubose-roswell-coverup-testimony-1947',
  ];

  const { data, error } = await sb.from('reports')
    .update({ phenomenon_type_id: showcase.phenomenon_type_id })
    .in('slug', witnessSlugs)
    .select('slug, phenomenon_type_id');

  if (error) console.error('Error:', error);
  else console.log('✅ Updated', data.length, 'witness reports with phenomenon_type_id:', showcase.phenomenon_type_id);
})();
