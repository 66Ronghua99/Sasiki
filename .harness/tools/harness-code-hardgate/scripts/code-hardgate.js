#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    repoRoot: null,
    config: null,
    phase: 'all'
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--config' && i + 1 < args.length) {
      options.config = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--phase' && i + 1 < args.length) {
      options.phase = args[i + 1];
      i += 1;
      continue;
    }
    if (!arg.startsWith('--') && options.repoRoot === null) {
      options.repoRoot = arg;
    }
  }

  if (!options.repoRoot) {
    console.error('Usage: node code-hardgate.js <repo-root> [--config <path>] [--phase contract|lint|test|all]');
    process.exit(1);
  }

  if (!['contract', 'lint', 'test', 'all'].includes(options.phase)) {
    console.error(`Invalid phase: ${options.phase}`);
    process.exit(1);
  }

  return options;
}

function resolveConfigPath(repoRoot, configArg) {
  if (!configArg) {
    return path.join(repoRoot, '.harness', 'code-hardgate.json');
  }
  if (path.isAbsolute(configArg)) {
    return configArg;
  }
  return path.join(repoRoot, configArg);
}

function readConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return {
      ok: false,
      error: `Missing config file: ${configPath}`
    };
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return {
      ok: true,
      config: JSON.parse(raw)
    };
  } catch (error) {
    return {
      ok: false,
      error: `Invalid config JSON: ${configPath}: ${error.message}`
    };
  }
}

function validateConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    errors.push('Config must be a JSON object.');
    return errors;
  }

  if (!config.version) {
    errors.push('Missing required key: version');
  }

  if (!config.artifact_dir || typeof config.artifact_dir !== 'string') {
    errors.push('Missing required key: artifact_dir');
  }

  if (!config.commands || typeof config.commands !== 'object') {
    errors.push('Missing required object: commands');
  } else {
    if (!config.commands.lint || typeof config.commands.lint !== 'string') {
      errors.push('Missing required command: commands.lint');
    }
    if (!config.commands.test || typeof config.commands.test !== 'string') {
      errors.push('Missing required command: commands.test');
    }
  }

  const policy = config.flaky_policy || {};
  if (policy.max_retries !== undefined) {
    if (!Number.isInteger(policy.max_retries) || policy.max_retries < 0) {
      errors.push('flaky_policy.max_retries must be an integer >= 0');
    }
  }
  if (policy.allow_retry_success_as_warning !== undefined) {
    if (typeof policy.allow_retry_success_as_warning !== 'boolean') {
      errors.push('flaky_policy.allow_retry_success_as_warning must be boolean');
    }
  }

  return errors;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function runShellCommand(command, cwd) {
  const startedAt = Date.now();
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf-8'
  });

  const durationMs = Date.now() - startedAt;
  const exitCode = Number.isInteger(result.status) ? result.status : 1;

  return {
    command,
    exit_code: exitCode,
    duration_ms: durationMs,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function runRequiredPhase({ phase, command, repoRoot, policy }) {
  const maxRetries = Number.isInteger(policy.max_retries) ? policy.max_retries : 0;
  const allowRetryWarning = policy.allow_retry_success_as_warning === true;
  const attempts = [];

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const runResult = runShellCommand(command, repoRoot);
    attempts.push({
      attempt,
      ...runResult
    });

    if (runResult.exit_code === 0) {
      if (attempt === 1) {
        return {
          phase,
          command,
          status: 'passed',
          attempts: attempts.length,
          duration_ms: attempts.reduce((sum, item) => sum + item.duration_ms, 0),
          attempt_results: attempts,
          message: 'Command passed.'
        };
      }

      if (allowRetryWarning) {
        return {
          phase,
          command,
          status: 'warning',
          attempts: attempts.length,
          duration_ms: attempts.reduce((sum, item) => sum + item.duration_ms, 0),
          attempt_results: attempts,
          message: 'Command passed on retry and was downgraded to warning by policy.'
        };
      }

      return {
        phase,
        command,
        status: 'failed',
        attempts: attempts.length,
        duration_ms: attempts.reduce((sum, item) => sum + item.duration_ms, 0),
        attempt_results: attempts,
        message: 'Command passed on retry but policy treats retry-success as failure.'
      };
    }
  }

  return {
    phase,
    command,
    status: 'failed',
    attempts: attempts.length,
    duration_ms: attempts.reduce((sum, item) => sum + item.duration_ms, 0),
    attempt_results: attempts,
    message: 'Command failed in all attempts.'
  };
}

