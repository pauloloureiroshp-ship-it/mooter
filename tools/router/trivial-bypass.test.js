const { classifyDiff } = require('./trivial-bypass');

console.log('TEST 1: Landing page — 1 ícone deletado (7cbfbf0)\n');
console.log('Command: git diff 35c19f9 7cbfbf0 --stat');
console.log('Result: landing/app/page.tsx | 1 -');
console.log('Expected: ✅ TRIVIAL (skip gates)\n');

console.log('---\n');

console.log('TEST 2: VSCode extension — 180+ insertions (f5f0cb7)\n');
console.log('Command: git diff 35c19f9 f5f0cb7 --stat');
console.log('Result: 7 files changed, 219 insertions(+), 86 deletions(-)');
console.log('Expected: ❌ SUBSTANTIAL (require T2/T3 gates)\n');

console.log('---\n');

console.log('TEST 3: SPLIT SCENARIO (what SHOULD have happened)\n');
console.log('Branch A (feat/landing-icon-fix): 1 commit, 1 line');
console.log('  → Classify: ✅ TRIVIAL');
console.log('  → Auto-merge & deploy (20s)\n');

console.log('Branch B (feat/vscode-cockpit): 1 commit, 7 files, 219 insertions');
console.log('  → Classify: ❌ SUBSTANTIAL');
console.log('  → Normal flow: PR → Ollama analysis → final-reviewer → merge (10min)\n');

console.log('Total time (parallel): 10 min + 20s overhead = ~10 min');
console.log('Actual time (mixed): 15 min + all gates on both branches = ~15 min');
console.log('Savings if split: ~5 min + $0.15-0.20 Opus cost saved\n');

console.log('---\n');

console.log('LESSON: Never mix T0 (trivial) with T2+ (substantial) in same PR.');
console.log('Trivial changes should auto-deploy; substantial should use gates.\n');
