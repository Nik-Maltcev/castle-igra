'use strict';
/* Castlelands - game flow & UI */

let ST = null;
let busy = false; // animation/turn lock

const $ = id => document.getElementById(id);

const followerNames = { city: 'City', road: 'Road', monastery: 'Monastery' };

function showFollowerChoices() {
  const choices = $('meepleChoices');
  const canChoose = ST.phase === 'meeple' && !ST.players[ST.turn].isAI && ST.meepleSpots.length;
  choices.hidden = !canChoose;
  if (!canChoose) {
    choices.replaceChildren();
    return;
  }
  const totals = {};
  const seen = {};
  for (const spot of ST.meepleSpots) totals[spot.type] = (totals[spot.type] || 0) + 1;
  const buttons = ST.meepleSpots.map(spot => {
    const name = followerNames[spot.type];
    const number = totals[spot.type] > 1 ? ' ' + ((seen[spot.type] = (seen[spot.type] || 0) + 1)) : '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'meeple-choice choice-' + spot.type;
    button.setAttribute('aria-label', 'Place follower on ' + name + number);
    button.title = 'Place follower on ' + name + number;
    const icon = document.createElement('span');
    icon.className = 'choice-icon';
    icon.textContent = '♟';
    const label = document.createElement('span');
    label.className = 'choice-label';
    label.textContent = name + number;
    button.append(icon, label);
    button.addEventListener('click', () => onSpotClick(spot));
    return button;
  });
  choices.replaceChildren(...buttons);
}

function logMsg(msg) {
  ST.log.push(msg);
  const el = $('log');
  el.innerHTML = ST.log.slice(-40).map(m => '<div>' + m + '</div>').join('');
  el.scrollTop = el.scrollHeight;
}

function refreshPanels() {
  // scores
  $('players').innerHTML = ST.players.map(p =>
    '<div class="prow' + (p.id === ST.turn ? ' active' : '') + '">' +
    '<span class="dot" style="background:' + p.color + '"></span>' +
    '<span class="pname">' + p.name + '</span>' +
    '<span class="pscore">' + p.score + '</span>' +
    '<span class="pmee">' + '♟'.repeat(p.meeples) + '</span></div>'
  ).join('');
  $('deckCount').textContent = 'Deck: ' + ST.deck.length;
  $('turnLabel').textContent = ST.phase === 'over' ? 'Game over' :
    ST.phase === 'meeple' && !ST.players[ST.turn].isAI ? 'Choose a follower or skip' :
    (ST.players[ST.turn].name + "'s turn" + (ST.players[ST.turn].isAI ? ' (thinking…)' : ''));
  const compact = window.matchMedia('(max-width: 700px)').matches;
  $('boardHelp').textContent = ST.phase === 'meeple' && !ST.players[ST.turn].isAI ?
    (compact ? 'TAP A LABELED CIRCLE · OR SKIP' : 'CLICK A LABELED CIRCLE TO PLACE A FOLLOWER · OR SKIP') :
    (compact ? 'TAP + TO PLACE · DRAG TO PAN' : 'CLICK A + TO PLACE · DRAG TO PAN · SCROLL TO ZOOM · R TO ROTATE');
  $('tileInstruction').textContent = ST.players[ST.turn].isAI ? 'The bot is choosing a place' :
    ST.phase === 'meeple' ? 'Choose a marked place, or skip' : 'Find a matching place on the map';
  $('btnRotate').disabled = ST.phase !== 'place' || ST.players[ST.turn].isAI;
  $('btnSkipMeeple').hidden = !(ST.phase === 'meeple' && !ST.players[ST.turn].isAI);
  showFollowerChoices();
}

function computeValidCells() {
  ST.validCells = [];
  for (const [x, y] of frontierCells(ST)) {
    if (canPlace(ST, x, y, ST.current.rot)) ST.validCells.push([x, y]);
  }
}

/* ---------- turn flow ---------- */
function tileHasAnyPlacement(st) {
  for (const [x, y] of frontierCells(st)) {
    for (let rot = 0; rot < 4; rot++) if (canPlace(st, x, y, rot)) return true;
  }
  return false;
}

