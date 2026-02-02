#!/usr/bin/env node
/**
 * Server-side batch processing script
 * Run with: node scripts/run-batch-process.mjs
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// Load environment from .env.local
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const anthropic = new Anthropic({ apiKey: anthropicKey });

// Escape regex special characters
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Generate AI content for a phenomenon
async function generateContent(phenomenon) {
  const prompt = `You are an expert researcher on paranormal phenomena, cryptids, UFOs, and unexplained events.

Generate comprehensive encyclopedia content for this phenomenon:

NAME: ${phenomenon.name}
ALIASES: ${phenomenon.aliases?.join(', ') || 'None'}
CATEGORY: ${phenomenon.category}
CURRENT SUMMARY: ${phenomenon.ai_summary || 'None'}

Generate the following sections in a factual, encyclopedic tone. Be objective and include both believer and skeptic perspectives where relevant.

Respond in JSON format:
{
  "summary": "1-2 sentence brief description",
  "description": "2-3 paragraph detailed overview",
  "history": "Historical background including earliest known reports",
  "characteristics": "Physical description, behavioral patterns",
  "notable_sightings": "Famous cases summary",
  "theories": "Popular explanations from believers and skeptics",
  "cultural_impact": "Influence on media and culture"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const content = JSON.parse(jsonMatch[0]);

    await supabase.from('phenomena').update({
      ai_summary: content.summary,
      ai_description: content.description,
      ai_history: content.history,
      ai_characteristics: content.characteristics,
      ai_notable_sightings: content.notable_sightings,
      ai_theories: content.theories,
      ai_cultural_impact: content.cultural_impact,
      ai_model_used: 'claude-sonnet-4-20250514',
      ai_generated_at: new Date().toISOString(),
    }).eq('id', phenomenon.id);

    return true;
  } catch (error) {
    console.error(`  Error for ${phenomenon.name}:`, error.message);
    return false;
  }
}

// Main batch process
async function main() {
  console.log('='.repeat(60));
  console.log('PHENOMENA BATCH PROCESS');
  console.log('='.repeat(60));

  // Step 1: Generate AI content
  console.log('\n[1/2] Generating AI content...\n');

  const { data: needContent } = await supabase
    .from('phenomena')
    .select('id, name, aliases, category, ai_summary')
    .eq('status', 'active')
    .is('ai_description', null);

  console.log(`Found ${needContent?.length || 0} phenomena needing content\n`);

  let generated = 0;
  for (const p of (needContent || [])) {
    process.stdout.write(`  Generating: ${p.name}...`);
    const success = await generateContent(p);
    if (success) {
      generated++;
      console.log(' ✓');
    } else {
      console.log(' ✗');
    }
    await new Promise(r => setTimeout(r, 1500)); // Rate limit
  }
  console.log(`\n✓ Generated content for ${generated} phenomena\n`);

  // Step 2: Link reports to phenomena
  console.log('[2/2] Linking reports to phenomena...\n');

  const { data: phenomena } = await supabase
    .from('phenomena')
    .select('id, name, aliases, category')
    .eq('status', 'active');

  const patterns = (phenomena || []).map(p => ({
    id: p.id,
    name: p.name,
    patterns: [p.name.toLowerCase(), ...(p.aliases || []).map(a => a.toLowerCase())]
  }));

  const { count: totalReports } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved');

  console.log(`Processing ${totalReports?.toLocaleString()} reports...\n`);

  let offset = 0;
  let totalMatches = 0;
  let totalLinked = 0;
  const batchSize = 1000;
  const startTime = Date.now();

  while (offset < (totalReports || 0)) {
    const { data: reports } = await supabase
      .from('reports')
      .select('id, title, summary, description')
      .eq('status', 'approved')
      .range(offset, offset + batchSize - 1);

    if (!reports || reports.length === 0) break;

    for (const report of reports) {
      const text = [report.title, report.summary, report.description].join(' ').toLowerCase();

      for (const p of patterns) {
        for (const pattern of p.patterns) {
          const regex = new RegExp(`\\b${escapeRegex(pattern)}\\b`, 'i');
          if (regex.test(text)) {
            totalMatches++;
            const confidence = regex.test(report.title?.toLowerCase() || '') ? 0.85 : 0.7;

            const { error } = await supabase.from('report_phenomena').upsert({
              report_id: report.id,
              phenomenon_id: p.id,
              confidence,
              tagged_by: 'auto'
            }, { onConflict: 'report_id,phenomenon_id', ignoreDuplicates: true });

            if (!error) totalLinked++;
            break;
          }
        }
      }
    }

    offset += batchSize;
    const pct = ((offset / totalReports) * 100).toFixed(1);
    const rate = (offset / ((Date.now() - startTime) / 60000)).toFixed(0);
    console.log(`  ${offset.toLocaleString()} processed (${pct}%), ${totalMatches.toLocaleString()} matches, ${rate}/min`);
  }

  const totalTime = ((Date.now() - startTime) / 60000).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE!');
  console.log('='.repeat(60));
  console.log(`Content generated: ${generated}`);
  console.log(`Reports processed: ${offset.toLocaleString()}`);
  console.log(`Matches found: ${totalMatches.toLocaleString()}`);
  console.log(`Links created: ${totalLinked.toLocaleString()}`);
  console.log(`Time: ${totalTime} minutes`);
}

main().catch(console.error);
