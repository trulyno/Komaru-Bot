import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';

const projectRoot = path.resolve(__dirname, '..');

interface DeployOptions {
    targetDir: string;
    dryRun: boolean;
    skipTests: boolean;
    restart: boolean;
}

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};

function logStep(step: number, total: number, title: string): void {
    console.log(`\n${colors.cyan}${colors.bright}[Stage ${step}/${total}] ${title}${colors.reset}`);
    console.log(`${colors.dim}${'='.repeat(50)}${colors.reset}`);
}

function logSuccess(msg: string): void {
    console.log(`${colors.green}✔ ${msg}${colors.reset}`);
}

function logWarning(msg: string): void {
    console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`);
}

function logError(msg: string): void {
    console.error(`${colors.red}✖ ${msg}${colors.reset}`);
}

function parseArgs(): DeployOptions {
    const args = process.argv.slice(2);
    let targetDir = process.env.PROD_DIR || path.resolve(projectRoot, '../komarubot-prod');
    let dryRun = false;
    let skipTests = false;
    let restart = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--target' || arg === '-t') {
            if (i + 1 < args.length) {
                targetDir = path.resolve(process.cwd(), args[++i]);
            } else {
                logError('Missing value for --target flag');
                process.exit(1);
            }
        } else if (arg.startsWith('--target=')) {
            targetDir = path.resolve(process.cwd(), arg.split('=')[1]);
        } else if (arg === '--dry-run') {
            dryRun = true;
        } else if (arg === '--skip-tests') {
            skipTests = true;
        } else if (arg === '--restart') {
            restart = true;
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
${colors.bright}Komaru the Cat Production Deployment Pipeline${colors.reset}

${colors.yellow}Usage:${colors.reset}
  npm run deploy [-- [OPTIONS]]
  ./deploy.sh [OPTIONS]
  ts-node scripts/deploy.ts [OPTIONS]

${colors.yellow}Options:${colors.reset}
  -t, --target <path>    Target production directory (default: /home/komarubot-prod)
  --dry-run              Run all quality checks and simulate deployment without modifying target
  --skip-tests           Skip test execution (NOT recommended for production)
  --restart              Attempt to restart the production bot if running
  -h, --help             Show this help screen
`);
            process.exit(0);
        }
    }

    return { targetDir, dryRun, skipTests, restart };
}

function runCommand(
    command: string,
    args: string[],
    cwd: string = projectRoot,
    env: Record<string, string> = {},
): boolean {
    const fullEnv = { ...process.env, ...env };
    console.log(`${colors.dim}> ${command} ${args.join(' ')}${colors.reset}`);
    const result = spawnSync(command, args, {
        cwd,
        stdio: 'inherit',
        env: fullEnv,
    });

    if (result.error) {
        logError(`Failed to execute: ${command} ${args.join(' ')}: ${result.error.message}`);
        return false;
    }

    return result.status === 0;
}

function copyRecursiveSync(
    src: string,
    dest: string,
    options: { preserveExisting?: boolean } = {},
): void {
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const entries = fs.readdirSync(src);
        for (const entry of entries) {
            copyRecursiveSync(path.join(src, entry), path.join(dest, entry), options);
        }
    } else {
        if (options.preserveExisting && fs.existsSync(dest)) {
            // Preserve existing file (do not overwrite)
            return;
        }
        const parentDir = path.dirname(dest);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.copyFileSync(src, dest);
    }
}

function getGitInfo(): { commit: string; branch: string } {
    let commit = 'unknown';
    let branch = 'unknown';
    try {
        commit = execSync('git rev-parse --short HEAD', { cwd: projectRoot, stdio: 'pipe' })
            .toString()
            .trim();
    } catch {
        // ignore
    }
    try {
        branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot, stdio: 'pipe' })
            .toString()
            .trim();
    } catch {
        // ignore
    }
    return { commit, branch };
}