function ensurePlayableTile(st) {
  let guard = 0;
  while (st.deck.length && !tileHasAnyPlacement(st) && guard++ < 100) {
    logMsg('No legal spot for the drawn tile — discarded, drawing another.');
    st.current = { tpl: st.deck.pop(), rot: 0 };
  }
}

async function nextTurn() {
  ST.turn = (ST.turn + 1) % ST.players.length;
  ST.justPlaced = null;
  if (!drawNextTile(ST)) { endGame(); return; }
  ensurePlayableTile(ST);
  if (!ST.deck.length && !tileHasAnyPlacement(ST)) { endGame(); return; }
  ST.phase = 'place';
  refreshPanels();
  computeValidCells();
  await maybeAI();
}

async function startTurnFor(playerIdx) {
  // used right after start tile (first turn)
  drawNextTile(ST);
  computeValidCells();
  refreshPanels();
  await maybeAI();
}

async function maybeAI() {
  if (ST.phase === 'over') return;
  const p = ST.players[ST.turn];
  if (!p.isAI) { ST.humanActing = true; busy = false; return; }
  ST.humanActing = false;
  busy = true;
  await sleep(650);
  if (ST.phase === 'over') return;
  const mv = aiChooseMove(ST, p);
  if (!mv) { logMsg('Bot has no legal move, skipping.'); await nextTurn(); return; }
  applyPlacement(mv.x, mv.y, mv.rot);
  await sleep(450);
  const spots = validMeepleSpots(ST, mv.x, mv.y);
  // AI meeple decision was part of evaluation; recompute cheaply: place meeple if spot adds value
  if (p.meeples > 0 && spots.length) {
    const spot = aiPickMeepleSpot(ST, p, mv.x, mv.y, spots);
    if (spot) { addMeeple(ST, mv.x, mv.y, p.id, spot); }
  }
  await sleep(350);
  await finishPlacement();
}

function aiPickMeepleSpot(st, p, x, y, spots) {
  // mirror of evaluation: pick highest-value spot that beats a threshold
  let best = null, bestV = 1.6;
  for (const spot of spots) {
    let v = 0;
    if (spot.type === 'monastery') {
      let around = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
        if ((dx || dy) && tileAt(st, x + dx, y + dy)) around++;
      v = around >= 8 ? 9 : 2 + around * 0.35;
    } else {
      const g = collectGroup(st, x, y, spot.segIdx, spot.type);
      if (g.complete) v = structurePoints(spot.type, g, true);
      else if (spot.type === 'city') v = g.tiles * 1.7 + g.shields * 1.6 + (g.tiles >= 3 ? 1.2 : 0);
      else v = g.tiles * 0.75;
    }
    if (v > bestV) { bestV = v; best = spot; }
  }
  return best;
}

function applyPlacement(x, y, rot) {
  placeTile(ST, x, y, rot);
  ST.phase = 'meeple';
  ST.meepleSpots = ST.players[ST.turn].meeples > 0 ? validMeepleSpots(ST, x, y) : [];
  refreshPanels();
  if (!ST.meepleSpots.length && !ST.players[ST.turn].isAI) {
    setTimeout(() => { if (ST && ST.phase === 'meeple') onSkipMeeple(); }, 350);
  }
}

async function finishPlacement() {
  const res = scoreCompletions(ST);
  if (res.length) {
    for (const r of res) {
      logMsg('Completed ' + r.type + ' — +' + r.points + ' for ' +
        r.players.map(pid => ST.players[pid].name).join(', '));
    }
    refreshPanels();
    await sleep(500);
  }
  await nextTurn();
}

/* ---------- human input hooks ---------- */
function onCellClick(cx, cy) {
  if (busy || ST.phase !== 'place' || ST.players[ST.turn].isAI) return;
  if (!canPlace(ST, cx, cy, ST.current.rot)) return;
  applyPlacement(cx, cy, ST.current.rot);
  ST.humanActing = true; // still choosing meeple
  refreshPanels();
}

