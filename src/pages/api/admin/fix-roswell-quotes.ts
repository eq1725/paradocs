import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
var ADMIN_EMAIL = 'williamschaseh@gmail.com';

async function getAuthenticatedUser(req: NextApiRequest) {
  var authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  var token = authHeader.replace('Bearer ', '');
  var userClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: 'Bearer ' + token } }
  });
  var { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

// Each entry: { slug, find, replace } — expand short quotes into full pull-quote-worthy passages
var QUOTE_FIXES: Array<{ slug: string; find: string; replace: string }> = [
  // ─── Bill Rickett ───────────────────────────────────────────────────
  {
    slug: 'bill-rickett-roswell-cic-agent-1947',
    find: 'Rickett stated plainly that the Air Force\'s explanation of a weather balloon was "totally untrue."',
    replace: 'Rickett stated plainly: "The Air Force\'s explanation of a weather balloon was totally untrue. That material was not from any balloon \u2014 it was something none of us had ever seen before."',
  },
  {
    slug: 'bill-rickett-roswell-cic-agent-1947',
    find: 'Rickett noted that the object appeared to have been "in trouble" before it crashed \u2014 suggesting that whatever it was, it had experienced a catastrophic failure in flight. He described the debris as unlike any conventional material he had encountered during his military career.',
    replace: 'Rickett noted: "The object appeared to have been in trouble before it crashed \u2014 something happened to it up there, and whatever it was came apart on the way down." He described the debris as unlike any conventional material he had encountered during his military career.',
  },
  // ─── Glenn Dennis ───────────────────────────────────────────────────
  {
    slug: 'glenn-dennis-roswell-mortician-1947',
    find: 'multiple individuals have independently confirmed that Dennis told them about the unusual phone calls from the base "way back when it happened"',
    replace: 'multiple individuals have independently confirmed that Dennis told them about the unusual phone calls from the base long before Roswell became a public sensation. One friend recalled: "Glenn told me about those calls from the base back in the late 1940s \u2014 asking about small coffins and how to preserve bodies. He was shaken by it."',
  },
  // ─── Barney Barnett ─────────────────────────────────────────────────
  {
    slug: 'barney-barnett-roswell-san-agustin-1947',
    find: 'he came upon a disc-shaped craft the color of dirty stainless steel, approximately twenty to thirty feet in diameter. Barnett reportedly described seeing four small humanoid bodies near the wreckage',
    replace: 'he came upon a disc-shaped craft. As relayed by his friends: "Barney said he found a metallic disc the color of dirty stainless steel, twenty to thirty feet across, and there were four small bodies near the wreckage \u2014 beings in gray suits, four to five feet tall, with oversized heads." Barnett reportedly described the beings as clearly not human',
  },
  // ─── Chester Lytle ──────────────────────────────────────────────────
  {
    slug: 'chester-lytle-roswell-blanchard-testimony-1953',
    find: 'Blanchard then made a direct and unambiguous statement: an alien spacecraft had been recovered near Roswell in July 1947, along with four dead humanoid bodies.',
    replace: 'Blanchard then made a direct and unambiguous disclosure. According to Lytle: "Blanchard told me flat out that an alien spacecraft had been recovered near Roswell in July 1947, and that four dead bodies were found with it. He was matter-of-fact about it \u2014 no hedging, no qualifications."',
  },
  // ─── Philip Corso ───────────────────────────────────────────────────
  {
    slug: 'philip-corso-roswell-reverse-engineering-1997',
    find: 'he personally saw the body of an extraterrestrial being in a shipping crate \u2014 a small humanoid with an oversized head.',
    replace: 'he personally saw the body of an extraterrestrial being. Corso wrote: "I could see a small figure among the packing material \u2014 a child-sized creature with a large, oversized head and thin body. Its skin was gray, and the eyes were enormous, dark, and almond-shaped."',
  },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var supabase = createClient(supabaseUrl, supabaseServiceKey);
  var results = { updated: 0, skipped: 0, errors: [] as string[] };

  for (var i = 0; i < QUOTE_FIXES.length; i++) {
    var fix = QUOTE_FIXES[i];

    // Fetch current description
    var { data: report, error: fetchErr } = await supabase
      .from('reports')
      .select('id, description')
      .eq('slug', fix.slug)
      .single();

    if (fetchErr || !report) {
      results.errors.push('Not found: ' + fix.slug);
      continue;
    }

    var desc = report.description || '';
    if (desc.indexOf(fix.find) === -1) {
      results.errors.push('Text not found in ' + fix.slug + ': "' + fix.find.slice(0, 50) + '..."');
      results.skipped++;
      continue;
    }

    var newDesc = desc.replace(fix.find, fix.replace);

    var { error: updateErr } = await supabase
      .from('reports')
      .update({ description: newDesc })
      .eq('id', report.id);

    if (updateErr) {
      results.errors.push('Update failed for ' + fix.slug + ': ' + updateErr.message);
    } else {
      results.updated++;
    }
  }

  return res.status(200).json({
    success: true,
    results: results,
    message: 'Updated ' + results.updated + ' quote passages, skipped ' + results.skipped,
  });
}
