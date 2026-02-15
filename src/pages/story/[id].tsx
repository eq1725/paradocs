/**
 * /story/[id] - Shareable Story Landing Page
 *
 * Public-facing landing page for shared report links. Shows a preview
 * of the report with OG metadata, a teaser of the content, and a
 * signup/login CTA to view the full report.
 *
 * Designed for social media sharing - generates rich previews via
 * the OG image API at /api/og/report.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

interface StoryProps {
  report: {
    id: string;
    title: string;
    slug: string;
    description: string;
    category: string;
    location: string;
    date_of_event: string;
    credibility_score: number;
    view_count: number;
    reaction_count: number;
    comment_count: number;
    created_at: string;
    teaser: string;
  } | null;
  baseUrl: string;
}

var categoryLabels: Record<string, string> = {
  ufo: 'UFO Sighting',
  cryptid: 'Cryptid Encounter',
  ghost: 'Ghost / Haunting',
  psychic: 'Psychic Phenomenon',
  conspiracy: 'Conspiracy',
  mythological: 'Mythological',
  extraterrestrial: 'Extraterrestrial',
  other: 'Unexplained'
};

var categoryIcons: Record<string, string> = {
  ufo: '\uD83D\uDEF8', cryptid: '\uD83E\uDDB6', ghost: '\uD83D\uDC7B',
  psychic: '\uD83D\uDD2E', conspiracy: '\uD83D\uDD75\uFE0F',
  mythological: '\uD83D\uDC09', extraterrestrial: '\uD83D\uDC7D', other: '\u2753'
};

export var getServerSideProps: GetServerSideProps = async function(context) {
  var id = context.params?.id;
  if (!id) return { props: { report: null, baseUrl: '' } };

  var supabase = createClient(supabaseUrl, supabaseKey);
  var result = await supabase
    .from('reports')
    .select('id, title, slug, description, category, location, date_of_event, credibility_score, view_count, created_at')
    .or('id.eq.' + id + ',slug.eq.' + id)
    .single();

  if (result.error || !result.data) {
    return { props: { report: null, baseUrl: '' } };
  }

  var r = result.data;

  // Get reaction + comment counts
  var reactResult = await supabase.from('reactions').select('id', { count: 'exact' }).eq('report_id', r.id);
  var commentResult = await supabase.from('comments').select('id', { count: 'exact' }).eq('report_id', r.id);

  // Increment view count
  await supabase.from('reports').update({ view_count: (r.view_count || 0) + 1 }).eq('id', r.id);

  var teaser = (r.description || '').substring(0, 280);
  if ((r.description || '').length > 280) teaser += '...';

  var baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://beta.discoverparadocs.com';

  return {
    props: {
      report: {
        id: r.id,
        title: r.title,
        slug: r.slug,
        description: r.description || '',
        category: r.category || 'other',
        location: r.location || '',
        date_of_event: r.date_of_event || '',
        credibility_score: r.credibility_score || 0,
        view_count: (r.view_count || 0) + 1,
        reaction_count: reactResult.count || 0,
        comment_count: commentResult.count || 0,
        created_at: r.created_at,
        teaser: teaser
      },
      baseUrl: baseUrl
    }
  };
};

export default function StoryPage(props: StoryProps) {
  var report = props.report;
  var baseUrl = props.baseUrl;
  var router = useRouter();

  if (!report) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
        <div className="text-center">
          <span className="text-5xl mb-4 block">{'\uD83D\uDD2E'}</span>
          <h1 className="text-2xl font-bold text-white mb-2">Story Not Found</h1>
          <p className="text-gray-400 mb-6">This report may have been removed or the link is invalid.</p>
          <a href="/" className="px-6 py-2.5 rounded-lg bg-purple-600 text-white font-medium text-sm hover:bg-purple-700 transition-colors">
            Explore ParaDocs
          </a>
        </div>
      </div>
    );
  }

  var ogImageUrl = baseUrl + '/api/og/report?title=' + encodeURIComponent(report.title) +
    '&category=' + encodeURIComponent(report.category) +
    '&location=' + encodeURIComponent(report.location) +
    '&score=' + report.credibility_score +
    '&views=' + report.view_count;

  var fullUrl = baseUrl + '/story/' + (report.slug || report.id);
  var catLabel = categoryLabels[report.category] || 'Unexplained';
  var catIcon = categoryIcons[report.category] || '\uD83D\uDD2E';
  var scorePercent = Math.round(report.credibility_score * 100);
  var scoreColor = scorePercent >= 70 ? 'text-green-400' : scorePercent >= 40 ? 'text-amber-400' : 'text-red-400';

  return (
    <>
      <Head>
        <title>{report.title + ' | ParaDocs'}</title>
        <meta name="description" content={report.teaser} />
        <meta property="og:title" content={report.title} />
        <meta property="og:description" content={report.teaser} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:url" content={fullUrl} />
        <meta property="og:type" content="article" />
        <meta property="og:site_name" content="ParaDocs" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={report.title} />
        <meta name="twitter:description" content={report.teaser} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>

      <div className="min-h-screen bg-[#0a0a1a]">
        {/* Nav */}
        <nav className="border-b border-gray-800 px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <a href="/" className="text-purple-400 font-bold text-lg tracking-wider">{'\u2726'} PARADOCS</a>
            <a
              href="/auth/signin"
              className="px-4 py-1.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              Sign In
            </a>
          </div>
        </nav>

        {/* Report Preview */}
        <main className="max-w-3xl mx-auto px-6 py-12">
          {/* Category + credibility */}
          <div className="flex items-center gap-3 mb-6">
            <span className={'text-xs px-3 py-1 rounded-full border border-purple-600/30 bg-purple-900/20 text-purple-300'}>
              {catIcon + ' ' + catLabel}
            </span>
            <span className={'text-sm font-medium ' + scoreColor}>
              {scorePercent + '% credibility'}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 leading-tight">{report.title}</h1>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 mb-8">
            {report.location && (
              <div className="flex items-center gap-1.5">
                <span>{'\uD83D\uDCCD'}</span>
                <span>{report.location}</span>
              </div>
            )}
            {report.date_of_event && (
              <div className="flex items-center gap-1.5">
                <span>{'\uD83D\uDCC5'}</span>
                <span>{new Date(report.date_of_event).toLocaleDateString()}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span>{'\uD83D\uDC41'}</span>
              <span>{report.view_count + ' views'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>{'\u2764\uFE0F'}</span>
              <span>{report.reaction_count + ' reactions'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>{'\uD83D\uDCAC'}</span>
              <span>{report.comment_count + ' comments'}</span>
            </div>
          </div>

          {/* Teaser content */}
          <div className="relative">
            <div className="text-gray-300 text-lg leading-relaxed mb-2">
              {report.teaser}
            </div>
            {/* Fade overlay */}
            <div className="h-24 bg-gradient-to-t from-[#0a0a1a] to-transparent" />
          </div>

          {/* CTA Card */}
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center -mt-8 relative z-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-900/30 border border-purple-700/50 mb-4">
              <span className="text-3xl">{'\uD83D\uDD2E'}</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Read the full investigation</h2>
            <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
              Join ParaDocs to access the complete report, AI analysis, evidence files, and community discussion.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={'/auth/signup?redirect=/report/' + (report.slug || report.id)}
                className="px-8 py-3 rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 text-white font-semibold text-sm hover:from-purple-700 hover:to-violet-700 transition-all shadow-lg shadow-purple-900/30"
              >
                Sign Up Free
              </a>
              <a
                href={'/auth/signin?redirect=/report/' + (report.slug || report.id)}
                className="px-8 py-3 rounded-lg border border-gray-600 text-gray-300 font-medium text-sm hover:bg-gray-800 transition-all"
              >
                Sign In
              </a>
            </div>
            <p className="text-xs text-gray-500 mt-4">Free account includes 5 reports/month. No credit card required.</p>
          </div>

          {/* Social proof */}
          <div className="mt-12 text-center">
            <p className="text-gray-500 text-sm mb-4">Join researchers tracking the unexplained</p>
            <div className="flex justify-center gap-8">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">2,800+</p>
                <p className="text-xs text-gray-500">Reports analyzed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">47</p>
                <p className="text-xs text-gray-500">Countries</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">500+</p>
                <p className="text-xs text-gray-500">Researchers</p>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-800 px-6 py-8 mt-12">
          <div className="max-w-3xl mx-auto text-center text-sm text-gray-500">
            <p>{'\u2726'} ParaDocs {'\u2014'} Where Mysteries Meet Data</p>
            <p className="mt-1">{'\u00A9'} 2026 ParaDocs. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
