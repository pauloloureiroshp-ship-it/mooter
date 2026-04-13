#!/usr/bin/env node
/**
 * feedback-collector.js — collect quality feedback on routing decisions
 * 
 * Usage:
 *   node feedback-collector.js --rate good               # rate last decision as good
 *   node feedback-collector.js --rate bad                 # rate last decision as bad  
 *   node feedback-collector.js --rate good --decision-id abc123  # rate specific decision
 *   node feedback-collector.js --stats                    # show feedback stats
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DECISIONS_LOG = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rate') {
      result.rate = args[i + 1];
      i++;
    } else if (args[i] === '--decision-id') {
      result.decisionId = args[i + 1];
      i++;
    } else if (args[i] === '--stats') {
      result.stats = true;
    }
  }
  
  return result;
}

function readDecisionsLog() {
  if (!fs.existsSync(DECISIONS_LOG)) {
    return [];
  }
  
  const content = fs.readFileSync(DECISIONS_LOG, 'utf8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function findLastClassifiedDecision(decisions, decisionId) {
  if (decisionId) {
    // Find by session_id match
    return decisions.reverse().find(d => d.session_id && d.session_id.includes(decisionId));
  }
  
  // Find last classified event
  for (let i = decisions.length - 1; i >= 0; i--) {
    if (decisions[i].event === 'classified') {
      return decisions[i];
    }
  }
  
  return null;
}

function formatTierLabel(tier) {
  const labels = {
    'T0': 'T0',
    'T1': 'T1',
    'T2': 'T2',
    'T3': 'T3'
  };
  return labels[tier] || tier;
}

function rateDecision(quality) {
  const decisions = readDecisionsLog();
  
  if (decisions.length === 0) {
    console.error('✗ No decisions logged yet. Make some routing decisions first.');
    process.exit(1);
  }
  
  const args = parseArgs();
  const targetDecision = findLastClassifiedDecision(decisions, args.decisionId);
  
  if (!targetDecision) {
    console.error('✗ No classified decision found.');
    process.exit(1);
  }
  
  const feedbackEntry = {
    ts: new Date().toISOString(),
    event: 'quality_feedback',
    session_id: targetDecision.session_id || 'unknown',
    tier: targetDecision.tier || 'unknown',
    task_category: targetDecision.task_category || 'unknown',
    followup_quality: quality === 'good' ? 1 : 0
  };
  
  fs.appendFileSync(DECISIONS_LOG, JSON.stringify(feedbackEntry) + '\n');
  
  const tierLabel = formatTierLabel(targetDecision.tier);
  const categoryLabel = targetDecision.task_category || 'general';
  const qualityLabel = quality === 'good' ? 'good' : 'bad';
  
  console.log(`✓ Rated last decision as ${qualityLabel} (${tierLabel} · ${categoryLabel} · session ${targetDecision.session_id})`);
  
  if (quality === 'bad') {
    console.log('  → This feedback will help improve future routing decisions.');
  }
}

function showStats() {
  const decisions = readDecisionsLog();
  const feedbackEntries = decisions.filter(d => d.event === 'quality_feedback');
  
  if (feedbackEntries.length === 0) {
    console.log('No quality feedback collected yet.');
    process.exit(0);
  }
  
  // Group by tier and task_category
  const grouped = {};
  feedbackEntries.forEach(entry => {
    const key = `${entry.tier}:${entry.task_category}`;
    if (!grouped[key]) {
      grouped[key] = { good: 0, bad: 0, tier: entry.tier, category: entry.task_category };
    }
    if (entry.followup_quality === 1) {
      grouped[key].good++;
    } else {
      grouped[key].bad++;
    }
  });
  
  console.log('Quality feedback summary:');
  
  let totalGood = 0;
  let totalBad = 0;
  
  Object.keys(grouped).sort().forEach(key => {
    const stats = grouped[key];
    const total = stats.good + stats.bad;
    const percent = Math.round((stats.good / total) * 100);
    const tierLabel = formatTierLabel(stats.tier);
    
    console.log(`  ${tierLabel} ${stats.category}:${' '.repeat(Math.max(0, 20 - (tierLabel.length + stats.category.length)))}${stats.good} good / ${stats.bad} bad  (${percent}%)`);
    
    totalGood += stats.good;
    totalBad += stats.bad;
  });
  
  const overallPercent = Math.round((totalGood / (totalGood + totalBad)) * 100);
  console.log();
  console.log(`  Total: ${totalGood + totalBad} rated decisions · Overall: ${overallPercent}% good`);
}

const args = parseArgs();

if (args.rate === 'good') {
  rateDecision('good');
} else if (args.rate === 'bad') {
  rateDecision('bad');
} else if (args.stats) {
  showStats();
} else {
  console.log(`Usage:
  node feedback-collector.js --rate good               # rate last decision as good
  node feedback-collector.js --rate bad                 # rate last decision as bad
  node feedback-collector.js --rate good --decision-id abc123  # rate specific decision
  node feedback-collector.js --stats                    # show feedback stats`);
}
