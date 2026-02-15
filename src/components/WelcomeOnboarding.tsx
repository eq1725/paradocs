import React from 'react';

interface WelcomeOnboardingProps {
  onComplete: () => void;
  userId?: string;
  authToken?: string;
}

export default function WelcomeOnboarding({ onComplete }: WelcomeOnboardingProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.85)',
      }}
    >
      <div style={{ background: '#1a1a2e', borderRadius: 16, padding: 32, maxWidth: 480, width: '100%', color: 'white', textAlign: 'center' as const }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Welcome to ParaDocs</h2>
        <p style={{ color: '#9ca3af', marginTop: 8, fontSize: 14 }}>Explore the unknown</p>
        <button
          onClick={() => {
            if (typeof window !== 'undefined') {
              localStorage.setItem('paradocs_welcome_complete', 'true');
            }
            onComplete();
          }}
          style={{
            marginTop: 24,
            padding: '10px 24px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, #5b63f1, #4f46e5)',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Start Exploring
        </button>
      </div>
    </div>
  );
}

export function hasCompletedWelcome(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('paradocs_welcome_complete') === 'true';
}

export function resetWelcome(): void {
  localStorage.removeItem('paradocs_welcome_complete');
}
