import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Onboarding — Set up mooter for your stack | mooter',
  description:
    'Set up mooter in one command: auto-detect your GPU and subscriptions, pick your packs, and start routing every prompt to the right model.',
};

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
