/**
 * Phenomena Encyclopedia Service
 *
 * Auto-identifies phenomena from reports and generates AI content.
 * Uses Claude to analyze reports and match/create phenomenon entries.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '../supabase';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Create admin client for server-side operations
const getSupabaseAdmin = () => createServerClient();

// Types
export interface Phenomenon {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  category: string;
  icon: string;
  // Standard tier content (all users)
  ai_summary: string | null;
  ai_description: string | null;
  ai_history: string | null;
  ai_characteristics: string | null;
  ai_notable_sightings: string | null;
  ai_theories: string | null;
  ai_cultural_impact: string | null;
  // Research tier content (Pro/Enterprise only)
  ai_cultural_origins: string | null;
  ai_regional_variants: string | null;
  ai_scientific_analysis: string | null;
  ai_witness_profile: string | null;
  ai_bibliography: string | null;
  ai_related_phenomena: string | null;
  content_tier: 'standard' | 'research';
  // Stats and metadata
  report_count: number;
  primary_image_url: string | null;
  first_reported_date: string | null;
  last_reported_date: string | null;
  primary_regions: string[];
  status: string;
  ai_quick_facts?: {
    origin?: string;
    first_documented?: string;
    classification?: string;
    danger_level?: string;
    typical_encounter?: string;
    evidence_types?: string;
    active_period?: string;
    notable_feature?: string;
    cultural_significance?: string;
  } | null;
}

export interface PhenomenonMatch {
  phenomenon_id: string;
  phenomenon_name: string;
  confidence: number;
  reasoning: string;
}

export interface IdentificationResult {
  matches: PhenomenonMatch[];
  suggested_new?: {
    name: string;
    category: string;
    description: string;
    confidence: number;
  };
}

/**
 * Get all active phenomena
 */
export async function getAllPhenomena(): Promise<Phenomenon[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('phenomena')
    .select('*')
    .eq('status', 'active')
    .order('report_count', { ascending: false });

  if (error) {
    console.error('[Phenomena] Error fetching phenomena:', error);
    return [];
  }

  return data || [];
}

/**
 * Get phenomena by category
 */
export async function getPhenomenaByCategory(category: string): Promise<Phenomenon[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('phenomena')
    .select('*')
    .eq('status', 'active')
    .eq('category', category)
    .order('report_count', { ascending: false });

  if (error) {
    console.error('[Phenomena] Error fetching by category:', error);
    return [];
  }

  return data || [];
}

/**
 * Get a single phenomenon by slug
 */
export async function getPhenomenonBySlug(slug: string): Promise<Phenomenon | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('phenomena')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'active')
    .single();

  if (error) {
    console.error('[Phenomena] Error fetching by slug:', error);
    return null;
  }

  return data;
}

/**
 * Get related reports for a phenomenon
 */
export async function getPhenomenonReports(phenomenonId: string, limit = 20) {
  const { data, error } = await getSupabaseAdmin()
    .from('report_phenomena')
    .select(`
      confidence,
      report:reports(
        id, title, slug, summary, category, location_name, country,
        event_date, credibility, view_count
      )
    `)
    .eq('phenomenon_id', phenomenonId)
    .order('confidence', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Phenomena] Error fetching reports:', error);
    return [];
  }

  return data?.map(d => ({ ...d.report, match_confidence: d.confidence })) || [];
}

/**
 * Identify phenomena mentioned in a report
 */
