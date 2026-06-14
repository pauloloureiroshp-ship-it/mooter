import type { Metadata } from 'next';
import CockpitShowcase from './CockpitShowcase';

// Wave 60 — port of _handoff/mock/export-source/mooter-v1-cockpit.jsx
// (CockpitArtboard) into a real marketing page. Server component holds the
// metadata; the interactive VS Code mock lives in the client child.

export const metadata: Metadata = {
  title: "Cockpit — the router in your VS Code sidebar | mooter",
  description:
    'The Mooter router, rendered into a 300px VS Code sidebar: five tabs (Cockpit, Setup, Herd, Decisions, Doctor), honest savings, the Mooter Score, and a native-feeling chrome that inherits the editor theme. Interactive mock — all data is illustrative.',
};

export default function CockpitPage() {
  return <CockpitShowcase />;
}
