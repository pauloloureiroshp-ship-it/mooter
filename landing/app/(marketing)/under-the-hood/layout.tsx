import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Under the hood — quantization, LoRA & DoRA',
  description: 'Why your laptop can run Opus-grade models now. Quantization and DoRA, in 30 seconds each.',
};

export default function UnderTheHoodLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
