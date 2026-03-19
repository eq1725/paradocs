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
  var result = await userClient.auth.getUser();
  if (result.error || !result.data.user) return null;
  return result.data.user;
}

// ─── Credibility Rationales ─────────────────────────────────────────────
// Each rationale is a reader-facing explanation of why the report has its
// credibility rating. Written in plain language, 2-4 sentences.
// These supplement the badge — not replace it.

var RATIONALES: Array<{ slug: string; credibility_rationale: string }> = [

  // ─── HIGH CREDIBILITY ───────────────────────────────────────────────

  {
    slug: 'the-roswell-incident-july-1947-showcase',
    credibility_rationale: 'Rated high credibility based on the volume and quality of primary source evidence: over 30 sworn affidavits from military and civilian witnesses, declassified government documents including GAO Report NSIAD-95-187, contemporary press accounts, and the confirmed destruction of key RAAF administrative records. The case includes testimony from officers holding high-level security clearances at the world\'s only nuclear-armed military unit.',
  },
  {
    slug: 'mac-brazel-roswell-debris-discovery-1947',
    credibility_rationale: 'Rated high credibility because Brazel\'s account is documented in a contemporary 1947 newspaper interview — one of the only real-time records from any Roswell witness. His military detention for approximately one week after reporting a supposed weather balloon, and his visible behavioral change afterward, are corroborated by neighbors including the Proctor family.',
  },
  {
    slug: 'jesse-marcel-roswell-debris-field-1947',
    credibility_rationale: 'Rated high credibility given Marcel\'s role as intelligence officer for the 509th Bomb Group, with security clearances requiring him to identify military technology. His debris descriptions remained consistent across interviews from 1978 to 1986. Some discrepancies in background claims (educational credentials, combat decorations) have been noted by researchers, but the core account has not been contradicted.',
  },
  {
    slug: 'thomas-dubose-roswell-coverup-testimony-1947',
    credibility_rationale: 'Rated high credibility. As Eighth Air Force chief of staff, DuBose was a direct participant in the Fort Worth press conference. His 1991 acknowledgment that the weather balloon explanation was a cover story ordered by General McMullen from Washington is a senior officer confirming a deliberate deception. His rank and role make fabrication implausible.',
  },
  {
    slug: 'robert-porter-roswell-transport-1947',
    credibility_rationale: 'Rated high credibility based on Porter\'s June 1991 sworn affidavit describing his role as B-29 flight engineer on the debris transport flight from Roswell to Fort Worth. His account of the packages — lightweight, triangle-shaped, and reshipped to Wright Field — is specific, measured, and consistent with the chain-of-custody described by other witnesses.',
  },
  {
    slug: 'jesse-marcel-jr-roswell-debris-1947',
    credibility_rationale: 'Rated high credibility. Marcel Jr. handled debris at age 11 when his father brought samples home the night of July 7-8, 1947. He maintained a consistent account across 35 years of public testimony, including detailed descriptions of the I-beam symbols and the metallic foil\'s self-restoring properties. His account independently corroborates his father\'s.',
  },
  {
    slug: 'bill-rickett-roswell-cic-agent-1947',
    credibility_rationale: 'Rated high credibility. As the senior CIC enlisted man at Roswell AAF, Rickett worked directly under Captain Cavitt. His statement that the weather balloon explanation was "totally untrue" carries weight given his professional role in counter-intelligence. His account is consistent with Marcel\'s and contradicts Cavitt\'s later minimizing statements.',
  },

  // ─── MEDIUM CREDIBILITY ─────────────────────────────────────────────

  {
    slug: 'walter-haut-roswell-press-release-1947',
    credibility_rationale: 'Rated medium credibility. Haut\'s role in issuing the original "flying disc" press release is established fact. However, his most dramatic claims — seeing an egg-shaped craft and bodies in Building 84 — come from a sealed affidavit opened after his 2005 death, making cross-examination impossible. His decades of public reticence before the affidavit adds complexity to the assessment.',
  },
  {
    slug: 'george-wilcox-roswell-sheriff-1947',
    credibility_rationale: 'Rated medium credibility. Wilcox\'s role as the sheriff who received Brazel\'s report is well-documented. However, the most dramatic claims — military threats against his family — come from his granddaughter Barbara Dugger relaying what her grandmother Inez told her, making this second-hand testimony that cannot be independently verified.',
  },
  {
    slug: 'sheridan-cavitt-roswell-cic-1947',
    credibility_rationale: 'Rated medium credibility due to significant internal contradictions. Cavitt denied visiting the ranch for over a decade, then provided a minimizing account to the 1994 Air Force investigation. His description of "bamboo sticks" matches neither weather balloons nor Project Mogul arrays. The shifting story makes his testimony difficult to assess in either direction.',
  },
  {
    slug: 'glenn-dennis-roswell-mortician-1947',
    credibility_rationale: 'Rated medium credibility. Dennis\'s claims about receiving calls from the base about small coffins and body preservation are dramatic but unverifiable. His account of a nurse witness who was allegedly transferred and later died in a plane crash has not been confirmed. Researchers have noted inconsistencies in details across different tellings of his story.',
  },
  {
    slug: 'barney-barnett-roswell-san-agustin-1947',
    credibility_rationale: 'Rated medium credibility. Barnett\'s account of seeing a crashed disc and small bodies near the Plains of San Agustin is entirely relayed through friends — he never published or recorded his own testimony before his death. The San Agustin site as a second crash location remains contested among researchers, with some arguing it was a conflation of separate events.',
  },
  {
    slug: 'chester-lytle-roswell-blanchard-testimony-1953',
    credibility_rationale: 'Rated medium credibility. Lytle\'s Manhattan Project credentials are independently verifiable, and Colonel Blanchard was the actual Roswell base commander who authorized the original press release. However, this is second-hand testimony — Lytle is reporting what Blanchard told him — and Blanchard died in 1966, making confirmation impossible.',
  },

  // ─── LOW CREDIBILITY ────────────────────────────────────────────────

  {
    slug: 'philip-corso-roswell-reverse-engineering-1997',
    credibility_rationale: 'Rated low credibility. While Corso\'s military service record is verified — including NSC staff and Pentagon positions — his specific reverse-engineering claims contain documented factual errors and have no independent corroboration. The technologies he attributed to Roswell (fiber optics, integrated circuits, Kevlar) all have well-documented human development histories predating or independent of the 1947 timeline.',
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

  // Step 1: Add the credibility_rationale column if it doesn't exist
  var { error: colError } = await supabase.rpc('exec_sql', {
    sql: "ALTER TABLE reports ADD COLUMN IF NOT EXISTS credibility_rationale text;"
  });

  // If rpc exec_sql doesn't exist, try direct SQL via the management API
  var columnAdded = !colError;
  var columnNote = columnAdded
    ? 'Column added (or already existed)'
    : 'Could not add column via RPC: ' + (colError ? colError.message : 'unknown') + '. You may need to add it manually in Supabase dashboard: ALTER TABLE reports ADD COLUMN IF NOT EXISTS credibility_rationale text;';

  // Step 2: Seed the rationales
  var results: Array<{ slug: string; status: string }> = [];

  for (var i = 0; i < RATIONALES.length; i++) {
    var entry = RATIONALES[i];
    var { error } = await supabase
      .from('reports')
      .update({ credibility_rationale: entry.credibility_rationale })
      .eq('slug', entry.slug);

    results.push({
      slug: entry.slug,
      status: error ? 'ERROR: ' + error.message : 'updated',
    });
  }

  var successCount = results.filter(function(r) { return r.status === 'updated'; }).length;
  var errorCount = results.filter(function(r) { return r.status !== 'updated'; }).length;

  return res.status(200).json({
    column_migration: columnNote,
    seeded: successCount,
    errors: errorCount,
    results: results,
  });
}
