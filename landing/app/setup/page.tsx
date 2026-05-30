import { redirect } from 'next/navigation';

// /setup was replaced by /install in the Wave 4 Phase A redesign. Kept as a
// redirect because the (out-of-scope, Phase B) onboarding page still links here.
export default function SetupRedirect() {
  redirect('/install');
}
