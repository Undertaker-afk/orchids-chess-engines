const el = (id) => document.getElementById(id);
let activeId = null;
let timer = null;

const PIECE_UNICODE = {
  p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚',
  P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔'
};

function boardFromFen(fen) {
  const [placement] = String(fen || '').split(' ');
  const ranks = (placement || '').split('/');
  const board = [];

  for (let r = 0; r < 8; r++) {
    const row = [];
    const rank = ranks[r] || '';
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') {
        for (let k = 0; k < Number(ch); k++) row.push('.');
      } else {
        row.push(ch);
      }
    }
    while (row.length < 8) row.push('.');
    board.push(row.slice(0, 8));
  }

  while (board.length < 8) board.push(['.', '.', '.', '.', '.', '.', '.', '.']);
  return board;
}

function renderBoard(fen) {
  const board = boardFromFen(fen);
  const root = el('board');
  root.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'board-wrap';

  for (let r = 0; r < 8; r++) {
    const row = document.createElement('div');
    row.className = 'board-row';
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      sq.className = `sq ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
      const pc = board[r][c];
      sq.textContent = PIECE_UNICODE[pc] || '';
      row.appendChild(sq);
    }
    wrap.appendChild(row);
  }

  root.appendChild(wrap);
  const coords = document.createElement('div');
  coords.className = 'coords';
  coords.textContent = 'a b c d e f g h';
  root.appendChild(coords);
}

async function loadDefaults() {
  const res = await fetch('/api/defaults');
  const cfg = await res.json();
  for (const k of Object.keys(cfg)) {
    const node = el(k);
    if (!node) continue;
    node.value = String(cfg[k]);
  }
}

function readConfig() {
  return {
    enginePath: el('enginePath').value,
    stockfishPath: el('stockfishPath').value,
    movetimeMs: Number(el('movetimeMs').value),
    maxPlies: Number(el('maxPlies').value),
    coachEveryNPlies: Number(el('coachEveryNPlies').value),
    coachEnabled: el('coachEnabled').value === 'true'
  };
}

function renderState(state) {
  el('state').innerHTML = `
    <div>Status: <b>${state.status}</b></div>
    <div>Result: <b>${state.result}</b></div>
    <div>Winner: <b>${state.winner}</b></div>
    <div>Ply: <b>${state.ply}</b></div>
    <div>Trinity moves: <b>${state.trinityMoves.length}</b></div>
    <div>Stockfish moves: <b>${state.stockfishMoves.length}</b></div>
    <div>Started: ${state.startedAt || '-'}</div>
    <div>Ended: ${state.endedAt || '-'}</div>
    ${state.error ? `<div style="color:#ff8f8f;">Error: ${state.error}</div>` : ''}
  `;

  el('fen').textContent = state.fen;
  renderBoard(state.fen);

  el('moves').textContent = state.moves
    .map(m => `${String(m.ply).padStart(3)} | ${m.engine.padEnd(9)} | ${m.moveUci} | legal=${m.legal}`)
    .join('\n');

  el('insights').textContent = state.insights
    .map(i => `Ply ${i.ply} @ ${i.timestamp}\n${i.summary}\n${'-'.repeat(48)}`)
    .join('\n');
}

async function poll() {
  if (!activeId) return;
  const res = await fetch(`/api/matches/${activeId}`);
  if (!res.ok) return;
  const state = await res.json();
  renderState(state);
  if (state.status === 'finished' || state.status === 'error') {
    clearInterval(timer);
    timer = null;
  }
}

async function startMatch() {
  const cfg = readConfig();
  const res = await fetch('/api/matches/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg)
  });

  const data = await res.json();
  activeId = data.id;
  el('meta').textContent = `Match ID: ${activeId}`;

  if (timer) clearInterval(timer);
  timer = setInterval(poll, 700);
  await poll();
}

el('startBtn').addEventListener('click', startMatch);
loadDefaults();
