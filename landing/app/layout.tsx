import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'frugal — Route smarter. Spend less.',
  description:
    '~90% cost savings on Claude Code prompts. Zero proxy, doctrine-based router that classifies every prompt in under 50ms.',
  openGraph: {
    title: 'frugal — Route smarter. Spend less.',
    description: '~90% cost savings on Claude Code prompts. Validated on 1,437 real prompts.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
