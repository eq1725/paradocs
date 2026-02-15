/**
 * API: GET/POST /api/challenges
 *
 * Community Challenges system:
 * - GET: Returns active + upcoming + past challenges with leaderboard data
 * - POST: Join a challenge or submit an entry
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getSupabase() {
  return createClient(supabaseUrl, supabaseKey);
}

var DEFAULT_CHALLENGES = [
  {
    id: 'cryptid-feb-2026',
    title: 'Cryptid Chronicles',
    description: 'Document and investigate cryptid sightings from your region. Submit reports with evidence, witness accounts, and your own analysis.',
    category: 'cryptid',
    icon: '\uD83E\uDDB6',
    start_date: '2026-02-01T00:00:00Z',
    end_date: '2026-02-28T23:59:59Z',
    rules: ['Submit at least one original cryptid report', 'Include location data and date of sighting', 'Reports must follow community guidelines', 'Bonus points for photographic evidence'],
    scoring: { report_submitted: 10, evidence_attached: 5, community_upvote: 2, investigation_note: 3, connection_found: 8 },
    prizes: [
      { place: 1, badge: '\uD83E\uDD47', title: 'Master Cryptid Hunter', reward: '1 month free Pro' },
      { place: 2, badge: '\uD83E\uDD48', title: 'Expert Tracker', reward: 'Exclusive badge' },
      { place: 3, badge: '\uD83E\uDD49', title: 'Field Researcher', reward: 'Exclusive badge' }
    ],
    max_participants: 500
  },
  {
    id: 'ufo-mar-2026',
    title: 'UFO Hotspot Hunt',
    description: 'Map UFO sighting clusters and identify potential hotspot zones. Work together to build the most comprehensive aerial anomaly database.',
    category: 'ufo',
    icon: '\uD83D\uDEF8',
    start_date: '2026-03-01T00:00:00Z',
    end_date: '2026-03-31T23:59:59Z',
    rules: ['Submit UFO sighting reports with precise coordinates', 'Cross-reference with existing reports in the area', 'Document weather and lighting conditions', 'Use the connection tool to link related sightings'],
    scoring: { report_submitted: 10, evidence_attached: 5, community_upvote: 2, investigation_note: 3, connection_found: 12 },
    prizes: [
      { place: 1, badge: '\uD83E\uDD47', title: 'Sky Watch Commander', reward: '1 month free Pro' },
      { place: 2, badge: '\uD83E\uDD48', title: 'Aerial Analyst', reward: 'Exclusive badge' },
      { place: 3, badge: '\uD83E\uDD49', title: 'Spotter', reward: 'Exclusive badge' }
    ],
    max_participants: 500
  },
  {
    id: 'ghost-apr-2026',
    title: 'Haunted History',
    description: 'Research and document historical haunting reports. Connect modern sightings with historical records to build a timeline of paranormal activity.',
    category: 'ghost',
    icon: '\uD83D\uDC7B',
    start_date: '2026-04-01T00:00:00Z',
    end_date: '2026-04-30T23:59:59Z',
    rules: ['Reports must reference historical locations or events', 'Include at least one primary or secondary source', 'Document the history of the haunted location', 'Bonus for connecting to existing ParaDocs reports'],
    scoring: { report_submitted: 10, evidence_attached: 7, community_upvote: 2, investigation_note: 5, connection_found: 10 },
    prizes: [
      { place: 1, badge: '\uD83E\uDD47', title: 'Spectral Historian', reward: '1 month free Pro' },
      { place: 2, badge: '\uD83E\uDD48', title: 'Ghost Scholar', reward: 'Exclusive badge' },
      { place: 3, badge: '\uD83E\uDD49', title: 'Spirit Seeker', reward: 'Exclusive badge' }
    ],
    max_participants: 500
  }
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') { return handleGet(req, res); }
  if (req.method === 'POST') { return handlePost(req, res); }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  var supabase = getSupabase();
  var now = new Date().toISOString();

  var challengeResult = await supabase.from('community_challenges').select('*').order('start_date', { ascending: false });
  var challenges = (challengeResult.data && challengeResult.data.length > 0) ? challengeResult.data : DEFAULT_CHALLENGES;

  var participantResult = await supabase.from('challenge_participants').select('challenge_id, user_id, score, joined_at');
  var participants = participantResult.data || [];

  var enriched = challenges.map(function(ch: any) {
    var chParticipants = participants.filter(function(p: any) { return p.challenge_id === ch.id; });
    var sorted = chParticipants.slice().sort(function(a: any, b: any) { return (b.score || 0) - (a.score || 0); });
    var status = 'upcoming';
    if (now >= ch.start_date && now <= ch.end_date) { status = 'active'; }
    else if (now > ch.end_date) { status = 'completed'; }
    return {
      id: ch.id, title: ch.title, description: ch.description, category: ch.category,
      icon: ch.icon, start_date: ch.start_date, end_date: ch.end_date,
      rules: ch.rules, scoring: ch.scoring, prizes: ch.prizes, status: status,
      participant_count: chParticipants.length, max_participants: ch.max_participants || 500,
      leaderboard: sorted.slice(0, 10).map(function(p: any, i: number) {
        return { rank: i + 1, user_id: p.user_id, score: p.score || 0 };
      })
    };
  });

  return res.status(200).json({
    challenges: enriched,
    active: enriched.filter(function(c: any) { return c.status === 'active'; }),
    upcoming: enriched.filter(function(c: any) { return c.status === 'upcoming'; }),
    completed: enriched.filter(function(c: any) { return c.status === 'completed'; })
  });
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  var supabase = getSupabase();
  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) { return res.status(401).json({ error: 'Unauthorized' }); }

  var userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data.user) { return res.status(401).json({ error: 'Invalid token' }); }
  var userId = userResult.data.user.id;

  var action = req.body.action;
  var challengeId = req.body.challenge_id;
  if (!challengeId) { return res.status(400).json({ error: 'challenge_id required' }); }

  if (action === 'join') {
    var existingResult = await supabase.from('challenge_participants').select('id').eq('challenge_id', challengeId).eq('user_id', userId).single();
    if (existingResult.data) { return res.status(200).json({ message: 'Already joined', already_joined: true }); }
    var insertResult = await supabase.from('challenge_participants').insert({ challenge_id: challengeId, user_id: userId, score: 0, joined_at: new Date().toISOString() });
    if (insertResult.error) { return res.status(500).json({ error: 'Failed to join: ' + insertResult.error.message }); }
    return res.status(200).json({ message: 'Joined challenge successfully' });
  }

  if (action === 'add_score') {
    var points = req.body.points || 0;
    var reason = req.body.reason || '';
    var currentResult = await supabase.from('challenge_participants').select('score').eq('challenge_id', challengeId).eq('user_id', userId).single();
    if (!currentResult.data) { return res.status(400).json({ error: 'Not a participant in this challenge' }); }
    var newScore = (currentResult.data.score || 0) + points;
    var updateResult = await supabase.from('challenge_participants').update({ score: newScore }).eq('challenge_id', challengeId).eq('user_id', userId);
    if (updateResult.error) { return res.status(500).json({ error: 'Failed to update score' }); }
    await supabase.from('challenge_score_log').insert({ challenge_id: challengeId, user_id: userId, points: points, reason: reason, created_at: new Date().toISOString() });
    return res.status(200).json({ message: 'Score updated', new_score: newScore });
  }

  return res.status(400).json({ error: 'Invalid action. Use "join" or "add_score".' });
}
