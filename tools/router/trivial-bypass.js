#!/usr/bin/env node

/**
 * trivial-bypass.js — Auto-detect and bypass approval gates for trivial changes
 *
 * Purpose: Eliminate wasteful approval overhead for T0 changes
 * (1 ícone removido, typo fix, comentário, rename) while keeping gates
 * for substantial work (VSCode extension, router, CI/CD).
 *
 * Returns: { isTrivial: boolean, reason: string, skipGates: boolean }
 */

const fs = require('fs');
const { execSync } = require('child_process');

// Dangerous files that ALWAYS require full gates, even if 1 line changed
const DANGEROUS_PATTERNS = [
  /^\.env/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^tsconfig/,
  /^jest\.config/,
  /^\.github\/workflows/,
  /^tools\/router\/classify\.js$/, // FROZEN classifier
  /^\.github\/actions/,
  /^Dockerfile/,
  /^docker-compose/,
  /supabase\/migrations/,
  /\/migrations\/.*\.sql$/,
];

const TRIVIAL_PATTERNS = [
  /\.(md|txt)$/, // Docs, changelogs
  /\.css$/, // Only if isolated colors/spacing
  /\.stories\.(ts|tsx)$/, // Storybook only
];

/**
 * Classify a git diff as trivial (T0 — skip gates) or not
 * @param {string} headRef - branch to analyze (e.g., "HEAD", "feat/branch")
 * @param {string} baseRef - compare against (e.g., "origin/main")
 */
function classifyDiff(headRef = 'HEAD', baseRef = 'origin/main') {
  try {
    // Get diff stat: files changed, insertions, deletions
    const diffStat = execSync(`git diff ${baseRef}...${headRef} --stat`, {
      encoding: 'utf-8',
    }).trim();

    const lines = diffStat.split('\n');
    const summaryLine = lines[lines.length - 1]; // "X files changed, Y insertions(+), Z deletions(-)"

    // Parse: "2 files changed, 3 insertions(+), 1 deletion(-)"
    const filesMatch = summaryLine.match(/(\d+) files? changed/);
    const insertMatch = summaryLine.match(/(\d+) insertions?\(\+\)/);
    const deleteMatch = summaryLine.match(/(\d+) deletions?\(−|-\)/);

    const filesChanged = filesMatch ? parseInt(filesMatch[1], 10) : 0;
    const insertions = insertMatch ? parseInt(insertMatch[1], 10) : 0;
    const deletions = deleteMatch ? parseInt(deleteMatch[1], 10) : 0;
    const totalChanges = insertions + deletions;

    // Get list of changed files
    const diffFiles = execSync(`git diff ${baseRef}...${headRef} --name-only`, {
      encoding: 'utf-8',
    })
      .trim()
      .split('\n')
      .filter((f) => f.length > 0);

    // Rule 1: Dangerous file touched → NOT trivial (require full gate)
    for (const file of diffFiles) {
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(file)) {
          return {
            isTrivial: false,
            reason: `DANGEROUS_FILE: ${file} touched (requires full gate)`,
            skipGates: false,
            filesChanged,
            totalChanges,
            diffFiles,
          };
        }
      }
    }

    // Rule 2: Only 1 file AND very small change → TRIVIAL
    if (filesChanged === 1 && totalChanges <= 5) {
      const file = diffFiles[0];
      // But check content — is it just whitespace or comments?
      const diffContent = execSync(`git diff ${baseRef}...${headRef} -- "${file}"`, {
        encoding: 'utf-8',
      });

      // Count actual code changes (not just +/- lines, but semantic changes)
      const codeAdditions = (diffContent.match(/^\+[^+]/gm) || []).length;
      const codeDeletions = (diffContent.match(/^-[^-]/gm) || []).length;

      if (codeAdditions + codeDeletions <= 3) {
        return {
          isTrivial: true,
          reason: `SINGLE_FILE_TRIVIAL: "${file}" changed ${totalChanges} lines (${codeAdditions} adds, ${codeDeletions} deletes)`,
          skipGates: true,
          filesChanged,
          totalChanges,
          diffFiles,
        };
      }
    }

    // Rule 3: Multi-file but all trivial (e.g., 3 typo fixes, 2 README updates)
    if (filesChanged <= 3 && totalChanges <= 8) {
      const allTrivialExt = diffFiles.every((f) => TRIVIAL_PATTERNS.some((p) => p.test(f)));
      if (allTrivialExt) {
        return {
          isTrivial: true,
          reason: `MULTI_TRIVIAL: ${filesChanged} files, all docs/styling, ${totalChanges} total changes`,
          skipGates: true,
          filesChanged,
          totalChanges,
          diffFiles,
        };
      }
    }

    // Rule 4: Single commit, single file, code changes but small
    try {
      const commitCount = execSync(`git log ${baseRef}...${headRef} --oneline`, {
        encoding: 'utf-8',
      })
        .trim()
        .split('\n').length;

      if (commitCount === 1 && filesChanged === 1 && totalChanges <= 8) {
        return {
          isTrivial: true,
          reason: `SINGLE_COMMIT_SINGLE_FILE: 1 commit, 1 file, ${totalChanges} changes`,
          skipGates: true,
          filesChanged,
          totalChanges,
          diffFiles,
        };
      }
    } catch (e) {
      // Ignore commit count check if it fails
    }

    // Default: NOT trivial (require gates)
    return {
      isTrivial: false,
      reason: `SUBSTANTIAL_CHANGE: ${filesChanged} files, ${totalChanges} changes (threshold: <=5 for 1 file)`,
      skipGates: false,
      filesChanged,
      totalChanges,
      diffFiles,
    };
  } catch (error) {
    return {
      isTrivial: false,
      reason: `CLASSIFIER_ERROR: ${error.message}`,
      skipGates: false,
      error: true,
    };
  }
}

