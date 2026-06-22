import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Mirror the landing's brand typography (pilar/site R1): Space Grotesk for the
// UI, JetBrains Mono for the data — self-hosted via next/font, display:swap.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'frugal — Dashboard',
  description: 'Local-only routing dashboard for the frugal classifier.',
};

const NAV = [
  { href: '/', label: 'Overview', icon: '\u{1F3E0}' },
  { href: '/misroutes', label: 'Misroutes', icon: '\u{1F50D}' },
  { href: '/community', label: 'Community', icon: '\u{1F310}' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand-side">
              <span className="mascot">&#x1F415;</span>
              <span className="title">frugal</span>
              <span className="version">v0.9.7</span>
            </div>
            <nav className="nav">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} className="nav-link">
                  <span className="nav-icon">{n.icon}</span>
                  {n.label}
                </a>
              ))}
            </nav>
            <div className="sidebar-footer">
              <span className="badge">127.0.0.1:7820</span>
            </div>
          </aside>
          <div className="content">
            <main>{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
