// Debug script: Fetch NUFORC reports and show which ones would be filtered
// Run: node scripts/debug-nuforc-filter.js

require('dotenv').config({ path: '.env.local' });
var { createClient } = require('@supabase/supabase-js');

var NUFORC_SOURCE_ID = 'dedab32e-0fcf-4a91-bcdc-720948b57077';
var BASE_URL = 'https://beta.discoverparadocs.com';
var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  // Call the ingest API in dry-run mode... but we don't have that.
  // Instead, let's look at what's in the DB after ingestion and compare.

  // First, get current reports
  var supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey
  );

  var { data: reports } = await supabase
    .from('reports')
    .select('id, title, source_type, description')
    .eq('source_type', 'nuforc')
    .order('created_at', { ascending: false });

  console.log('Current NUFORC reports in DB: ' + (reports ? reports.length : 0));

  if (reports) {
    reports.forEach(function(r, i) {
      console.log((i + 1) + '. "' + r.title.substring(0, 60) + '" — desc length: ' + (r.description ? r.description.length : 0));
    });
  }

  // Now let's fetch from NUFORC directly to see what the scraper gets
  console.log('\n--- Fetching NUFORC latest page directly ---\n');

  var response = await fetch('https://nuforc.org/subndx/?id=e202603', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml'
    }
  });

  if (!response.ok) {
    console.log('Failed to fetch NUFORC: ' + response.status);
    // Try main index to find latest month
    var indexResponse = await fetch('https://nuforc.org/ndx/?id=shape', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    console.log('Index page status: ' + indexResponse.status);
    return;
  }

  var html = await response.text();

  // Parse table rows to extract sighting data
  // NUFORC table structure: each row has: Date, City, State, Country, Shape, Duration, Summary, Posted
  var rowPattern = /<tr[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/gi;
  var cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  var sightings = [];
  var match;

  while ((match = rowPattern.exec(html)) !== null) {
    var rowHtml = match[2];
    var cells = [];
    var cellMatch;

    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      var cellText = cellMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
      cells.push(cellText);
    }

    if (cells.length >= 7) {
      sightings.push({
        date: cells[0],
        city: cells[1],
        state: cells[2],
        country: cells[3],
        shape: cells[4],
        duration: cells[5],
        summary: cells[6],
        posted: cells[7] || ''
      });
    }
  }

  console.log('Total sightings parsed from NUFORC page: ' + sightings.length);
  console.log('\nFirst 25 sightings with summary lengths:\n');

  sightings.slice(0, 25).forEach(function(s, i) {
    var len = s.summary.length;
    var status = len < 100 ? '❌ TOO SHORT (<100)' : len < 150 ? '⚠️  Was filtered at 150' : '✅ OK';
    console.log((i + 1) + '. [' + len + ' chars] ' + status);
    console.log('   ' + s.city + ', ' + s.state + ' — ' + s.shape + ' — ' + s.date);
    console.log('   "' + s.summary.substring(0, 120) + (s.summary.length > 120 ? '..."' : '"'));
    console.log('');
  });
}

main().catch(function(err) {
  console.error('Error:', err);
});
