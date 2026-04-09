import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'frugal — Dashboard',
  description: 'Local-only routing dashboard for the frugal classifier.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="brand">
            <span className="mascot">🐕</span>
            <span className="title">frugal</span>
            <span className="version">v0.9.0</span>
            <span className="badge">dashboard · 127.0.0.1:7820</span>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
