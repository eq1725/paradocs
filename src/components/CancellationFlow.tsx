/**
 * CancellationFlow
 *
 * Multi-step cancellation retention modal:
 * Step 1: Show what they'll lose (saved reports, streaks, AI access)
 * Step 2: Offer alternatives (downgrade, pause, discount)
 * Step 3: Feedback form + final confirmation
 */

import { useState } from 'react';

interface CancellationFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCancel: (reason: string, feedback: string) => void;
  planName: string;
  savedReports: number;
  streak: number;
  daysRemaining: number;
}

export default function CancellationFlow(props: CancellationFlowProps) {
  var isOpen = props.isOpen;
  var onClose = props.onClose;
  var onConfirmCancel = props.onConfirmCancel;
  var planName = props.planName;
  var savedReports = props.savedReports;
  var streak = props.streak;
  var daysRemaining = props.daysRemaining;

  var stepState = useState(1);
  var step = stepState[0];
  var setStep = stepState[1];

  var reasonState = useState('');
  var reason = reasonState[0];
  var setReason = reasonState[1];

  var feedbackState = useState('');
  var feedback = feedbackState[0];
  var setFeedback = feedbackState[1];

  var loadingState = useState(false);
  var isLoading = loadingState[0];
  var setIsLoading = loadingState[1];

  if (!isOpen) return null;

  var reasons = [
    { id: 'too_expensive', label: 'Too expensive' },
    { id: 'not_using', label: "I don't use it enough" },
    { id: 'missing_features', label: 'Missing features I need' },
    { id: 'found_alternative', label: 'Found an alternative' },
    { id: 'temporary', label: 'Just need a break' },
    { id: 'other', label: 'Other' }
  ];

  function handleConfirm() {
    setIsLoading(true);
    onConfirmCancel(reason, feedback);
  }

  // Step 1: Show what you'll lose
  if (step === 1) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-lg mx-4 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="px-6 pt-8 pb-6">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-900/30 border border-red-700/50 mb-4">
                <span className="text-3xl">{'\uD83D\uDE22'}</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">We{'\u2019'}d hate to see you go</h2>
              <p className="text-gray-400 text-sm">Here{'\u2019'}s what you{'\u2019'}ll lose if you cancel your {planName} plan:</p>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                <span className="text-red-400 text-lg">{'\u2717'}</span>
                <div>
                  <p className="text-sm font-medium text-gray-200">{savedReports} saved reports</p>
                  <p className="text-xs text-gray-500">Will be limited to free tier maximum</p>
                </div>
              </div>
              {streak > 0 && (
                <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                  <span className="text-red-400 text-lg">{'\u2717'}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-200">Your {streak}-day research streak</p>
                    <p className="text-xs text-gray-500">Streak tracking requires an active plan</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                <span className="text-red-400 text-lg">{'\u2717'}</span>
                <div>
                  <p className="text-sm font-medium text-gray-200">AI research assistant</p>
                  <p className="text-xs text-gray-500">Unlimited queries and advanced analysis</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                <span className="text-red-400 text-lg">{'\u2717'}</span>
                <div>
                  <p className="text-sm font-medium text-gray-200">Priority features & support</p>
                  <p className="text-xs text-gray-500">Early access to new tools and dedicated help</p>
                </div>
              </div>
            </div>

            {daysRemaining > 0 && (
              <p className="text-center text-sm text-amber-400 mb-4">
                You still have {daysRemaining} days left on your current billing period.
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 text-white font-semibold text-sm hover:from-purple-700 hover:to-violet-700 transition-all"
              >
                Keep My Plan
              </button>
              <button
                onClick={function() { setStep(2); }}
                className="flex-1 py-2.5 rounded-lg border border-gray-600 text-gray-300 font-medium text-sm hover:bg-gray-800 transition-all"
              >
                Continue Cancelling
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Offer alternatives
  if (step === 2) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-lg mx-4 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="px-6 pt-8 pb-6">
            <h2 className="text-xl font-bold text-white mb-2 text-center">Before you go...</h2>
            <p className="text-gray-400 text-sm text-center mb-6">Would any of these alternatives work for you?</p>

            <div className="space-y-3 mb-6">
              <button
                onClick={onClose}
                className="w-full text-left p-4 rounded-xl border-2 border-purple-600/50 bg-purple-900/20 hover:bg-purple-900/30 transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{'\uD83C\uDF81'}</span>
                  <div>
                    <p className="text-sm font-semibold text-purple-300">Get 30% off for 3 months</p>
                    <p className="text-xs text-gray-400">Use code STAYWITHUS at checkout</p>
                  </div>
                </div>
              </button>

              <button
                onClick={onClose}
                className="w-full text-left p-4 rounded-xl border border-gray-700 bg-gray-800/50 hover:bg-gray-800 transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{'\u23F8\uFE0F'}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-200">Pause for 1 month</p>
                    <p className="text-xs text-gray-400">Keep your data, skip the next payment</p>
                  </div>
                </div>
              </button>

              <button
                onClick={onClose}
                className="w-full text-left p-4 rounded-xl border border-gray-700 bg-gray-800/50 hover:bg-gray-800 transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{'\u2B07\uFE0F'}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-200">Downgrade to Basic ($4.99/mo)</p>
                    <p className="text-xs text-gray-400">Keep core features at a lower price</p>
                  </div>
                </div>
              </button>
            </div>

            <button
              onClick={function() { setStep(3); }}
              className="w-full py-2.5 rounded-lg text-gray-400 text-sm hover:text-gray-200 transition-colors"
            >
              None of these work for me
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Feedback + final cancel
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-300">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="px-6 pt-8 pb-6">
          <h2 className="text-xl font-bold text-white mb-2 text-center">Help us improve</h2>
          <p className="text-gray-400 text-sm text-center mb-6">Your feedback helps us build a better experience.</p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">Why are you cancelling?</label>
            <div className="space-y-2">
              {reasons.map(function(r) {
                return (
                  <button
                    key={r.id}
                    onClick={function() { setReason(r.id); }}
                    className={
                      'w-full text-left px-3 py-2 rounded-lg text-sm transition-all ' +
                      (reason === r.id
                        ? 'bg-purple-900/30 border border-purple-600/50 text-purple-300'
                        : 'bg-gray-800/50 border border-gray-700/50 text-gray-400 hover:text-gray-200')
                    }
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">Anything else you{'\u2019'}d like to share? (optional)</label>
            <textarea
              value={feedback}
              onChange={function(e) { setFeedback(e.target.value); }}
              placeholder="Your feedback helps us improve..."
              rows={3}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-600 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 text-white font-semibold text-sm hover:from-purple-700 hover:to-violet-700 transition-all"
            >
              Keep My Plan
            </button>
            <button
              onClick={handleConfirm}
              disabled={!reason || isLoading}
              className={
                'flex-1 py-2.5 rounded-lg border font-medium text-sm transition-all ' +
                (!reason || isLoading
                  ? 'border-gray-700 text-gray-500 cursor-not-allowed'
                  : 'border-red-700 text-red-400 hover:bg-red-900/20')
              }
            >
              {isLoading ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
