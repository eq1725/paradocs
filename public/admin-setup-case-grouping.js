// Setup case grouping + report links for Roswell 1947 case
// Run in browser console AFTER the SQL migration has been applied
// Paste into console: fetch('/admin-setup-case-grouping.js?v=' + Date.now()).then(r=>r.text()).then(eval)
(async function() {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const sb = createClient(
    'https://bhkbctdmwnowfmqpksed.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoa2JjdGRtd25vd2ZtcXBrc2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTk4NjIsImV4cCI6MjA4NTA5NTg2Mn0.eQAyAKbNwfmJZzSgGTz1hTH-I5IWYa7E2pLJER6M8bc'
  );

  const CASE_GROUP = 'roswell-1947';

  // All Roswell report slugs
  const allSlugs = [
    'the-roswell-incident-july-1947-showcase',
    'jesse-marcel-roswell-debris-field-1947',
    'mac-brazel-roswell-debris-discovery-1947',
    'walter-haut-roswell-press-release-1947',
    'thomas-dubose-roswell-coverup-testimony-1947',
  ];

  const showcaseSlug = allSlugs[0];
  const witnessSlugs = allSlugs.slice(1);

  console.log('🔗 Setting up case grouping for Roswell 1947...\n');

  // Step 1: Fetch all Roswell reports
  const { data: reports, error: fetchErr } = await sb.from('reports')
    .select('id, slug, phenomenon_type_id')
    .in('slug', allSlugs);

  if (fetchErr) {
    console.error('❌ Failed to fetch reports:', fetchErr);
    return;
  }

  console.log(`Found ${reports.length}/${allSlugs.length} reports`);
  const missing = allSlugs.filter(s => !reports.find(r => r.slug === s));
  if (missing.length) {
    console.warn('⚠️  Missing reports:', missing);
  }

  const showcase = reports.find(r => r.slug === showcaseSlug);
  if (!showcase) {
    console.error('❌ Showcase report not found!');
    return;
  }

  // Step 2: Set case_group on all Roswell reports
  console.log('\n📁 Setting case_group...');
  const reportIds = reports.map(r => r.id);
  const { data: updated, error: groupErr } = await sb.from('reports')
    .update({ case_group: CASE_GROUP })
    .in('id', reportIds)
    .select('slug, case_group');

  if (groupErr) {
    console.error('❌ Failed to set case_group:', groupErr);
    // This might fail if the column doesn't exist yet - remind user to run migration
    console.log('💡 Have you run the SQL migration? Run 20260212_case_grouping_report_links.sql in the Supabase SQL Editor first.');
    return;
  }
  console.log(`✅ Set case_group='${CASE_GROUP}' on ${updated.length} reports`);

  // Step 3: Fix phenomenon_type_id on witness reports (copy from showcase)
  if (showcase.phenomenon_type_id) {
    const witnessReports = reports.filter(r => witnessSlugs.includes(r.slug));
    const needsFix = witnessReports.filter(r => !r.phenomenon_type_id);
    if (needsFix.length > 0) {
      console.log(`\n🔧 Fixing phenomenon_type_id on ${needsFix.length} witness reports...`);
      const { error: fixErr } = await sb.from('reports')
        .update({ phenomenon_type_id: showcase.phenomenon_type_id })
        .in('id', needsFix.map(r => r.id));

      if (fixErr) console.error('❌ Failed to fix phenomenon_type_id:', fixErr);
      else console.log('✅ phenomenon_type_id fixed');
    } else {
      console.log('\n✅ All witness reports already have phenomenon_type_id');
    }
  } else {
    console.warn('\n⚠️  Showcase has no phenomenon_type_id — skipping witness fix');
  }

  // Step 4: Create report_links (showcase ↔ each witness)
  console.log('\n🔗 Creating report links...');
  const witnessReports = reports.filter(r => witnessSlugs.includes(r.slug));

  // Check for existing links first
  const { data: existingLinks } = await sb.from('report_links')
    .select('source_report_id, target_report_id')
    .or(`source_report_id.eq.${showcase.id},target_report_id.eq.${showcase.id}`);

  const existingPairs = new Set(
    (existingLinks || []).map(l => `${l.source_report_id}-${l.target_report_id}`)
  );

  const newLinks = [];
  for (const witness of witnessReports) {
    const pairKey = `${showcase.id}-${witness.id}`;
    const reversePairKey = `${witness.id}-${showcase.id}`;
    if (!existingPairs.has(pairKey) && !existingPairs.has(reversePairKey)) {
      newLinks.push({
        source_report_id: showcase.id,
        target_report_id: witness.id,
        link_type: 'witness_account',
        description: `Witness account related to the Roswell Incident`
      });
    }
  }

  if (newLinks.length === 0) {
    console.log('✅ All report links already exist');
  } else {
    const { data: inserted, error: linkErr } = await sb.from('report_links')
      .insert(newLinks)
      .select('id, link_type');

    if (linkErr) {
      console.error('❌ Failed to create report links:', linkErr);
      console.log('💡 Have you run the SQL migration? The report_links table must exist first.');
    } else {
      console.log(`✅ Created ${inserted.length} report links (showcase ↔ witnesses)`);
    }
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Roswell case grouping complete!');
  console.log(`   Case group: ${CASE_GROUP}`);
  console.log(`   Reports: ${reports.length}`);
  console.log(`   Links: ${newLinks.length} new`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n🔄 Refresh a Roswell report page to see the "Case" tab in Related Reports.');
})();
