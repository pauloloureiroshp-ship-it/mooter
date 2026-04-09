/**
 * POST /api/retrain — runs `backtest.js && update-router.js` locally.
 *
 * Query params:
 *   - dry_run: 'true' | 'false' (default: 'true')
 *     When true, runs `update-router.js --dry-run` so the response shows the
 *     block that WOULD be written, without touching classify.js.
 *
 * Returns:
 *   { backtest_stdout, update_stdout, dry_run, success }
 *
 * Safety:
 *   - Only listens on 127.0.0.1 (enforced by Next.js dev server flags).
 *   - Runs the same scripts the scheduled task runs — no new attack surface.
 *   - Hard-coded 30s timeout; 10k stdout cap.
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { frugalRoot } from '@/app/lib/paths';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

type RunResult = { code: number | null; stdout: string; stderr: string };

function runNode(script: string, args: string[] = []): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      windowsHide: true,
      timeout: 30_000,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    const cap = (s: string) => (s.length < 10_000 ? s : s.slice(0, 10_000) + '\n...[truncated]');
    child.stdout?.on('data', (d) => { stdout = cap(stdout + d.toString()); });
    child.stderr?.on('data', (d) => { stderr = cap(stderr + d.toString()); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: stderr + String(err) }));
  });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const dryRun = (url.searchParams.get('dry_run') || 'true') === 'true';

  const root = frugalRoot();
  const backtest = join(root, 'backtest.js');
  const updateRouter = join(root, 'update-router.js');

  const backtestResult = await runNode(backtest);
  if (backtestResult.code !== 0) {
    return NextResponse.json({
      success: false,
      stage: 'backtest',
      ...backtestResult,
    }, { status: 500 });
  }

  const updateArgs = dryRun ? ['--dry-run'] : [];
  const updateResult = await runNode(updateRouter, updateArgs);

  return NextResponse.json({
    success: updateResult.code === 0,
    dry_run: dryRun,
    backtest_stdout: backtestResult.stdout,
    update_stdout: updateResult.stdout,
    update_stderr: updateResult.stderr || null,
  });
}
