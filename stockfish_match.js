const { spawn } = require('child_process');

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function parseCliArgs(argv) {
  const opts = { first: 'trinity', movetime: 1500 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--first') opts.first = argv[++i];
    else if (arg === '--movetime') opts.movetime = Number(argv[++i]);
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node stockfish_match.js [--first trinity|stockfish] [--movetime MS]');
      process.exit(0);
    }
  }
  return opts;
}

function runPython(cmd, args) {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', ['-c', cmd, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    py.stdout.on('data', d => out += d.toString());
    py.stderr.on('data', d => err += d.toString());
    py.on('close', code => {
      if (code !== 0) return reject(new Error(err || `python exit ${code}`));
      resolve(out.trim());
    });
    setTimeout(() => py.kill(), 10000);
  });
}

async function validateMove(fen, uci) {
  const cmd = `import chess,sys
fen=sys.argv[1]
uci=sys.argv[2]
b=chess.Board(fen)
try:
    m=chess.Move.from_uci(uci)
    print('ok' if m in b.legal_moves else 'illegal')
except:
    print('bad')`;
  return runPython(cmd, [fen, uci]);
}

async function applyMove(fen, uci) {
  const cmd = `import chess,sys
fen=sys.argv[1]
uci=sys.argv[2]
b=chess.Board(fen)
m=chess.Move.from_uci(uci)
b.push(m)
print(b.fen())`;
  return runPython(cmd, [fen, uci]);
}

function spawnTrinity(enginePath, movetime) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [enginePath, '--movetime', String(movetime)], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => process.stderr.write(d.toString()));
    proc.on('close', () => resolve(out.trim()));
    proc.stdin.write(DEFAULT_FEN + '\n');
    proc.stdin.end();
    setTimeout(() => {
      resolve(out.trim());
      proc.kill();
    }, movetime + 2000);
  });
}

async function runTrinityMove(enginePath, fen, movetime) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [enginePath, '--movetime', String(movetime)], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '';
    let finished = false;

    proc.stdout.on('data', d => {
      buffer += d.toString();
      const lines = buffer.split(/\r?\n/);
      while (lines.length > 1) {
        const line = lines.shift().trim();
        buffer = lines.join('\n');
        if (line) {
          finished = true;
          resolve(line);
          proc.kill();
          return;
        }
      }
    });
    proc.stderr.on('data', d => process.stderr.write(d.toString()));
    proc.stdin.write(fen + '\n');
    proc.stdin.end();
    setTimeout(() => {
      if (!finished) {
        finished = true;
        resolve('0000');
        proc.kill();
      }
    }, movetime + 2500);
  });
}

async function createStockfish(depth) {
  const proc = spawn('node', ['node_modules/stockfish/bin/stockfish.js'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let bestMoveResolve = null;

  proc.stdout.on('data', d => {
    const lines = d.toString().split(/\r?\n/);
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (line.startsWith('bestmove')) {
        const parts = line.split(' ');
        const move = parts[1] || '0000';
        if (bestMoveResolve) {
            bestMoveResolve(move);
            bestMoveResolve = null;
        }
      }
    }
  });

  function send(cmd) {
    proc.stdin.write(cmd + '\n');
  }

  send('uci');
  await new Promise(r => setTimeout(r, 200));
  send('isready');
  await new Promise(r => setTimeout(r, 200));

  return {
    move: (fen, movetime) => new Promise((resolve) => {
      bestMoveResolve = resolve;
      send(`position fen ${fen}`);
      send(`go depth ${depth}`);
    }),
    stop: () => proc.kill()
  };
}

async function playGame(engineFile, movetime, depth) {
  const stockfish = await createStockfish(depth);
  let fen = DEFAULT_FEN;
  let result = '*';
  let moves = [];
  
  for (let ply = 0; ply < 150; ply++) {
    const isTrinity = (ply % 2 === 0);
    
    let move;
    if (isTrinity) {
      move = await runTrinityMove(engineFile, fen, movetime);
    } else {
      move = await stockfish.move(fen, movetime);
    }
    
    if (!move || move === '0000' || move === '(none)') { 
        result = isTrinity ? '0-1 (Timeout/Error)' : '1-0 (Stockfish Error)'; 
        break; 
    }
    
    const valid = await validateMove(fen, move);
    if (valid !== 'ok') { 
        result = isTrinity ? `0-1 (Trinity Illegal Move: ${move})` : `1-0 (Stockfish Illegal Move: ${move})`; 
        break; 
    }
    
    moves.push(move);
    fen = await applyMove(fen, move);
    
    // Check if game is over via python
    const stateCmd = `import chess,sys,json\nfen=sys.argv[1]\nb=chess.Board(fen)\nprint(json.dumps({'over': b.is_game_over(), 'result': b.result()}))`;
    try {
        const stateStr = await runPython(stateCmd, [fen]);
        const state = JSON.parse(stateStr);
        if (state.over) {
            result = state.result;
            break;
        }
    } catch (e) {}
  }
  
  stockfish.stop();
  return { result, moves, finalFen: fen };
}

(async () => {
  try {
    const opts = parseCliArgs(process.argv.slice(2));
    const enginePath = process.argv.includes('--engine') ? process.argv[process.argv.indexOf('--engine') + 1] : 'dist/Trinity-modular.js';
    
    console.log(`=== GAME 1: Stockfish Depth 1 ===`);
    let g1 = await playGame(enginePath, opts.movetime, 1);
    console.log(`Result: ${g1.result} | Moves: ${g1.moves.length}`);
    
    console.log(`\\n=== GAME 2: Stockfish Depth 3 ===`);
    let g2 = await playGame(enginePath, opts.movetime, 3);
    console.log(`Result: ${g2.result} | Moves: ${g2.moves.length}`);
    
    console.log(`\\n=== GAME 3: Stockfish Depth 5 ===`);
    let g3 = await playGame(enginePath, opts.movetime, 5);
    console.log(`Result: ${g3.result} | Moves: ${g3.moves.length}`);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
