import { CrookOutline } from './PastorCrook';

export default function Footer() {
  return (
    <footer className="footer">
      <CrookOutline size={42} />
      <nav className="footer-cols">
        <a href="https://github.com/pauloloureiroshp-ship-it/mooter">GitHub</a>
        <a href="https://github.com/pauloloureiroshp-ship-it/mooter">Contribute</a>
      </nav>
      <a href="/dashboard">Sign in with GitHub</a>
    </footer>
  );
}
