'use client';

import { useEffect, useState } from 'react';

interface Profile {
  id: string;
  email: string;
  hardware_tier: string;
  os_type: string;
  subscriptions: string[];
  prompts_per_day_estimate: number;
  onboarding_completed: boolean;
  github_username: string | null;
  github_primary_language: string | null;
  github_public_repos_count: number;
  experience_level: string;
  frugal_config: Record<string, unknown>;
  install_completed: boolean;
  frugal_version: string | null;
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
                {profile.github_username && (
                  <>
                    <div className="dashboard-field">
                      <span className="dashboard-label">GitHub</span>
                      <span className="dashboard-val">@{profile.github_username}</span>
                    </div>
                    <div className="dashboard-field">
                      <span className="dashboard-label">Primary language</span>
                      <span className="dashboard-val">{profile.github_primary_language || '—'}</span>
                    </div>
                    <div className="dashboard-field">
                      <span className="dashboard-label">Public repos</span>
                      <span className="dashboard-val">{profile.github_public_repos_count}</span>
                    </div>
                  </>
                )}
                <div className="dashboard-field">
                  <span className="dashboard-label">Level</span>
                  <span className="dashboard-val">{profile.experience_level || 'unknown'}</span>
                </div>
              </div>
              <a href="/onboarding" className="dashboard-link">Edit profile</a>
            </div>

            {/* Savings card */}
            <div className="dashboard-card">
              <h2>Savings</h2>
              {!profile.install_completed ? (
                <div>
                  <p className="dashboard-muted">
                    We haven&apos;t detected your first prompt yet. Install frugal and start using Claude Code.
                  </p>
                  <a href="/onboarding" className="dashboard-link">View install instructions</a>
                </div>
              ) : (
                <p className="dashboard-muted">
                  Savings data will appear here once usage sessions are synced.
                </p>
              )}
            </div>

            {/* Config card */}
            <div className="dashboard-card">
              <h2>Your frugal config</h2>
              {profile.frugal_config && Object.keys(profile.frugal_config).length > 0 ? (
                <div className="dashboard-grid">
                  {Object.entries(profile.frugal_config).map(([key, val]) => (
                    <div className="dashboard-field" key={key}>
                      <span className="dashboard-label">{key.replace(/_/g, ' ')}</span>
                      <span className="dashboard-val">{String(val)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dashboard-muted">Config will be generated after onboarding.</p>
              )}
            </div>

            {/* Community */}
            <div className="dashboard-card">
              <h2>Community</h2>
              <p className="dashboard-muted">
                Your routing decisions help improve the algorithm for everyone.
              </p>
              <a
                href="https://frugal-hub.frugal-hub.workers.dev/api/stats"
                target="_blank"
                rel="noopener"
                className="dashboard-link"
              >
                View live community stats
              </a>
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