export async function identifyPhenomena(report: {
  id: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  tags?: string[];
}): Promise<IdentificationResult> {
  // Get existing phenomena for reference
  const existingPhenomena = await getAllPhenomena();
  const phenomenaList = existingPhenomena.map(p =>
    `- ${p.name} (${p.category}): ${p.ai_summary || 'No description'} [aliases: ${p.aliases?.join(', ') || 'none'}]`
  ).join('\n');

  const prompt = `You are an expert on paranormal phenomena, cryptids, UFOs, and unexplained events.

Analyze this report and identify which known phenomena it describes or relates to.

REPORT:
Title: ${report.title}
Category: ${report.category}
Summary: ${report.summary}
Description: ${report.description}
Tags: ${report.tags?.join(', ') || 'none'}

KNOWN PHENOMENA:
${phenomenaList}

Instructions:
1. Match the report to 1-3 known phenomena from the list above (if applicable)
2. For each match, provide a confidence score (0.0-1.0) and brief reasoning
3. If the report describes something not in the known list that appears frequently reported, suggest a new phenomenon entry

Respond in JSON format:
{
  "matches": [
    {
      "phenomenon_name": "exact name from list",
      "confidence": 0.85,
      "reasoning": "Brief explanation of why this matches"
    }
  ],
  "suggested_new": null OR {
    "name": "New Phenomenon Name",
    "category": "cryptid|ufo_uap|ghost_haunting|unexplained_event|psychic_paranormal|mystery_location",
    "description": "Brief description",
    "confidence": 0.7
  }
}

Only suggest a new phenomenon if it's clearly distinct from existing ones and appears to be a real recurring phenomenon type (not a one-off event).`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return { matches: [] };
    }

    // Parse JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Phenomena] Failed to parse AI response');
      return { matches: [] };
    }

    const result = JSON.parse(jsonMatch[0]);

    // Map phenomenon names to IDs
    const matches: PhenomenonMatch[] = [];
    for (const match of result.matches || []) {
      const phenomenon = existingPhenomena.find(
        p => p.name.toLowerCase() === match.phenomenon_name.toLowerCase()
      );
      if (phenomenon) {
        matches.push({
          phenomenon_id: phenomenon.id,
          phenomenon_name: phenomenon.name,
          confidence: match.confidence,
          reasoning: match.reasoning,
        });
      }
    }

    return {
      matches,
      suggested_new: result.suggested_new,
    };
  } catch (error) {
    console.error('[Phenomena] Error identifying phenomena:', error);
    return { matches: [] };
  }
}

/**
 * Link a report to identified phenomena
 */
export async function linkReportToPhenomena(
  reportId: string,
  matches: PhenomenonMatch[],
  taggedBy: 'auto' | 'user' | 'moderator' = 'auto',
  userId?: string
): Promise<void> {
  for (const match of matches) {
    // Only link if confidence is above threshold
    if (match.confidence < 0.5) continue;

    const { error } = await getSupabaseAdmin()
      .from('report_phenomena')
      .upsert({
        report_id: reportId,
        phenomenon_id: match.phenomenon_id,
        confidence: match.confidence,
        tagged_by: taggedBy,
        tagged_by_user_id: userId || null,
      }, {
        onConflict: 'report_id,phenomenon_id',
      });

    if (error) {
      console.error('[Phenomena] Error linking report:', error);
    }
  }
}

/**
 * Generate AI content for a phenomenon
 */
