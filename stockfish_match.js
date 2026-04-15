const { spawn } = require('child_process');

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PYTHON_CMD = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'py' : 'python3');
const PYTHON_ARGS_PREFIX = process.env.PYTHON_BIN ? [] : (process.platform === 'win32' ? ['-3'] : []);

function parseCliArgs(argv) {
  const opts = { first: 'trinity', movetime: 1500, live: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--first') opts.first = argv[++i];
    else if (arg === '--movetime') opts.movetime = Number(argv[++i]);
    else if (arg === '--live') opts.live = true;
    else if (arg === '--no-live') opts.live = false;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node stockfish_match.js [--first trinity|stockfish] [--movetime MS] [--live|--no-live]');
      process.exit(0);
    }
  }
  return opts;
}

function renderBoardFromFen(fen) {
  const [placement, turn = 'w'] = fen.split(' ');
  const ranks = placement.split('/');
  const out = [];

  for (let i = 0; i < 8; i++) {
    const rank = ranks[i] || '';
    const expanded = [];
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') {
        const n = Number(ch);
        for (let k = 0; k < n; k++) expanded.push('.');
      } else {
        expanded.push(ch);
      }
    }
    out.push(`${8 - i} ${expanded.join(' ')}`);
  }

  out.push('  a b c d e f g h');
  out.push(`Turn: ${turn === 'w' ? 'White' : 'Black'}`);
  return out.join('\n');
}

function winnerFromResult(result) {
  if (!result) return 'Unknown';
  if (result.startsWith('1-0')) return 'Trinity';
  if (result.startsWith('0-1')) return 'Stockfish';
  if (result.startsWith('1/2-1/2') || result === '*') return 'Draw';
  return 'Unknown';
}

function clearScreen() {
  // ANSI full clear + cursor home.
  process.stdout.write('\x1b[2J\x1b[H');
}

function renderLiveScreen({ gameLabel, depth, fen, ply, status, winner, trinityMoves, stockfishMoves, moveFeed, seriesStats }) {
  clearScreen();

  if (seriesStats) {
    console.log(`Scoreboard | Trinity W:${seriesStats.trinityWins} D:${seriesStats.draws} L:${seriesStats.stockfishWins} | Stockfish W:${seriesStats.stockfishWins} D:${seriesStats.draws} L:${seriesStats.trinityWins}`);
    console.log(`Points    | Trinity ${seriesStats.trinityPoints} - ${seriesStats.stockfishPoints} Stockfish | Completed ${seriesStats.gamesCompleted}/${seriesStats.totalGames}`);
    console.log('='.repeat(72));
  }

  console.log(`Stockfish vs Trinity | ${gameLabel} | Depth ${depth}`);
  console.log('-'.repeat(72));
  console.log(`Status: ${status}`);
  console.log(`Winner: ${winner || 'TBD'}`);
  console.log(`Ply: ${ply}`);
  console.log('');

  console.log(renderBoardFromFen(fen));
  console.log('');

  const recentFeed = moveFeed.slice(-14);
  console.log('Recent Moves:');
  if (recentFeed.length === 0) {
    console.log('  (none)');
  } else {
    for (const line of recentFeed) console.log(`  ${line}`);
  }

  console.log('');
  console.log(`Trinity Moves (${trinityMoves.length}): ${trinityMoves.join(' ') || '-'}`);
  console.log(`Stockfish Moves (${stockfishMoves.length}): ${stockfishMoves.join(' ') || '-'}`);
  console.log('');
  console.log('Press Ctrl+C to stop.');
}

