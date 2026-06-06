import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Packs — Domain-specific routing | mooter',
  description:
    'Moo Packs tune mooter routing for a specific stack or domain, so each prompt lands on the model best suited to that kind of work.',
};

export default function PacksLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
