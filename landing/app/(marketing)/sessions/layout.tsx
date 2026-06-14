import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Cross-session intelligence | Mooter',
  description:
    'See every Claude Code session across every project on one screen — age, prompts, tier mix, estimated savings, branch, and a 5h quota forecast. Local-first, no server.',
};

export default function SessionsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
