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

// ─── Pull Quote Extraction (mirrors FormattedDescription.tsx logic) ─────

var NOT_NAMES = [
  'He', 'She', 'It', 'We', 'They', 'His', 'Her', 'Its', 'Our', 'Their',
  'The', 'This', 'That', 'These', 'Those', 'There', 'Here', 'Where', 'When',
  'One', 'Two', 'Three', 'Some', 'Many', 'Most', 'All', 'Both', 'Each',
  'According', 'However', 'Although', 'Because', 'Before', 'After', 'During',
  'Several', 'Multiple', 'Various', 'Other', 'Another', 'Such', 'What'
];

function isLikelyName(candidate: string): boolean {
  if (!candidate || candidate.length < 3) return false;
  var words = candidate.split(/\s+/);
  if (NOT_NAMES.indexOf(words[0]) !== -1) return false;
  if (words[0].length < 3) return false;
  if (words.length > 4) return false;
  return true;
}

function isAllCapsHeader(line: string): boolean {
  var trimmed = line.trim();
  if (trimmed.length > 120 || trimmed.length < 3) return false;
  var cleaned = trimmed.replace(/[\u2014\-:.,'"]/g, ' ').trim();
  var words = cleaned.split(/\s+/).filter(function(w) { return w.length > 0; });
  if (words.length < 1) return false;
  if (words.length === 1 && cleaned.length < 4) return false;
  var letters = trimmed.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 3) return false;
  var upperCount = (letters.match(/[A-Z]/g) || []).length;
  return upperCount / letters.length >= 0.8;
}

// Check if quoted text looks like a title/citation rather than testimony
function looksLikeTitle(quote: string): boolean {
  // Contains a colon followed by subtitle (common in report/book titles)
  if (/^[A-Z].*:\s+[A-Z]/.test(quote)) return true;
  // Mostly title-cased words (3+ consecutive capitalized words)
  var titleWords = quote.match(/\b[A-Z][a-z]+\b/g) || [];
  var totalWords = quote.split(/\s+/).length;
  if (totalWords <= 12 && titleWords.length / totalWords > 0.6) return true;
  // Contains publication indicators
  if (/\b(Report|Edition|Volume|Journal|Published|Press|University)\b/.test(quote)) return true;
  return false;
}

// Check if quoted text looks like a citation reference
function looksLikeCitation(quote: string, afterQuote: string): boolean {
  // Followed by year in parentheses or just a year
  if (/^\s*[,.]?\s*\(\d{4}\)/.test(afterQuote)) return true;
  if (/^\s*[,.]?\s*\d{4}\b/.test(afterQuote)) return true;
  // Contains "by Author" pattern after
  if (/^\s*by\s+[A-Z]/.test(afterQuote)) return true;
  // Quote itself looks like a title with author attribution
  if (/\bby\s+[A-Z][a-z]+\s+[A-Z]/.test(quote)) return true;
  return false;
}

function extractPullQuote(text: string): { quote: string; attribution: string; issues: string[] } | null {
  var quotePattern = /["\u201C]([^"\u201D]{40,250})["\u201D]/;
  var match = text.match(quotePattern);
  if (!match) return null;

  var quote = match[1].trim();
  var issues: string[] = [];
  var matchIndex = match.index || 0;

  var beforeQuote = text.slice(0, matchIndex);
  var afterQuote = text.slice(matchIndex + match[0].length);

  // Check for title-like or citation-like quotes
  if (looksLikeTitle(quote)) {
    issues.push('TITLE_LIKE: Quote resembles a book/report title, not testimony');
  }
  if (looksLikeCitation(quote, afterQuote)) {
    issues.push('CITATION_LIKE: Quote appears to be a citation reference');
  }

  // Attribution detection — same logic as FormattedDescription.tsx
  var verbs = '(?:[Ss]aid|[Ss]tated|[Tt]old|[Rr]ecalled|[Nn]oted|[Ww]rote|[Tt]estified|[Rr]evealed|[Ee]xplained|[Rr]eported|[Cc]laimed|[Dd]eclared)';
  var nearBefore = beforeQuote.slice(-200);
  var beforeAttr = nearBefore.match(new RegExp('([A-Z][a-z]{2,}(?:\\s[A-Z][a-z.]{1,}){0,3})\\s+' + verbs + '\\b'));

  if (beforeAttr && isLikelyName(beforeAttr[1])) {
    return { quote: quote, attribution: beforeAttr[1], issues: issues };
  }

  // Check for "verb Name" after the quote
  var afterAttr = afterQuote.match(new RegExp('^\\s*' + verbs + '\\s+([A-Z][a-z]{2,}(?:\\s[A-Z][a-z.]{1,}){0,3})'));
  if (afterAttr && isLikelyName(afterAttr[1])) {
    return { quote: quote, attribution: afterAttr[1], issues: issues };
  }

  // Check for em-dash attribution pattern: \n— Name or — Name
  var dashAttr = afterQuote.match(/^\s*[\n]?\s*[\u2014\-]{1,2}\s*([A-Z][a-z]{2,}(?:\s[A-Z][a-z.]{1,}){0,3})/);
  if (dashAttr && isLikelyName(dashAttr[1])) {
    return { quote: quote, attribution: dashAttr[1], issues: issues };
  }

  issues.push('NO_ATTRIBUTION: No speaker attribution detected');
  return { quote: quote, attribution: '', issues: issues };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch all reports with descriptions
  var { data: reports, error } = await supabase
    .from('reports')
    .select('slug, title, description, case_group')
    .not('description', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  var audit: any[] = [];
  var summary = {
    total_reports: 0,
    reports_with_quotes: 0,
    total_quotes_extracted: 0,
    quotes_with_attribution: 0,
    quotes_without_attribution: 0,
    quotes_title_like: 0,
    quotes_citation_like: 0
  };

  for (var r = 0; r < (reports || []).length; r++) {
    var report = reports![r];
    if (!report.description) continue;
    summary.total_reports++;

    var paragraphs = report.description.split(/\n\n+/);
    var reportQuotes: any[] = [];
    var lastHeaderIdx = -1;
    var sectionHasPullQuote = false;
    var currentSection = '(intro)';

    for (var i = 0; i < paragraphs.length; i++) {
      var trimmed = paragraphs[i].trim();
      if (!trimmed) continue;

      // Track section headers
      if (isAllCapsHeader(trimmed) || /^#{1,3}\s+/.test(trimmed)) {
        lastHeaderIdx = i;
        sectionHasPullQuote = false;
        currentSection = trimmed.replace(/^#+\s*/, '');
        continue;
      }

      // Same selection logic as FormattedDescription
      if (!sectionHasPullQuote && i > lastHeaderIdx + 1) {
        var pq = extractPullQuote(trimmed);
        if (pq) {
          sectionHasPullQuote = true;
          summary.total_quotes_extracted++;

          if (pq.attribution) {
            summary.quotes_with_attribution++;
          } else {
            summary.quotes_without_attribution++;
          }

          var hasTitle = false;
          var hasCitation = false;
          for (var j = 0; j < pq.issues.length; j++) {
            if (pq.issues[j].indexOf('TITLE_LIKE') === 0) { hasTitle = true; summary.quotes_title_like++; }
            if (pq.issues[j].indexOf('CITATION_LIKE') === 0) { hasCitation = true; summary.quotes_citation_like++; }
          }

          reportQuotes.push({
            section: currentSection,
            quote: pq.quote.length > 80 ? pq.quote.slice(0, 80) + '...' : pq.quote,
            full_quote: pq.quote,
            attribution: pq.attribution || '(none)',
            issues: pq.issues,
            would_render: pq.issues.length === 0,
            paragraph_index: i
          });
        }
      }
    }

    if (reportQuotes.length > 0) {
      summary.reports_with_quotes++;
      audit.push({
        slug: report.slug,
        title: report.title,
        case_group: report.case_group,
        quote_count: reportQuotes.length,
        quotes: reportQuotes
      });
    }
  }

  return res.status(200).json({
    summary: summary,
    audit: audit
  });
}
