// Shared stub helper for the Wave 28 skeleton.
//
// Every src/ module is a signature-only stub until its phase lands. They call
// notImplemented() instead of importing the heavy/native deps declared in
// package.json — so the package loads (and its smoke tests run) without a
// native `npm install`. See docs/strategy/WAVE28_DAY0_FINDINGS.md.

export type Phase = "C" | "D" | "E" | "F" | "G" | "H" | "I";

export class NotImplementedError extends Error {
  readonly feature: string;
  readonly phase: Phase;
  constructor(feature: string, phase: Phase) {
    super(
      `[wave28] '${feature}' is not implemented yet — lands in Phase ${phase}. ` +
        `See docs/strategy/WAVE28_WORKFLOW_ENGINE_KICKOFF.md`,
    );
    this.name = "NotImplementedError";
    this.feature = feature;
    this.phase = phase;
  }
}

export function notImplemented(feature: string, phase: Phase): never {
  throw new NotImplementedError(feature, phase);
}
