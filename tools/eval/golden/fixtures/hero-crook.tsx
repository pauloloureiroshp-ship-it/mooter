import { CrookOutline } from '@/components/PastorCrook';

export default function HeroCrook() {
  return (
    <section className="m-pad">
      <div className="hero-grid">
        <CrookOutline size={48} />
        <h1 className="hero-h1">mooter</h1>
        <p className="hero-sub">Your LLM router. Local-first. Learns forever.</p>
        <a className="" href="/dashboard">Sign in</a>
        <div className="cta-row">
          <a className="btn-primary" href="/install">Install</a>
        </div>
      </div>
    </section>
  );
}
