import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [, , nodeEnv, command, ...args] = process.argv;

if (!nodeEnv || !command) {
  console.error('Usage: node scripts/run-with-node-env.mjs <NODE_ENV> <command> [...args]');
  process.exit(1);
}

const commands = {
  node: {
    command: process.execPath,
    args,
  },
  tsx: {
    command: process.execPath,
    args: [fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url)), ...args],
  },
};

const resolved = commands[command] ?? { command, args };

const child = spawn(resolved.command, resolved.args, {
  env: {
    ...process.env,
    NODE_ENV: nodeEnv,
  },
  stdio: 'inherit',
  windowsHide: true,
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
