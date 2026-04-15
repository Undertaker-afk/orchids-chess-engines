#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fen = readFileSync(0, 'utf8').trim();
const movetimeMs = Math.max(50, Number(process.env.FROSTRAINER_STOCKFISH_MS || 1200));
const stockfishPath = resolve(__dirname, '..', '..', 'node_modules', 'stockfish', 'bin', 'stockfish.js');

if (!fen) {
  console.error('Missing FEN on stdin.');
  process.exit(1);
}

if (!existsSync(stockfishPath)) {
  console.error(`Stockfish wrapper could not find engine script: ${stockfishPath}`);
  process.exit(1);
}

function waitForLine(proc, predicate, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    let stdoutBuf = '';
    let stderrBuf = '';

    const timer = setTimeout(() => {
      cleanup();
      rejectPromise(new Error(`Timed out waiting for Stockfish output. stderr=${stderrBuf.trim()}`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      proc.stdout.off('data', onStdout);
      proc.stderr.off('data', onStderr);
      proc.off('exit', onExit);
    }

    function onStdout(chunk) {
      stdoutBuf += String(chunk);
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop() || '';
      for (const line of lines) {
        if (predicate(line)) {
          cleanup();
          resolvePromise(line);
          return;
        }
      }
    }

    function onStderr(chunk) {
      stderrBuf += String(chunk);
    }

    function onExit(code) {
      cleanup();
      rejectPromise(new Error(`Stockfish exited early with code ${code}. stderr=${stderrBuf.trim()}`));
    }

    proc.stdout.on('data', onStdout);
    proc.stderr.on('data', onStderr);
    proc.on('exit', onExit);
  });
}

async function main() {
  const proc = spawn(process.execPath, [stockfishPath], { stdio: ['pipe', 'pipe', 'pipe'] });

  const send = (line) => {
    proc.stdin.write(`${line}\n`);
  };

  try {
    send('uci');
    await waitForLine(proc, (line) => line.trim() === 'uciok', 5000);
    send('isready');
    await waitForLine(proc, (line) => line.trim() === 'readyok', 5000);
    send('ucinewgame');
    send(`position fen ${fen}`);
    send(`go movetime ${movetimeMs}`);
    const bestMoveLine = await waitForLine(proc, (line) => line.startsWith('bestmove '), movetimeMs + 5000);
    const move = bestMoveLine.split(/\s+/)[1];
    if (!move) {
      throw new Error(`Unexpected bestmove line: ${bestMoveLine}`);
    }
    process.stdout.write(`${move}\n`);
    proc.kill();
  } catch (error) {
    proc.kill();
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

await main();
