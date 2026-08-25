#!/usr/bin/env node
/**
 * activity-classifier.js — detect patterns in recent decisions, suggest skills
 * 
 * Usage:
 *   node activity-classifier.js                           # analyze last 10 decisions
 *   node activity-classifier.js --simulate debug,debug,debug  # test with fake categories
 *   node activity-classifier.js --json                    # machine-readable
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ACTIVITY_PATTERNS = {
  'repetitive-transforms': {
    signal: (recent) => recent.filter(d => d.task_category && d.task_category.includes('transform')).length >= 3,
    suggestion: 'For repetitive transforms: /local-transformer automates this',
    skill: 'local-transformer'
  },
  'multiple-summarize': {
    signal: (recent) => recent.filter(d => d.task_category && d.task_category.includes('summariz')).length >= 3,
    suggestion: 'Reading many files? /local-summarizer can process several in parallel',
    skill: 'local-summarizer'
  },
  'debug-session': {
    signal: (recent) => recent.filter(d => d.task_category && (d.task_category.includes('debug') || d.task_category.includes('reasoning'))).length >= 3,
    suggestion: 'Debug session detected: /frugal-beast enables full-power investigation',
    skill: 'frugal-beast'
  },
  'pre-commit': {
    signal: (recent) => recent.some(d => d.prompt_preview && /commit|push|merge|deploy/i.test(d.prompt_preview)),
    suggestion: 'Before committing: /final-reviewer does automatic code review',
    skill: 'final-reviewer'
  },
  'all-opus': {
    signal: (recent) => recent.length >= 5 && recent.every(d => d.tier === 'T3'),
    suggestion: 'All prompts on Opus — consider /frugal-zen to save tokens on simple tasks',
    skill: 'frugal-zen'
  }
};

function readDecisionsLog() {
  const logPath = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
  
  if (!fs.existsSync(logPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);
    
    return lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(entry => entry && entry.event === 'classified')
      .slice(-10); // last 10
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    // Falhar a leitura e não haver decisões davam ambos "0 decisions" e
    // "No activity patterns". O chamador trata null como medição n/d.
    try { process.stderr.write(`activity-classifier: decisions.log n/d — ${err && err.message ? err.message : err}\n`); } catch { /* stderr fechado */ }
    return null;
  }
}

function createFakeDecisions(categories) {
  return categories.map((cat, idx) => ({
    event: 'classified',
    task_category: cat,
    tier: 'T1',
    prompt_preview: `Simulated ${cat} task ${idx + 1}`,
    timestamp: new Date(Date.now() - (10 - idx) * 60000).toISOString()
  }));
}

function countCategories(recent) {
  const counts = {};
  recent.forEach(d => {
    if (d.task_category) {
      counts[d.task_category] = (counts[d.task_category] || 0) + 1;
    }
  });
  return counts;
}

function analyzeActivity(recent) {
  const suggestions = [];
  const categoryCounts = countCategories(recent);

  // Check each pattern
  Object.entries(ACTIVITY_PATTERNS).forEach(([patternName, pattern]) => {
    if (pattern.signal(recent)) {
      suggestions.push({
        pattern: patternName,
        suggestion: pattern.suggestion,
        skill: pattern.skill
      });
    }
  });

  return {
    decisions_analyzed: recent.length,
    category_counts: categoryCounts,
    suggestions
  };
}

function formatTerminal(analysis) {
  if (analysis.decisions_analyzed === null) return 'Activity analysis: n/d — não consegui ler decisions.log.';
  const categoryStr = Object.entries(analysis.category_counts)
    .map(([cat, count]) => `${cat} ×${count}`)
    .join(', ');

  let output = `Activity analysis (last ${analysis.decisions_analyzed} decisions):\n`;
  
  if (categoryStr) {
    output += `  Categories: ${categoryStr}\n`;
  }

  if (analysis.suggestions.length === 0) {
    output += '\n  No activity patterns detected.';
  } else {
    output += '\n';
    analysis.suggestions.forEach(s => {
      output += `  💡 ${s.suggestion}\n`;
    });
  }

  return output;
}

function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const simulateIdx = args.indexOf('--simulate');
  
  let recent;
  
  if (simulateIdx !== -1 && args[simulateIdx + 1]) {
    const categories = args[simulateIdx + 1].split(',');
    recent = createFakeDecisions(categories);
  } else {
    recent = readDecisionsLog();
  }

  const analysis = recent === null
    ? { decisions_analyzed: null, category_counts: {}, suggestions: [], error: 'decisions.log n/d — não consegui ler' }
    : analyzeActivity(recent);

  if (isJson) {
    console.log(JSON.stringify(analysis, null, 2));
  } else {
    console.log(formatTerminal(analysis));
  }
}

// Export for inject_context.js
module.exports = { analyzeActivity };

// Run if invoked directly
if (require.main === module) {
  main();
}