async function onSpotClick(spot) {
  if (busy || ST.phase !== 'meeple') return;
  addMeeple(ST, ST.justPlaced.x, ST.justPlaced.y, ST.turn, spot);
  ST.phase = 'scoring';
  refreshPanels();
  busy = true;
  await finishPlacement();
}

async function onSkipMeeple() {
  if (busy || ST.phase !== 'meeple') return;
  ST.phase = 'scoring';
  refreshPanels();
  busy = true;
  await finishPlacement();
}

function rotateCurrent() {
  if (!ST || ST.phase !== 'place' || ST.players[ST.turn].isAI) return;
  ST.current.rot = (ST.current.rot + 1) % 4;
  computeValidCells();
}

/* ---------- game over ---------- */
function endGame() {
  ST.phase = 'over';
  window.castleSDK.gameplayStop();
  const lines = finalScoring(ST);
  refreshPanels();
  const ranked = [...ST.players].sort((a, b) => b.score - a.score);
  $('overTitle').textContent = '🏆 ' + ranked[0].name + ' wins!';
  $('overBody').innerHTML =
    lines.map(l => '<div class="fineline">' + (l.what === 'city' ? 'City' : l.what === 'road' ? 'Road' : 'Monastery') +
      ' +' + l.points + ' → ' + l.players.map(pid => ST.players[pid].name).join(', ') + '</div>').join('') +
    '<table class="scoretable"><tr><th>Player</th><th>Score</th></tr>' +
    ranked.map(p => '<tr><td><span class="dot" style="background:' + p.color + '"></span>' + p.name + '</td><td>' + p.score + '</td></tr>').join('') +
    '</table>';
  $('overModal').hidden = false;
  if (!ranked[0].isAI) window.castleSDK.happytime();
}

/* ---------- boot ---------- */
let renderReady = false;
function attachState(st) {
  render.st = st;
  render.cam = { x: 0, y: 0, scale: 1.25 };
  st.humanActing = false;
}

function startGame(ais) {
  ST = newGameState({ humans: 1, ais });
  window.castleSDK.gameplayStart();
  render.cam = { x: 0, y: 0, scale: 1.25 };
  render.hoverCell = null;
  busy = true;
  $('menuModal').hidden = true;
  $('overModal').hidden = true;
  $('log').innerHTML = '';
  logMsg('Welcome to Castlelands! Drag to pan, wheel to zoom, R to rotate.');
  if (!renderReady) {
    initRender($('board'), $('preview'), ST, {
      onCellClick, onSpotClick, onRotate: rotateCurrent,
    });
    renderReady = true;
  } else {
    attachState(ST);
  }
  drawNextTile(ST);
  ensurePlayableTile(ST);
  refreshPanels();
  computeValidCells();
  ST.turn = 0;
  ST.humanActing = true;
  refreshPanels();
  maybeAI();
  window.ST = ST; // debugging
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

window.addEventListener('keydown', e => {
  if (e.key === 'r' || e.key === 'R') rotateCurrent();
  if (e.key === 'Enter' && ST && ST.phase === 'meeple' && !e.target.closest?.('.meeple-choice')) onSkipMeeple();
});
window.addEventListener('resize', () => { if (ST) refreshPanels(); });

$('btnRotate').addEventListener('click', rotateCurrent);
$('btnSkipMeeple').addEventListener('click', onSkipMeeple);
$('zoomIn').addEventListener('click', () => { render.cam.scale = Math.min(2.5, render.cam.scale * 1.2); });
$('zoomOut').addEventListener('click', () => { render.cam.scale = Math.max(0.3, render.cam.scale / 1.2); });
$('centerMap').addEventListener('click', () => { render.cam.x = 0; render.cam.y = 0; });
$('btnStart').addEventListener('click', () => {
  const ais = parseInt($('selAis').value, 10);
  startGame(ais);
});
$('btnAgain').addEventListener('click', () => {
  $('overModal').hidden = true;
  $('menuModal').hidden = false;
});