export async function generatePhenomenonContent(phenomenonId: string): Promise<boolean> {
  // Get the phenomenon
  const { data: phenomenon, error } = await getSupabaseAdmin()
    .from('phenomena')
    .select('*')
    .eq('id', phenomenonId)
    .single();

  if (error || !phenomenon) {
    console.error('[Phenomena] Phenomenon not found:', phenomenonId);
    return false;
  }

  // Get related reports for context
  const reports = await getPhenomenonReports(phenomenonId, 10);
  const reportsContext = reports.map(r =>
    `- "${r.title}" (${r.country || 'Unknown location'}, ${r.event_date || 'date unknown'}): ${r.summary}`
  ).join('\n');

  const prompt = `You are an expert researcher on paranormal phenomena, cryptids, UFOs, and unexplained events.

Generate comprehensive encyclopedia content for this phenomenon:

NAME: ${phenomenon.name}
ALIASES: ${phenomenon.aliases?.join(', ') || 'None'}
CATEGORY: ${phenomenon.category}
CURRENT SUMMARY: ${phenomenon.ai_summary || 'None'}

SAMPLE RELATED REPORTS:
${reportsContext || 'No reports available yet.'}

Generate the following sections in a factual, encyclopedic tone. Be objective and include both believer and skeptic perspectives where relevant. Do NOT make up specific dates, names, or details - stick to well-documented information.

Respond in JSON format:
{
  "summary": "1-2 sentence brief description",
  "description": "2-3 paragraph detailed overview",
  "history": "Historical background including earliest known reports and key developments",
  "characteristics": "Physical description, behavioral patterns, and commonly reported features",
  "notable_sightings": "Summary of the most famous or significant cases (without inventing details)",
  "theories": "Popular explanations from both believers and skeptics",
  "cultural_impact": "Influence on media, literature, and popular culture"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return false;
    }

    // Parse JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Phenomena] Failed to parse AI content response');
      return false;
    }

    const aiContent = JSON.parse(jsonMatch[0]);

    // Update the phenomenon with AI content
    const { error: updateError } = await getSupabaseAdmin()
      .from('phenomena')
      .update({
        ai_summary: aiContent.summary,
        ai_description: aiContent.description,
        ai_history: aiContent.history,
        ai_characteristics: aiContent.characteristics,
        ai_notable_sightings: aiContent.notable_sightings,
        ai_theories: aiContent.theories,
        ai_cultural_impact: aiContent.cultural_impact,
        ai_model_used: 'claude-sonnet-4-20250514',
        ai_generated_at: new Date().toISOString(),
      })
      .eq('id', phenomenonId);

    if (updateError) {
      console.error('[Phenomena] Error updating AI content:', updateError);
      return false;
    }

    console.log('[Phenomena] Generated AI content for:', phenomenon.name);
    return true;
  } catch (error) {
    console.error('[Phenomena] Error generating content:', error);
    return false;
  }
}

/**
 * Generate quick facts for a phenomenon (lightweight AI call)
 */
export async function generateQuickFacts(phenomenonId: string): Promise<boolean> {
  // Get the phenomenon
  const { data: phenomenon, error } = await getSupabaseAdmin()
    .from('phenomena')
    .select('id, name, aliases, category, ai_summary, ai_description, primary_regions, first_reported_date, last_reported_date, report_count')
    .eq('id', phenomenonId)
    .single();

  if (error || !phenomenon) {
    console.error('[Phenomena] Phenomenon not found for quick facts:', phenomenonId);
    return false;
  }

  const prompt = `You are an expert on paranormal phenomena, cryptids, UFOs, and unexplained events.

Generate structured quick facts for this phenomenon:

NAME: ${phenomenon.name}
ALIASES: ${phenomenon.aliases?.join(', ') || 'None'}
CATEGORY: ${phenomenon.category}
SUMMARY: ${phenomenon.ai_summary || 'No summary available'}
REGIONS: ${phenomenon.primary_regions?.join(', ') || 'Unknown'}

Generate exactly these 9 fields as a JSON object. Each value should be a concise string (1-2 sentences max). Be factual and specific. If information is truly unknown, use "Unknown" or "Not well documented".

{
  "origin": "Geographic origin - city, state/province, country (e.g. 'Point Pleasant, West Virginia, USA')",
  "first_documented": "Year or era first documented (e.g. '1966' or 'Ancient Greece, circa 500 BCE')",
  "classification": "Scientific or paranormal classification (e.g. 'Winged humanoid cryptid')",
  "danger_level": "One of: 'Low — generally harmless', 'Moderate — exercise caution', 'High — associated with danger/disasters', or 'Unknown — insufficient data'",
  "typical_encounter": "Brief description of how people typically encounter this (e.g. 'Nocturnal visual sightings near wooded areas')",
  "evidence_types": "Types of evidence available (e.g. 'Eyewitness testimony, disputed photographs, footprint casts')",
  "active_period": "When most active (e.g. '1966-1967 (peak), sporadic reports ongoing')",
  "notable_feature": "Most distinctive characteristic (e.g. 'Glowing red eyes, 10-15 foot wingspan')",
  "cultural_significance": "Cultural impact in 1-2 sentences (e.g. 'Major pop culture icon with annual festival in Point Pleasant')"
}

Respond with ONLY the JSON object, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return false;
    }

    // Parse JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Phenomena] Failed to parse quick facts response for:', phenomenon.name);
      return false;
    }

    const quickFacts = JSON.parse(jsonMatch[0]);

    // Update the phenomenon with quick facts
    const { error: updateError } = await getSupabaseAdmin()
      .from('phenomena')
      .update({
        ai_quick_facts: quickFacts,
      })
      .eq('id', phenomenonId);

    if (updateError) {
      console.error('[Phenomena] Error updating quick facts:', updateError);
      return false;
    }

    console.log('[Phenomena] Generated quick facts for:', phenomenon.name);
    return true;
  } catch (error) {
    console.error('[Phenomena] Error generating quick facts:', error);
    return false;
  }
}