async function main(): Promise<void> {
    const options = parseArgs();
    const totalStages = options.skipTests ? 8 : 9;
    let currentStage = 1;

    console.log(
        `\n${colors.magenta}${colors.bright}====================================================${colors.reset}`,
    );
    console.log(
        `${colors.magenta}${colors.bright}   Komaru the Cat — Production Deployment Pipeline      ${colors.reset}`,
    );
    console.log(
        `${colors.magenta}${colors.bright}====================================================${colors.reset}`,
    );
    console.log(`Source Directory:  ${colors.cyan}${projectRoot}${colors.reset}`);
    console.log(`Target Directory:  ${colors.cyan}${options.targetDir}${colors.reset}`);
    console.log(
        `Dry Run Mode:      ${options.dryRun ? colors.yellow + 'ENABLED' : colors.green + 'DISABLED'}${colors.reset}`,
    );
    console.log(
        `Skip Tests:        ${options.skipTests ? colors.yellow + 'YES' : colors.green + 'NO'}${colors.reset}`,
    );

    // Stage 1: Lint Check
    logStep(currentStage++, totalStages, 'Code Quality & Lint Check');
    const lintSuccess = runCommand('node', ['scripts/lint.js', '.'], projectRoot);
    if (!lintSuccess) {
        logError('Pipeline failed at Stage 1: Linting errors detected.');
        logError('Production deployment aborted. Target environment was NOT modified.');
        process.exit(1);
    }
    logSuccess('Lint check passed with 0 errors.');

    // Stage 2: Type Check
    logStep(currentStage++, totalStages, 'TypeScript Type Checking');
    const typecheckSuccess = runCommand(
        'npx',
        ['tsc', '-p', 'tsconfig.json', '--noEmit'],
        projectRoot,
    );
    if (!typecheckSuccess) {
        logError('Pipeline failed at Stage 2: TypeScript type errors detected.');
        logError('Production deployment aborted. Target environment was NOT modified.');
        process.exit(1);
    }
    logSuccess('TypeScript type check passed.');

    // Stage 3: Automated Test Suite (Optional via --skip-tests)
    if (!options.skipTests) {
        logStep(currentStage++, totalStages, 'Automated Test Suite Execution');
        const testSuccess = runCommand('npx', ['ts-node', 'tests/runTests.ts'], projectRoot);
        if (!testSuccess) {
            logError('Pipeline failed at Stage 3: One or more test suites failed.');
            logError('Production deployment aborted. Target environment was NOT modified.');
            process.exit(1);
        }
        logSuccess('All automated test suites passed successfully.');
    }

    // Stage 4: Production Build
    logStep(currentStage++, totalStages, 'Compiling TypeScript to Production Bundle (dist/)');
    const distPath = path.join(projectRoot, 'dist');
    if (fs.existsSync(distPath)) {
        fs.rmSync(distPath, { recursive: true, force: true });
    }
    const buildSuccess = runCommand('npx', ['tsc', '-p', 'tsconfig.json'], projectRoot);
    if (!buildSuccess) {
        logError('Pipeline failed at Stage 4: TypeScript compilation failed.');
        logError('Production deployment aborted. Target environment was NOT modified.');
        process.exit(1);
    }
    logSuccess('TypeScript compilation generated dist/ successfully.');

    // Stage 5: Build Output Verification
    logStep(currentStage++, totalStages, 'Verifying Build Integrity & Critical Artifacts');
    const requiredBuildFiles = [
        path.join(distPath, 'index.js'),
        path.join(distPath, 'commandRegistry.js'),
        path.join(distPath, 'moduleLoader.js'),
        path.join(distPath, 'logger.js'),
        path.join(distPath, 'config', 'index.js'),
    ];

    let missingFiles = 0;
    for (const file of requiredBuildFiles) {
        if (!fs.existsSync(file)) {
            logError(`Missing critical compiled artifact: ${file}`);
            missingFiles++;
        }
    }

    if (missingFiles > 0) {
        logError(
            `Pipeline failed at Stage 5: ${missingFiles} critical build artifacts are missing.`,
        );
        process.exit(1);
    }
    logSuccess(
        'Build output verified: Core entrypoint, registry, module loader, and configs are present.',
    );

    if (options.dryRun) {
        console.log(
            `\n${colors.yellow}${colors.bright}[DRY RUN] All quality gates and build verification succeeded.${colors.reset}`,
        );
        console.log(
            `${colors.yellow}No files were written to ${options.targetDir} because --dry-run is active.${colors.reset}`,
        );
        process.exit(0);
    }

    // Stage 6: Target Environment Preparation
    logStep(currentStage++, totalStages, 'Preparing Production Environment Directory');
    if (!fs.existsSync(options.targetDir)) {
        fs.mkdirSync(options.targetDir, { recursive: true });
        logSuccess(`Created production target directory: ${options.targetDir}`);
    } else {
        logSuccess(`Target directory exists: ${options.targetDir}`);
    }

    // Stage 7: Deploy Files & Preserve Production State
    logStep(
        currentStage++,
        totalStages,
        'Deploying Compiled Code, Assets & Preserving Runtime State',
    );

    // 7.1 Deploy dist/
    const targetDist = path.join(options.targetDir, 'dist');
    if (fs.existsSync(targetDist)) {
        fs.rmSync(targetDist, { recursive: true, force: true });
    }
    copyRecursiveSync(distPath, targetDist);
    logSuccess('Deployed clean dist/ bundle.');

    // 7.2 Deploy package.json and package-lock.json
    fs.copyFileSync(
        path.join(projectRoot, 'package.json'),
        path.join(options.targetDir, 'package.json'),
    );
    if (fs.existsSync(path.join(projectRoot, 'package-lock.json'))) {
        fs.copyFileSync(
            path.join(projectRoot, 'package-lock.json'),
            path.join(options.targetDir, 'package-lock.json'),
        );
    }
    logSuccess('Synced package manifest and lockfile.');

    // 7.3 Deploy run.sh script & set executable
    const targetRunScript = path.join(options.targetDir, 'run.sh');
    fs.copyFileSync(path.join(projectRoot, 'run.sh'), targetRunScript);
    try {
        fs.chmodSync(targetRunScript, 0o755);
    } catch {
        // ignore on non-posix
    }
    logSuccess('Deployed production run.sh runner script.');

    // 7.4 Sync data/ directory (Preserving existing user state)
    const sourceDataDir = path.join(projectRoot, 'data');
    const targetDataDir = path.join(options.targetDir, 'data');
    if (fs.existsSync(sourceDataDir)) {
        copyRecursiveSync(sourceDataDir, targetDataDir, { preserveExisting: true });
        logSuccess(
            'Synced data directory (existing production data preserved without overwriting).',
        );
    }

    // 7.5 Setup .env in production
    const targetEnv = path.join(options.targetDir, '.env');
    const exampleEnv = path.join(projectRoot, '.env.example');
    if (!fs.existsSync(targetEnv)) {
        if (fs.existsSync(exampleEnv)) {
            fs.copyFileSync(exampleEnv, targetEnv);
            logWarning(
                'Production .env was created from .env.example. Make sure to configure production DISCORD_TOKEN in it!',
            );
        } else {
            logWarning('No .env found in production and .env.example is missing.');
        }
    } else {
        logSuccess('Existing production .env configuration preserved.');
    }

    // 7.6 Ensure logs directory exists in production
    const targetLogs = path.join(options.targetDir, 'logs');
    if (!fs.existsSync(targetLogs)) {
        fs.mkdirSync(targetLogs, { recursive: true });
    }

    // Stage 8: Install Production Dependencies
    logStep(
        currentStage++,
        totalStages,
        'Installing Production Dependencies in Target Environment',
    );
    const installSuccess = runCommand(
        'npm',
        ['install', '--omit=dev', '--legacy-peer-deps'],
        options.targetDir,
    );
    if (!installSuccess) {
        logError('Failed to install production dependencies in target directory.');
        process.exit(1);
    }
    logSuccess('Production dependencies installed cleanly.');

    // Stage 9: Generate Deployment Manifest
    logStep(currentStage++, totalStages, 'Generating Deployment Manifest');
    const gitInfo = getGitInfo();
    let pkgVersion = '0.1.0';
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
        pkgVersion = pkg.version || '0.1.0';
    } catch {
        // ignore
    }

    const manifest = {
        name: 'komaru-bot',
        version: pkgVersion,
        deployedAt: new Date().toISOString(),
        gitCommit: gitInfo.commit,
        gitBranch: gitInfo.branch,
        nodeVersion: process.version,
        sourceDirectory: projectRoot,
        targetDirectory: options.targetDir,
        status: 'SUCCESS',
    };

    fs.writeFileSync(
        path.join(options.targetDir, 'deployment_info.json'),
        JSON.stringify(manifest, null, 4),
        'utf-8',
    );
    logSuccess('Deployment manifest written to deployment_info.json.');

    // Final Summary & Process Management
    console.log(
        `\n${colors.green}${colors.bright}====================================================${colors.reset}`,
    );
    console.log(
        `${colors.green}${colors.bright}   ✔ PRODUCTION DEPLOYMENT COMPLETED SUCCESSFULLY!  ${colors.reset}`,
    );
    console.log(
        `${colors.green}${colors.bright}====================================================${colors.reset}`,
    );
    console.log(`Location:     ${colors.cyan}${options.targetDir}${colors.reset}`);
    console.log(
        `Manifest:     ${colors.cyan}${path.join(options.targetDir, 'deployment_info.json')}${colors.reset}`,
    );
    console.log(`\n${colors.bright}How to start/run the production bot:${colors.reset}`);
    console.log(`  cd ${options.targetDir} && ./run.sh --loop`);
    console.log(`  Or in a screen session:`);
    console.log(`  screen -S komaru-prod ${options.targetDir}/run.sh --loop\n`);

    if (options.restart) {
        console.log(
            `${colors.cyan}[INFO] Checking for active production bot processes...${colors.reset}`,
        );
        try {
            // Check if screen session komaru-prod or similar exists
            const screenList = execSync('screen -ls || true', { stdio: 'pipe' }).toString();
            if (screenList.includes('komaru-prod')) {
                console.log(
                    `${colors.green}[INFO] Found screen session 'komaru-prod'. Sending restart signal...${colors.reset}`,
                );
                execSync('screen -S komaru-prod -X stuff "^C\n" || true');
                execSync(
                    `screen -S komaru-prod -X stuff "cd ${options.targetDir} && ./run.sh --loop\n" || true`,
                );
                logSuccess("Restart command sent to screen session 'komaru-prod'.");
            } else {
                logWarning("No active screen session named 'komaru-prod' found. Start one with:");
                console.log(`  screen -S komaru-prod ${options.targetDir}/run.sh --loop`);
            }
        } catch (err: any) {
            logWarning(`Could not auto-restart process: ${err?.message || err}`);
        }
    }
}

main().catch((err) => {
    logError(`Deployment pipeline crashed: ${err?.stack || err}`);
    process.exit(1);
});
