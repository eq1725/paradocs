/**
 * ChallengeCard
 *
 * Display card for a community challenge — shows status, progress,
 * participant count, leaderboard preview, and join/view CTA.
 */

import { useState } from 'react';

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  score: number;
  display_name?: string;
}

interface ChallengeCardProps {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  status: string;
  start_date: string;
  end_date: string;
  participant_count: number;
  max_participants: number;
  leaderboard: LeaderboardEntry[];
  prizes: Array<{ place: number; badge: string; title: string; reward: string }>;
  rules: string[];
  isJoined?: boolean;
  userRank?: number;
  userScore?: number;
  onJoin: (challengeId: string) => void;
}

export default function ChallengeCard(props: ChallengeCardProps) {
  var id = props.id;
  var title = props.title;
  var description = props.description;
  var icon = props.icon;
  var status = props.status;
  var start_date = props.start_date;
  var end_date = props.end_date;
  var participant_count = props.participant_count;
  var max_participants = props.max_participants;
  var leaderboard = props.leaderboard;
  var prizes = props.prizes;
  var rules = props.rules;
  var isJoined = props.isJoined;
  var userRank = props.userRank;
  var userScore = props.userScore;
  var onJoin = props.onJoin;

  var expandedState = useState(false);
  var isExpanded = expandedState[0];
  var setIsExpanded = expandedState[1];

  var joiningState = useState(false);
  var isJoining = joiningState[0];
  var setIsJoining = joiningState[1];

  var now = new Date();
  var end = new Date(end_date);
  var start = new Date(start_date);
  var daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  var daysUntilStart = Math.max(0, Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  var statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    active: { label: 'Active Now', color: 'text-green-400', bg: 'bg-green-900/30 border-green-700/50' },
    upcoming: { label: 'Coming Soon', color: 'text-blue-400', bg: 'bg-blue-900/30 border-blue-700/50' },
    completed: { label: 'Completed', color: 'text-gray-400', bg: 'bg-gray-800/50 border-gray-700/50' }
  };
  var statusInfo = statusConfig[status] || statusConfig.upcoming;

  function handleJoin() { setIsJoining(true); onJoin(id); }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden hover:border-gray-600 transition-all">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-900/30 border border-purple-700/50 flex items-center justify-center text-2xl">
              {icon}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{title}</h3>
              <span className={'text-xs px-2 py-0.5 rounded-full border ' + statusInfo.bg + ' ' + statusInfo.color}>
                {statusInfo.label}
              </span>
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-400 mb-4">{description}</p>

        <div className="flex items-center gap-4 text-sm mb-4">
          <div className="flex items-center gap-1.5 text-gray-400">
            <span>{'\uD83D\uDC65'}</span>
            <span>{participant_count}/{max_participants}</span>
          </div>
          {status === 'active' && (
            <div className="flex items-center gap-1.5 text-amber-400">
              <span>{'\u23F3'}</span>
              <span>{daysLeft} days left</span>
            </div>
          )}
          {status === 'upcoming' && (
            <div className="flex items-center gap-1.5 text-blue-400">
              <span>{'\uD83D\uDCC5'}</span>
              <span>Starts in {daysUntilStart} days</span>
            </div>
          )}
          {isJoined && userRank && (
            <div className="flex items-center gap-1.5 text-purple-400">
              <span>{'\uD83C\uDFC6'}</span>
              <span>Rank #{userRank} ({userScore || 0} pts)</span>
            </div>
          )}
        </div>

        {leaderboard.length > 0 && (
          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 mb-4">
            <p className="text-xs font-medium text-gray-400 mb-2">Leaderboard</p>
            <div className="space-y-1.5">
              {leaderboard.slice(0, 3).map(function(entry) {
                var medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];
                var medal = medals[entry.rank - 1] || (entry.rank + '.');
                return (
                  <div key={entry.rank} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-center">{medal}</span>
                      <span className="text-gray-300">{entry.display_name || ('Researcher #' + entry.user_id.substring(0, 4))}</span>
                    </div>
                    <span className="text-purple-400 font-medium">{entry.score} pts</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={function() { setIsExpanded(!isExpanded); }}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
        >
          {isExpanded ? 'Hide details' : 'View rules & prizes'}
          <svg className={'w-4 h-4 transition-transform ' + (isExpanded ? 'rotate-180' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-400 mb-2">Rules</p>
              <div className="space-y-1">
                {rules.map(function(rule, i) {
                  return (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-400">
                      <span className="text-purple-400 mt-0.5">{'\u2022'}</span>
                      <span>{rule}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 mb-2">Prizes</p>
              <div className="space-y-2">
                {prizes.map(function(prize) {
                  return (
                    <div key={prize.place} className="flex items-center justify-between p-2 bg-gray-800/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{prize.badge}</span>
                        <span className="text-sm text-gray-300">{prize.title}</span>
                      </div>
                      <span className="text-xs text-purple-400">{prize.reward}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {status !== 'completed' && (
        <div className="px-5 pb-5">
          {isJoined ? (
            <div className="w-full py-2.5 rounded-lg bg-gray-800 text-center text-sm text-green-400 font-medium border border-green-700/30">
              {'\u2713'} Joined {'\u2014'} Keep submitting reports to climb the leaderboard!
            </div>
          ) : (
            <button
              onClick={handleJoin}
              disabled={isJoining || status === 'upcoming'}
              className={
                'w-full py-2.5 rounded-lg font-semibold text-sm transition-all ' +
                (status === 'upcoming'
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  : isJoining
                    ? 'bg-purple-700 text-white opacity-50 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-violet-600 text-white hover:from-purple-700 hover:to-violet-700')
              }
            >
              {isJoining ? 'Joining...' : status === 'upcoming' ? 'Opens ' + start.toLocaleDateString() : 'Join Challenge'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
