/**
 * PaywallGate
 *
 * Full-screen modal overlay shown when a user hits their free-tier limit
 * and tries to perform a gated action (submit report, save, AI query, etc).
 *
 * Shows what they lose by not upgrading plus a Stripe Checkout CTA.
 */

import { useState } from 'react';
import { useRouter } from 'next/router';

interface PaywallGateProps {
  isOpen: boolean;
  onClose: () => void;
  featureName: string;
  tierName: string;
  usageLabel: string;
  usedCount: number;
  limitCount: number;
}

export default function PaywallGate(props: PaywallGateProps) {
  var isOpen = props.isOpen;
  var onClose = props.onClose;
  var featureName = props.featureName;
  var tierName = props.tierName;
  var usageLabel = props.usageLabel;
  var usedCount = props.usedCount;
  var limitCount = props.limitCount;

  var loadingState = useState(false);
  var isLoading = loadingState[0];
  var setIsLoading = loadingState[1];

  var selectedState = useState('pro');
  var selectedPlan = selectedState[0];
  var setSelectedPlan = selectedState[1];

  var router = useRouter();

  if (!isOpen) return null;

  var plans = [
    {
      id: 'basic',
      name: 'Basic',
      price: '$9',
      period: '/mo',
      features: [
        '25 reports per month',
        '100 saved reports',
        'Basic analytics',
        'Email alerts'
      ],
      color: 'border-blue-600',
      btnClass: 'bg-blue-600 hover:bg-blue-700'
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$29',
      period: '/mo',
      badge: 'Most Popular',
      features: [
        'Unlimited reports',
        'Unlimited saves',
        'AI research assistant',
        'Advanced pattern detection',
        'Priority support',
        'Research journal with AI summaries'
      ],
      color: 'border-purple-600',
      btnClass: 'bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700'
    }
  ];

  async function handleCheckout() {
    setIsLoading(true);
    try {
      var resp = await fetch('/api/subscription/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan })
      });
      var data = await resp.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        alert('Error: ' + data.error);
        setIsLoading(false);
      }
    } catch (err) {
      alert('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 z-10"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center px-6 pt-8 pb-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-900/50 border border-purple-700/50 mb-4">
            <span className="text-3xl">{'\uD83D\uDD12'}</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            You{'\u2019'}ve reached your {tierName} limit
          </h2>
          <p className="text-gray-400 text-sm">
            You{'\u2019'}ve used {usedCount} of {limitCount} {usageLabel} this month.
            Upgrade to continue using {featureName}.
          </p>
        </div>

        {/* What you're missing */}
        <div className="px-6 pb-4">
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
            <p className="text-sm font-medium text-gray-300 mb-2">Without upgrading, you{'\u2019'}ll lose access to:</p>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <span className="text-red-400">{'\u2717'}</span>
                <span>Submit new reports</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-red-400">{'\u2717'}</span>
                <span>AI research assistant</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-red-400">{'\u2717'}</span>
                <span>Save unlimited reports</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-red-400">{'\u2717'}</span>
                <span>Pattern detection</span>
              </div>
            </div>
          </div>
        </div>

        {/* Plan cards */}
        <div className="px-6 pb-4">
          <div className="grid grid-cols-2 gap-3">
            {plans.map(function(plan) {
              var isSelected = selectedPlan === plan.id;
              return (
                <button
                  key={plan.id}
                  onClick={function() { setSelectedPlan(plan.id); }}
                  className={
                    'relative text-left p-4 rounded-xl border-2 transition-all ' +
                    (isSelected ? plan.color + ' bg-gray-800' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600')
                  }
                >
                  {plan.badge && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-purple-600 text-white text-xs font-medium rounded-full whitespace-nowrap">
                      {plan.badge}
                    </span>
                  )}
                  <div className="mb-2">
                    <span className="text-sm font-medium text-gray-300">{plan.name}</span>
                  </div>
                  <div className="mb-3">
                    <span className="text-2xl font-bold text-white">{plan.price}</span>
                    <span className="text-gray-500 text-sm">{plan.period}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {plan.features.map(function(f, j) {
                      return (
                        <li key={j} className="flex items-start gap-1.5 text-xs text-gray-400">
                          <span className="text-purple-400 mt-0.5">{'\u2713'}</span>
                          <span>{f}</span>
                        </li>
                      );
                    })}
                  </ul>
                </button>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="px-6 pb-6">
          <button
            onClick={handleCheckout}
            disabled={isLoading}
            className={
              'w-full py-3 rounded-lg text-white font-semibold text-sm transition-all ' +
              (isLoading ? 'opacity-50 cursor-not-allowed bg-purple-700' : 'bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 shadow-lg shadow-purple-900/30')
            }
          >
            {isLoading ? 'Redirecting to checkout...' : 'Upgrade Now'}
          </button>
          <p className="text-center text-xs text-gray-500 mt-2">
            Cancel anytime. 7-day money-back guarantee.
          </p>
        </div>
      </div>
    </div>
  );
}