/**
 * Generate research-tier AI content for a phenomenon (Pro/Enterprise)
 * This adds deeper cultural, scientific, and academic content.
 */
export async function generateResearchTierContent(phenomenonId: string): Promise<boolean> {
  // Get the phenomenon with existing content
  const { data: phenomenon, error } = await getSupabaseAdmin()
    .from('phenomena')
    .select('*')
    .eq('id', phenomenonId)
    .single();

  if (error || !phenomenon) {
    console.error('[Phenomena] Phenomenon not found for research tier:', phenomenonId);
    return false;
  }

  // Get related reports for deeper context
  const reports = await getPhenomenonReports(phenomenonId, 25);
  const reportsContext = reports.slice(0, 15).map(r =>
    `- "${r.title}" (${r.country || 'Unknown'}, ${r.event_date || 'date unknown'}): ${r.summary}`
  ).join('\n');

  const prompt = `You are an academic researcher specializing in paranormal phenomena, folklore studies, and anomalistic psychology.

Generate RESEARCH-GRADE content for this phenomenon entry. This content is for serious researchers and academics, so maintain scholarly rigor while remaining accessible.

PHENOMENON: ${phenomenon.name}
ALIASES: ${phenomenon.aliases?.join(', ') || 'None'}
CATEGORY: ${phenomenon.category}
EXISTING DESCRIPTION: ${phenomenon.ai_description || phenomenon.ai_summary || 'None'}
EXISTING HISTORY: ${phenomenon.ai_history || 'None'}

SAMPLE LINKED REPORTS (from database of ${phenomenon.report_count || 0} total):
${reportsContext || 'No reports available yet.'}

Generate the following RESEARCH-TIER sections in an academic but accessible tone:

1. CULTURAL ORIGINS: Trace the folklore roots and indigenous/traditional beliefs about this phenomenon. Include how different cultures have interpreted similar experiences historically.

2. REGIONAL VARIANTS: Document how this phenomenon manifests differently across regions and cultures (e.g., how Bigfoot relates to Yeti, Yowie, Yeren, etc.). Include both physical description differences and cultural interpretations.

3. SCIENTIFIC ANALYSIS: Provide balanced coverage of scientific perspectives - both skeptical explanations (misidentification, psychology, hoaxes) and any serious research conducted. Mention relevant fields like cryptozoology, ufology, parapsychology as appropriate.

4. WITNESS PROFILE: Based on documented cases, describe the typical witness demographics, circumstances of encounters, and common elements reported. Note any patterns without making unfounded generalizations.

5. BIBLIOGRAPHY: List key researchers, essential books, academic papers, and documentaries. Focus on seminal works and serious investigators rather than popular media.

6. RELATED PHENOMENA: Identify other phenomena that may be connected - either as variants, similar entities, or phenomena that frequently co-occur in reports.

Respond in JSON format:
{
  "cultural_origins": "2-3 paragraphs on folklore roots and cross-cultural connections",
  "regional_variants": "2-3 paragraphs on geographic variations",
  "scientific_analysis": "2-3 paragraphs balancing skeptic and believer perspectives",
  "witness_profile": "1-2 paragraphs on typical encounter circumstances",
  "bibliography": "Key sources formatted as: Author (Year). Title. Publisher/Journal.",
  "related_phenomena": "List of related phenomena with brief explanation of connections"
}

Important: Do NOT invent specific names, dates, or citations. Only reference well-documented information.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return false;
    }

    // Parse JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Phenomena] Failed to parse research tier response');
      return false;
    }

    const researchContent = JSON.parse(jsonMatch[0]);

    // Update the phenomenon with research-tier content
    const { error: updateError } = await getSupabaseAdmin()
      .from('phenomena')
      .update({
        ai_cultural_origins: researchContent.cultural_origins,
        ai_regional_variants: researchContent.regional_variants,
        ai_scientific_analysis: researchContent.scientific_analysis,
        ai_witness_profile: researchContent.witness_profile,
        ai_bibliography: researchContent.bibliography,
        ai_related_phenomena: researchContent.related_phenomena,
        content_tier: 'research',
        ai_generated_at: new Date().toISOString(),
      })
      .eq('id', phenomenonId);

    if (updateError) {
      console.error('[Phenomena] Error updating research tier content:', updateError);
      return false;
    }

    console.log('[Phenomena] Generated research-tier content for:', phenomenon.name);
    return true;
  } catch (error) {
    console.error('[Phenomena] Error generating research tier content:', error);
    return false;
  }
}

/**
 * Create a new phenomenon entry
 */
export async function createPhenomenon(data: {
  name: string;
  category: string;
  description?: string;
  aliases?: string[];
  icon?: string;
  auto_generated?: boolean;
  confidence_score?: number;
  source_report_ids?: string[];
}): Promise<Phenomenon | null> {
  const slug = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const { data: phenomenon, error } = await getSupabaseAdmin()
    .from('phenomena')
    .insert({
      name: data.name,
      slug,
      category: data.category,
      ai_summary: data.description,
      aliases: data.aliases || [],
      icon: data.icon || getDefaultIcon(data.category),
      auto_generated: data.auto_generated ?? true,
      confidence_score: data.confidence_score,
      source_report_ids: data.source_report_ids || [],
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    console.error('[Phenomena] Error creating phenomenon:', error);
    return null;
  }

  // Generate AI content for the new phenomenon
  if (phenomenon) {
    await generatePhenomenonContent(phenomenon.id);
  }

  return phenomenon;
}

/**
 * Process a batch of reports to identify and link phenomena
 */
export async function processPhenomenaForReports(reportIds: string[]): Promise<{
  processed: number;
  linked: number;
  new_phenomena: number;
}> {
  let processed = 0;
  let linked = 0;
  let new_phenomena = 0;

  for (const reportId of reportIds) {
    // Get the report
    const { data: report, error } = await getSupabaseAdmin()
      .from('reports')
      .select('id, title, summary, description, category, tags')
      .eq('id', reportId)
      .single();

    if (error || !report) continue;

    processed++;

    // Identify phenomena
    const result = await identifyPhenomena(report);

    // Link to existing phenomena
    if (result.matches.length > 0) {
      await linkReportToPhenomena(report.id, result.matches, 'auto');
      linked += result.matches.length;
    }

    // Create new phenomenon if suggested
    if (result.suggested_new && result.suggested_new.confidence >= 0.7) {
      const newPhenomenon = await createPhenomenon({
        name: result.suggested_new.name,
        category: result.suggested_new.category,
        description: result.suggested_new.description,
        auto_generated: true,
        confidence_score: result.suggested_new.confidence,
        source_report_ids: [report.id],
      });

      if (newPhenomenon) {
        new_phenomena++;
        // Link the report to the new phenomenon
        await linkReportToPhenomena(report.id, [{
          phenomenon_id: newPhenomenon.id,
          phenomenon_name: newPhenomenon.name,
          confidence: result.suggested_new.confidence,
          reasoning: 'Auto-created from report',
        }], 'auto');
        linked++;
      }
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return { processed, linked, new_phenomena };
}

/**
 * Get default icon for category
 */
function getDefaultIcon(category: string): string {
  const icons: Record<string, string> = {
    'cryptid': '🦶',
    'ufo_uap': '🛸',
    'ghost_haunting': '👻',
    'unexplained_event': '❓',
    'psychic_paranormal': '🔮',
    'mystery_location': '📍',
    'other': '❔',
  };
  return icons[category] || '❔';
}

/**
 * Get phenomena for a specific report
 */
export async function getReportPhenomena(reportId: string): Promise<{
  phenomenon: Phenomenon;
  confidence: number;
}[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('report_phenomena')
    .select(`
      confidence,
      phenomenon:phenomena(*)
    `)
    .eq('report_id', reportId);

  if (error) {
    console.error('[Phenomena] Error fetching report phenomena:', error);
    return [];
  }

  return data?.map(d => ({
    phenomenon: d.phenomenon as unknown as Phenomenon,
    confidence: d.confidence,
  })).filter(d => d.phenomenon) || [];
}

/**
 * Search phenomena by name
 */
export async function searchPhenomena(query: string, limit = 10): Promise<Phenomenon[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('phenomena')
    .select('*')
    .eq('status', 'active')
    .or(`name.ilike.%${query}%,aliases.cs.{${query}}`)
    .order('report_count', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Phenomena] Error searching:', error);
    return [];
  }

  return data || [];
}
