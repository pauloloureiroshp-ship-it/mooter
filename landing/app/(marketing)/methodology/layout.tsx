import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Methodology — How mooter decides which model | mooter',
  description:
    'How mooter classifies each prompt into a tier (T0–T3) and routes it to the cheapest model that can do the job well — local Ollama, Haiku, Sonnet or Opus.',
};

export default function MethodologyLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