function runPython(cmd, args) {
  return new Promise((resolve, reject) => {
    const py = spawn(PYTHON_CMD, [...PYTHON_ARGS_PREFIX, '-c', cmd, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    py.stdout.on('data', d => out += d.toString());
    py.stderr.on('data', d => err += d.toString());
    py.on('close', code => {
      if (code !== 0) {
        if ((err || '').includes("No module named 'chess'")) {
          return reject(new Error(`${err.trim()}\n\nInstall dependency: py -m pip install chess`));
        }
        return reject(new Error(err || `python exit ${code}`));
      }
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

async function playGame(engineFile, movetime, depth, live, gameLabel, seriesStats) {
  const stockfish = await createStockfish(depth);
  let fen = DEFAULT_FEN;
  let result = '*';
  let moves = [];
  let status = 'running';
  let winner = 'TBD';
  const moveFeed = [];
  const trinityMoves = [];
  const stockfishMoves = [];

  if (live) {
    renderLiveScreen({ gameLabel, depth, fen, ply: 0, status, winner, trinityMoves, stockfishMoves, moveFeed, seriesStats });
  }
  
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
      status = isTrinity ? 'Trinity timeout/error' : 'Stockfish timeout/error';
      winner = winnerFromResult(result);
        break; 
    }
    
    const valid = await validateMove(fen, move);
    if (valid !== 'ok') { 
        result = isTrinity ? `0-1 (Trinity Illegal Move: ${move})` : `1-0 (Stockfish Illegal Move: ${move})`;
        status = isTrinity ? `Trinity illegal move: ${move}` : `Stockfish illegal move: ${move}`;
        winner = winnerFromResult(result);
        break; 
    }
    
    moves.push(move);
    if (isTrinity) trinityMoves.push(move);
    else stockfishMoves.push(move);

    const fullmove = Math.floor(ply / 2) + 1;
    moveFeed.push(`${fullmove}${isTrinity ? 'w' : 'b'} ${isTrinity ? 'Trinity' : 'Stockfish'}: ${move}`);

    fen = await applyMove(fen, move);

    if (live) {
      status = `last move: ${fullmove}${isTrinity ? 'w' : 'b'} ${move}`;
      renderLiveScreen({
        gameLabel,
        depth,
        fen,
        ply: ply + 1,
        status,
        winner,
        trinityMoves,
        stockfishMoves,
        moveFeed,
        seriesStats,
      });
    }
    
    // Check if game is over via python
    const stateCmd = `import chess,sys,json\nfen=sys.argv[1]\nb=chess.Board(fen)\nprint(json.dumps({'over': b.is_game_over(), 'result': b.result()}))`;
    try {
        const stateStr = await runPython(stateCmd, [fen]);
        const state = JSON.parse(stateStr);
        if (state.over) {
            result = state.result;
            status = `game over: ${result}`;
            winner = winnerFromResult(result);
            break;
        }
    } catch (e) {}
  }

  if (winner === 'TBD') winner = winnerFromResult(result);

  if (live) {
    renderLiveScreen({
      gameLabel,
      depth,
      fen,
      ply: moves.length,
      status: `${status} | result: ${result}`,
      winner,
      trinityMoves,
      stockfishMoves,
      moveFeed,
      seriesStats,
    });
  }

  stockfish.stop();
  return { result, winner, moves, finalFen: fen };
}

(async () => {
  try {
    const opts = parseCliArgs(process.argv.slice(2));
    const enginePath = process.argv.includes('--engine') ? process.argv[process.argv.indexOf('--engine') + 1] : 'dist/Trinity-modular.js';
    const seriesStats = {
      trinityWins: 0,
      stockfishWins: 0,
      draws: 0,
      trinityPoints: 0,
      stockfishPoints: 0,
      gamesCompleted: 0,
      totalGames: 3,
    };

    console.log(`=== GAME 1: Stockfish Depth 1 ===`);
    let g1 = await playGame(enginePath, opts.movetime, 1, opts.live, 'G1-D1', seriesStats);
    if (g1.result.startsWith('1-0')) {
      seriesStats.trinityWins += 1;
      seriesStats.trinityPoints += 1;
    } else if (g1.result.startsWith('0-1')) {
      seriesStats.stockfishWins += 1;
      seriesStats.stockfishPoints += 1;
    } else {
      seriesStats.draws += 1;
      seriesStats.trinityPoints += 0.5;
      seriesStats.stockfishPoints += 0.5;
    }
    seriesStats.gamesCompleted += 1;
    console.log(`Result: ${g1.result} | Winner: ${g1.winner} | Moves: ${g1.moves.length}`);
    
    console.log(`\\n=== GAME 2: Stockfish Depth 3 ===`);
    let g2 = await playGame(enginePath, opts.movetime, 3, opts.live, 'G2-D3', seriesStats);
    if (g2.result.startsWith('1-0')) {
      seriesStats.trinityWins += 1;
      seriesStats.trinityPoints += 1;
    } else if (g2.result.startsWith('0-1')) {
      seriesStats.stockfishWins += 1;
      seriesStats.stockfishPoints += 1;
    } else {
      seriesStats.draws += 1;
      seriesStats.trinityPoints += 0.5;
      seriesStats.stockfishPoints += 0.5;
    }
    seriesStats.gamesCompleted += 1;
    console.log(`Result: ${g2.result} | Winner: ${g2.winner} | Moves: ${g2.moves.length}`);
    
    console.log(`\\n=== GAME 3: Stockfish Depth 5 ===`);
    let g3 = await playGame(enginePath, opts.movetime, 5, opts.live, 'G3-D5', seriesStats);
    if (g3.result.startsWith('1-0')) {
      seriesStats.trinityWins += 1;
      seriesStats.trinityPoints += 1;
    } else if (g3.result.startsWith('0-1')) {
      seriesStats.stockfishWins += 1;
      seriesStats.stockfishPoints += 1;
    } else {
      seriesStats.draws += 1;
      seriesStats.trinityPoints += 0.5;
      seriesStats.stockfishPoints += 0.5;
    }
    seriesStats.gamesCompleted += 1;
    console.log(`Result: ${g3.result} | Winner: ${g3.winner} | Moves: ${g3.moves.length}`);

    console.log('\n=== FINAL SERIES SCORE ===');
    console.log(`Trinity:   ${seriesStats.trinityPoints}`);
    console.log(`Stockfish: ${seriesStats.stockfishPoints}`);
    console.log(`Wins/Draws/Losses (Trinity): ${seriesStats.trinityWins}/${seriesStats.draws}/${seriesStats.stockfishWins}`);
    if (seriesStats.trinityPoints > seriesStats.stockfishPoints) console.log('Series Winner: Trinity');
    else if (seriesStats.stockfishPoints > seriesStats.trinityPoints) console.log('Series Winner: Stockfish');
    else console.log('Series Winner: Draw');
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
