'use client';

import { useEffect, useState } from 'react';

interface Profile {
  id: string;
  email: string;
  hardware_tier: string;
  subscriptions: string[];
  prompts_per_day_estimate: number;
  ollama_available: boolean;
  onboarding_completed: boolean;
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(async (data) => {
        if (!data.userId) return;
        const res = await fetch(`/api/profile?userId=${data.userId}`);
        if (res.ok) {
          const p = await res.json();
          setProfile(p);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-container">
          <div className="dashboard-loading">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-container">
        <div className="dashboard-header">
          <a href="/" className="dashboard-brand">
            <img src="/frugal-logo.svg" alt="frugal" width={28} height={28} />
            <span>frugal</span>
          </a>
          <a href="/api/logout" className="dashboard-logout">Sign out</a>
        </div>

        <h1 className="dashboard-h1">Your dashboard</h1>

        {!profile ? (
          <div className="dashboard-card">
            <p>No profile found. <a href="/onboarding">Complete onboarding</a> to set up your profile.</p>
          </div>
        ) : (
          <>
            {/* Profile card */}
            <div className="dashboard-card">
              <h2>Profile</h2>
              <div className="dashboard-grid">
                <div className="dashboard-field">
                  <span className="dashboard-label">Email</span>
                  <span className="dashboard-val">{profile.email}</span>
                </div>
                <div className="dashboard-field">
                  <span className="dashboard-label">Hardware</span>
                  <span className="dashboard-val">{profile.hardware_tier?.replace(/_/g, ' ') || 'Not set'}</span>
                </div>
                <div className="dashboard-field">
                  <span className="dashboard-label">Subscriptions</span>
                  <span className="dashboard-val">{profile.subscriptions?.join(', ') || 'None'}</span>
                </div>
                <div className="dashboard-field">
                  <span className="dashboard-label">Prompts/day</span>
                  <span className="dashboard-val">{profile.prompts_per_day_estimate || '—'}</span>
                </div>
                <div className="dashboard-field">
                  <span className="dashboard-label">Ollama</span>
                  <span className="dashboard-val">{profile.ollama_available ? 'Available' : 'Not detected'}</span>
                </div>
              </div>
            </div>

            {/* Savings card — placeholder */}
            <div className="dashboard-card">
              <h2>Savings</h2>
              <p className="dashboard-muted">
                Awaiting first data. Start using Claude Code with frugal installed and your savings will appear here.
              </p>
            </div>

            {/* Community hub link */}
            <div className="dashboard-card">
              <h2>Community hub</h2>
              <p className="dashboard-muted">
                See live community stats at the{' '}
                <a href="https://frugal-hub.frugal-hub.workers.dev/api/stats" target="_blank" rel="noopener">
                  frugal hub API
                </a>.
              </p>
            </div>

            {/* Install on another machine */}
            <div className="dashboard-card">
              <h2>Install on another machine</h2>
              <div className="dashboard-cmd">
                <code>bash &lt;(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)</code>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
