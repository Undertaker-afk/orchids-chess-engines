#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const ENGINE_PATH = process.env.ENGINE_PATH
    ? path.resolve(process.env.ENGINE_PATH)
    : path.resolve(__dirname, '..', 'dist', 'Trinity-modular.compact.js');

const API_URL = process.env.CHESS_API_URL || 'https://chess-api.com/v1';
const API_DEPTH = Number(process.env.CHESS_API_DEPTH || 8);
const API_THINK_MS = Number(process.env.CHESS_API_THINK_MS || 1000);
const MAX_CASES = Number(process.env.MAX_CASES || 6);

const TEST_FENS = [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 2 3',
    'r2q1rk1/pp2bppp/2npbn2/2p1p3/2P1P3/2N1BN2/PPQ2PPP/R3KB1R w KQ - 0 9',
    '8/2k5/8/8/8/8/4K3/7Q w - - 0 1',
    'r1bq1rk1/ppp2ppp/2np1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7',
    '2r2rk1/pp3ppp/2n1bn2/2qp4/3P4/2PBPN2/PP3PPP/R2Q1RK1 w - - 2 12'
];

function extractApiMove(json) {
    if (!json || typeof json !== 'object') return null;
    const fields = ['move', 'bestmove', 'bestMove', 'uci'];
    for (const key of fields) {
        const value = json[key];
        if (typeof value === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value.trim())) {
            return value.trim();
        }
    }

    if (typeof json.from === 'string' && typeof json.to === 'string') {
        const promo = typeof json.promotion === 'string' ? json.promotion.toLowerCase() : '';
        const move = `${json.from}${json.to}${promo}`;
        if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) return move;
    }

    return null;
}

function createEngineProcess() {
    const proc = spawn(process.execPath, [ENGINE_PATH], { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stderr.on('data', (data) => process.stderr.write(`[engine] ${data}`));
    return proc;
}

function requestEngineMove(proc, fen) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error(`Engine timed out for fen: ${fen}`));
        }, 10_000);

        const onData = (chunk) => {
            buffer += chunk.toString('utf8');
            const idx = buffer.indexOf('\n');
            if (idx === -1) return;
            const line = buffer.slice(0, idx).trim();
            cleanup();
            resolve(line);
        };

        const onExit = () => {
            cleanup();
            reject(new Error('Engine process exited before responding'));
        };

        function cleanup() {
            clearTimeout(timeout);
            proc.stdout.off('data', onData);
            proc.off('exit', onExit);
        }

        proc.stdout.on('data', onData);
        proc.once('exit', onExit);
        proc.stdin.write(`${fen}\n`);
    });
}

async function requestApiMove(fen) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, depth: API_DEPTH, maxThinkingTime: API_THINK_MS })
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    const move = extractApiMove(json);
    return { move, raw: json };
}

async function main() {
    const proc = createEngineProcess();
    let compared = 0;
    let agreed = 0;

    try {
        for (const fen of TEST_FENS.slice(0, Math.max(1, MAX_CASES))) {
            const [engineMove, api] = await Promise.all([
                requestEngineMove(proc, fen),
                requestApiMove(fen)
            ]);

            if (!api.move) {
                console.log(`FEN: ${fen}`);
                console.log(`  engine: ${engineMove || '(none)'}`);
                console.log(`  api: (unparseable) ${JSON.stringify(api.raw)}`);
                continue;
            }

            compared++;
            const match = engineMove === api.move;
            if (match) agreed++;

            console.log(`FEN: ${fen}`);
            console.log(`  engine: ${engineMove || '(none)'}`);
            console.log(`  api:    ${api.move}`);
            console.log(`  match:  ${match ? 'yes' : 'no'}`);
        }

        console.log(`Compared: ${compared}`);
        console.log(`Exact matches: ${agreed}`);
        console.log(`Agreement: ${compared ? ((agreed * 100) / compared).toFixed(1) : '0.0'}%`);
    } finally {
        proc.kill('SIGTERM');
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