/**
 * Suggest actions based on classification
 */
function suggestAction(classification) {
  const { isTrivial, skipGates, filesChanged, totalChanges } = classification;

  if (skipGates && isTrivial) {
    return {
      action: 'AUTO_MERGE_DEPLOY',
      steps: [
        'git add .',
        'git commit -m "chore: trivial update (auto-approved)"',
        'git push',
        'gh pr merge --auto --merge (or delete branch if no PR)',
        'Vercel deploys immediately',
      ],
      estimatedTime: '20-30 seconds',
      costSavings: 'Skip $0.15-0.20 Opus gate',
    };
  }

  return {
    action: 'NORMAL_FLOW',
    steps: [
      'Create PR',
      'Run local Ollama analysis (free)',
      'Run final-reviewer gate (Opus)',
      'Merge & deploy',
    ],
    estimatedTime: '10-15 minutes',
    costSavings: 'None (full gates required)',
  };
}

// CLI invocation
if (require.main === module) {
  const headRef = process.argv[2] || 'HEAD';
  const baseRef = process.argv[3] || 'origin/main';

  const result = classifyDiff(headRef, baseRef);
  const action = suggestAction(result);

  console.log('=== TRIVIAL-BYPASS CLASSIFIER ===\n');
  console.log(`Analyzing: ${headRef} vs ${baseRef}\n`);
  console.log(`Result: ${result.isTrivial ? '✅ TRIVIAL' : '❌ SUBSTANTIAL'}`);
  console.log(`Reason: ${result.reason}`);
  console.log(`Files: ${result.filesChanged}, Changes: ${result.totalChanges}`);
  if (result.diffFiles) {
    console.log(`Files touched: ${result.diffFiles.join(', ')}`);
  }
  console.log(`\nSuggested action: ${action.action}`);
  console.log(`Estimated time: ${action.estimatedTime}`);
  if (action.costSavings) {
    console.log(`Cost savings: ${action.costSavings}`);
  }
  console.log(`\nSteps:`);
  action.steps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));

  // Exit code 0 if trivial (can auto-merge), 1 if substantial (needs gates)
  process.exit(result.skipGates ? 0 : 1);
}

module.exports = { classifyDiff, suggestAction };