function summarize(results) {
  const summary = {
    total: results.length,
    passed: 0,
    warnings: 0,
    failed: 0
  };

  for (const result of results) {
    if (result.status === 'passed') summary.passed += 1;
    if (result.status === 'warning') summary.warnings += 1;
    if (result.status === 'failed') summary.failed += 1;
  }

  return summary;
}

function buildMarkdownReport(report) {
  const lines = [];
  lines.push('# Code Hardgate Report');
  lines.push('');
  lines.push(`- Repo: ${report.repo_root}`);
  lines.push(`- Phase: ${report.phase}`);
  lines.push(`- Config: ${report.config_path}`);
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total: ${report.summary.total}`);
  lines.push(`- Passed: ${report.summary.passed}`);
  lines.push(`- Warnings: ${report.summary.warnings}`);
  lines.push(`- Failed: ${report.summary.failed}`);
  lines.push('');
  lines.push('## Results');
  lines.push('');

  for (const result of report.results) {
    lines.push(`### ${result.phase}`);
    lines.push(`- Status: ${result.status}`);
    lines.push(`- Command: ${result.command || '(n/a)'}`);
    lines.push(`- Attempts: ${result.attempts || 0}`);
    lines.push(`- Duration(ms): ${result.duration_ms || 0}`);
    lines.push(`- Message: ${result.message}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function writeReport(repoRoot, artifactDir, report) {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(repoRoot, artifactDir, runId);
  ensureDir(outputDir);

  const jsonPath = path.join(outputDir, 'report.json');
  const mdPath = path.join(outputDir, 'report.md');

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  fs.writeFileSync(mdPath, buildMarkdownReport(report), 'utf-8');

  return { outputDir, jsonPath, mdPath };
}

function main() {
  const options = parseArgs(process.argv);
  const repoRoot = path.resolve(options.repoRoot);

  if (!fs.existsSync(repoRoot) || !fs.statSync(repoRoot).isDirectory()) {
    console.error(`Invalid repository root: ${repoRoot}`);
    process.exit(1);
  }

  const configPath = resolveConfigPath(repoRoot, options.config);
  const configResult = readConfig(configPath);

  if (!configResult.ok) {
    console.error(configResult.error);
    process.exit(1);
  }

  const config = configResult.config;
  const validationErrors = validateConfig(config);
  const artifactDir = config.artifact_dir || 'artifacts/code-gate';
  const results = [];

  if (validationErrors.length > 0) {
    results.push({
      phase: 'contract',
      command: '',
      status: 'failed',
      attempts: 0,
      duration_ms: 0,
      attempt_results: [],
      message: validationErrors.join('; ')
    });
  } else {
    results.push({
      phase: 'contract',
      command: '',
      status: 'passed',
      attempts: 0,
      duration_ms: 0,
      attempt_results: [],
      message: 'Config contract is valid.'
    });
  }

  const phaseOrder = [];
  if (options.phase === 'all') {
    phaseOrder.push('lint', 'test');
  } else if (options.phase === 'lint') {
    phaseOrder.push('lint');
  } else if (options.phase === 'test') {
    phaseOrder.push('test');
  }

  const policy = config.flaky_policy || {};

  if (validationErrors.length === 0) {
    for (const phase of phaseOrder) {
      const result = runRequiredPhase({
        phase,
        command: config.commands[phase],
        repoRoot,
        policy
      });
      results.push(result);

      if (result.status === 'failed') {
        break;
      }
    }
  }

  const summary = summarize(results);
  const report = {
    schema: 'harness-code-hardgate-report.v1',
    timestamp: new Date().toISOString(),
    phase: options.phase,
    repo_root: repoRoot,
    config_path: configPath,
    summary,
    results
  };

  const output = writeReport(repoRoot, artifactDir, report);

  console.log(`Code hardgate report: ${output.jsonPath}`);
  console.log(`Passed=${summary.passed} Warning=${summary.warnings} Failed=${summary.failed}`);

  process.exit(summary.failed > 0 ? 1 : 0);
}

main();
