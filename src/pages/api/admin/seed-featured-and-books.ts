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

// ─── Featured Investigation: Roswell ─────────────────────────────────

var ROSWELL_FEATURED = {
  case_group: 'roswell-1947',
  title: 'The Roswell Incident',
  subtitle: 'July 1947 \u2014 The Case That Changed Everything',
  editorial_blurb: 'In July 1947, the U.S. military announced it had recovered a "flying disc" from a New Mexico ranch \u2014 then retracted the statement within hours. Decades later, over 30 sworn witnesses broke their silence. What they described was not a weather balloon.',
  hero_image_url: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Roswell_Daily_Record._July_8%2C_1947._RAAF_Captures_Flying_Saucer_On_Ranch_in_Roswell_Region.webp',
  hero_image_caption: 'Roswell Daily Record front page, July 8, 1947',
  showcase_slug: 'the-roswell-incident-july-1947-showcase',
  report_count: 14,
  category: 'ufos_aliens',
  location_label: 'Roswell, New Mexico',
  date_label: 'July 1947',
  display_order: 1,
  is_active: true,
};

// ─── Books for Roswell Reports ───────────────────────────────────────
// Each book is linked to specific reports where it's cited as a source.
// ASINs verified against Amazon.

var ROSWELL_BOOKS: Array<{
  slug: string;
  books: Array<{
    title: string;
    author: string;
    amazon_asin: string;
    cover_image_url: string | null;
    editorial_note: string;
    display_order: number;
  }>;
}> = [
  // ── Showcase (all major Roswell books) ─────────────────────
  {
    slug: 'the-roswell-incident-july-1947-showcase',
    books: [
      {
        title: 'Witness to Roswell: Unmasking the Government\'s Biggest Cover-Up',
        author: 'Thomas J. Carey & Donald R. Schmitt',
        amazon_asin: '1601199996',
        cover_image_url: null,
        editorial_note: 'The definitive modern account with over 600 witness testimonies. Contains Walter Haut\'s sealed affidavit and the most comprehensive witness catalog published.',
        display_order: 1,
      },
      {
        title: 'UFO Crash at Roswell',
        author: 'Kevin D. Randle & Donald R. Schmitt',
        amazon_asin: '0380761963',
        cover_image_url: null,
        editorial_note: 'The first rigorous investigation that revived the Roswell case in the 1990s. Established the Marcel testimony as the evidentiary cornerstone.',
        display_order: 2,
      },
      {
        title: 'The Roswell Incident',
        author: 'Charles Berlitz & William L. Moore',
        amazon_asin: '1605209228',
        cover_image_url: null,
        editorial_note: 'The 1980 book that broke the Roswell story to the public. Based on Stanton Friedman\'s original research and Marcel\'s first interviews.',
        display_order: 3,
      },
      {
        title: 'Crash at Corona: The U.S. Military Retrieval and Cover-Up of a UFO',
        author: 'Stanton T. Friedman & Don Berliner',
        amazon_asin: '1931044899',
        cover_image_url: null,
        editorial_note: 'Stanton Friedman\'s own account \u2014 the nuclear physicist who found Marcel in 1978 and single-handedly revived the case.',
        display_order: 4,
      },
    ],
  },
  // ── Jesse Marcel ───────────────────────────────────────────
  {
    slug: 'jesse-marcel-roswell-debris-field-1947',
    books: [
      {
        title: 'The Roswell Legacy: The Untold Story of the First Military Officer at the UFO Crash Site',
        author: 'Jesse Marcel Jr. & Linda Marcel',
        amazon_asin: '1601630662',
        cover_image_url: null,
        editorial_note: 'Written by Marcel\'s son, who handled the debris as a child. The most personal account of the Marcel family\'s connection to Roswell.',
        display_order: 1,
      },
      {
        title: 'Witness to Roswell: Unmasking the Government\'s Biggest Cover-Up',
        author: 'Thomas J. Carey & Donald R. Schmitt',
        amazon_asin: '1601199996',
        cover_image_url: null,
        editorial_note: 'Contains Marcel\'s complete testimony timeline from 1978 through his death, with corroborating military records.',
        display_order: 2,
      },
    ],
  },
  // ── Jesse Marcel Jr ────────────────────────────────────────
  {
    slug: 'jesse-marcel-jr-roswell-debris-1947',
    books: [
      {
        title: 'The Roswell Legacy: The Untold Story of the First Military Officer at the UFO Crash Site',
        author: 'Jesse Marcel Jr. & Linda Marcel',
        amazon_asin: '1601630662',
        cover_image_url: null,
        editorial_note: 'Marcel Jr.\'s own book \u2014 the most detailed first-person account of the kitchen floor debris examination and his father\'s lifelong burden.',
        display_order: 1,
      },
    ],
  },
  // ── Walter Haut ────────────────────────────────────────────
  {
    slug: 'walter-haut-roswell-press-release-1947',
    books: [
      {
        title: 'Witness to Roswell: Unmasking the Government\'s Biggest Cover-Up',
        author: 'Thomas J. Carey & Donald R. Schmitt',
        amazon_asin: '1601199996',
        cover_image_url: null,
        editorial_note: 'Contains the full text of Haut\'s sealed 2002 affidavit describing Building 84, the egg-shaped craft, and the bodies.',
        display_order: 1,
      },
    ],
  },
  // ── Mac Brazel ─────────────────────────────────────────────
  {
    slug: 'mac-brazel-roswell-debris-discovery-1947',
    books: [
      {
        title: 'UFO Crash at Roswell',
        author: 'Kevin D. Randle & Donald R. Schmitt',
        amazon_asin: '0380761963',
        cover_image_url: null,
        editorial_note: 'Documents Brazel\'s military detention, the confiscated KGFL radio interview, and neighbor testimonies about his changed demeanor.',
        display_order: 1,
      },
      {
        title: 'Witness to Roswell: Unmasking the Government\'s Biggest Cover-Up',
        author: 'Thomas J. Carey & Donald R. Schmitt',
        amazon_asin: '1601199996',
        cover_image_url: null,
        editorial_note: 'Includes the Loretta Proctor testimony and analysis of the Roswell Daily Record interview in context.',
        display_order: 2,
      },
    ],
  },
  // ── Philip Corso ───────────────────────────────────────────
  {
    slug: 'philip-corso-roswell-reverse-engineering-1997',
    books: [
      {
        title: 'The Day After Roswell',
        author: 'Philip J. Corso & William J. Birnes',
        amazon_asin: '067101756X',
        cover_image_url: null,
        editorial_note: 'Corso\'s own account \u2014 the New York Times bestseller claiming alien technology was seeded into American industry. Read alongside the credibility analysis in this report.',
        display_order: 1,
      },
    ],
  },
  // ── Bill Rickett ───────────────────────────────────────────
  {
    slug: 'bill-rickett-roswell-cic-agent-1947',
    books: [
      {
        title: 'UFO Crash at Roswell',
        author: 'Kevin D. Randle & Donald R. Schmitt',
        amazon_asin: '0380761963',
        cover_image_url: null,
        editorial_note: 'Primary source for Rickett\'s CIC testimony and the La Paz trajectory investigation with crystallized sand discovery.',
        display_order: 1,
      },
    ],
  },
  // ── Glenn Dennis ───────────────────────────────────────────
  {
    slug: 'glenn-dennis-roswell-mortician-1947',
    books: [
      {
        title: 'The Truth About the UFO Crash at Roswell',
        author: 'Kevin D. Randle & Donald R. Schmitt',
        amazon_asin: '0871317613',
        cover_image_url: null,
        editorial_note: 'Contains the most detailed analysis of Dennis\'s evolving account, the nurse identification problem, and contemporaneous corroboration.',
        display_order: 1,
      },
    ],
  },
  // ── Barney Barnett ─────────────────────────────────────────
  {
    slug: 'barney-barnett-roswell-san-agustin-1947',
    books: [
      {
        title: 'The Roswell Incident',
        author: 'Charles Berlitz & William L. Moore',
        amazon_asin: '1605209228',
        cover_image_url: null,
        editorial_note: 'The book that first brought Barnett\'s account public. Contains the Maltais testimony and the original Plains of San Agustin narrative.',
        display_order: 1,
      },
      {
        title: 'Crash at Corona: The U.S. Military Retrieval and Cover-Up of a UFO',
        author: 'Stanton T. Friedman & Don Berliner',
        amazon_asin: '1931044899',
        cover_image_url: null,
        editorial_note: 'Friedman\'s analysis of the two-crash-site theory and the evidence for and against the San Agustin location.',
        display_order: 2,
      },
    ],
  },
  // ── Chester Lytle ──────────────────────────────────────────
  {
    slug: 'chester-lytle-roswell-blanchard-testimony-1953',
    books: [
      {
        title: 'UFOs and Nukes: Extraordinary Encounters at Nuclear Weapons Sites',
        author: 'Robert L. Hastings',
        amazon_asin: '1544822197',
        cover_image_url: null,
        editorial_note: 'Robert Hastings\' comprehensive research on UFO activity near nuclear facilities \u2014 the interview context in which Lytle volunteered the Blanchard disclosure.',
        display_order: 1,
      },
    ],
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
  var results = {
    featured: { created: 0, skipped: 0, errors: [] as string[] },
    books: { created: 0, skipped: 0, errors: [] as string[] },
  };

  // ─── 1. Seed Featured Investigation ─────────────────────────────────

  // Check if already exists
  var { data: existing } = await supabase
    .from('featured_investigations')
    .select('id')
    .eq('case_group', ROSWELL_FEATURED.case_group)
    .single();

  if (existing) {
    results.featured.skipped++;
  } else {
    var { error: featErr } = await supabase
      .from('featured_investigations')
      .insert(ROSWELL_FEATURED);

    if (featErr) {
      results.featured.errors.push(featErr.message);
    } else {
      results.featured.created++;
    }
  }

  // ─── 2. Seed Report Books ───────────────────────────────────────────

  for (var i = 0; i < ROSWELL_BOOKS.length; i++) {
    var entry = ROSWELL_BOOKS[i];

    // Find report by slug
    var { data: report } = await supabase
      .from('reports')
      .select('id')
      .eq('slug', entry.slug)
      .single();

    if (!report) {
      results.books.errors.push('Report not found: ' + entry.slug);
      continue;
    }

    for (var j = 0; j < entry.books.length; j++) {
      var book = entry.books[j];

      // Check if this book already exists for this report
      var { data: existingBook } = await supabase
        .from('report_books')
        .select('id')
        .eq('report_id', report.id)
        .eq('amazon_asin', book.amazon_asin)
        .single();

      if (existingBook) {
        results.books.skipped++;
        continue;
      }

      var { error: bookErr } = await supabase
        .from('report_books')
        .insert({
          report_id: report.id,
          title: book.title,
          author: book.author,
          amazon_asin: book.amazon_asin,
          cover_image_url: book.cover_image_url,
          editorial_note: book.editorial_note,
          display_order: book.display_order,
        });

      if (bookErr) {
        results.books.errors.push('Book insert failed for ' + entry.slug + ': ' + bookErr.message);
      } else {
        results.books.created++;
      }
    }
  }

  return res.status(200).json({
    success: true,
    results: results,
    message: 'Featured: ' + results.featured.created + ' created, ' + results.featured.skipped + ' skipped. Books: ' + results.books.created + ' created, ' + results.books.skipped + ' skipped.',
  });
}
