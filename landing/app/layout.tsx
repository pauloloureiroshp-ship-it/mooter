import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'frugal — Route smarter. Spend less.',
  description:
    '~90% cost savings on Claude Code prompts. Zero proxy router that classifies every prompt in under 50ms.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'frugal — Route smarter. Spend less.',
    description: '~90% cost savings on Claude Code prompts. Validated on months of real developer usage.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body>{children}</body>
    </html>
  );
}
