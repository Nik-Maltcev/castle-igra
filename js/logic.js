'use strict';
/* Castlelands - rules engine */

const TILE = 100; // world units per tile side

function keyOf(x, y) { return x + ',' + y; }

const PLAYER_COLORS = ['#e5484d', '#3b82f6', '#22c55e', '#eab308', '#a855f7'];

function newGameState(setup) {
  const players = [];
  const total = setup.humans + setup.ais;
  for (let i = 0; i < total; i++) {
    players.push({
      id: i,
      name: i < setup.humans ? ('Player ' + (i + 1)) : ('Bot ' + (i - setup.humans + 1)),
      isAI: i >= setup.humans,
      color: PLAYER_COLORS[i],
      score: 0,
      meeples: 7,
    });
  }
  const state = {
    players: players,
    board: new Map(),   // "x,y" -> placed tile entry
    deck: buildDeck(),
    turn: 0,
    phase: 'place',     // place | meeple | over
    current: null,      // {tpl, rot}
    justPlaced: null,   // {x,y} of tile in meeple phase
    floaters: [],       // score popups
    log: [],
  };
  // start tile at origin
  state.board.set(keyOf(0, 0), { tpl: 0, rot: 0, meeples: [] });
  state.current = { tpl: state.deck.pop(), rot: 0 };
  return state;
}

function tileAt(st, x, y) { return st.board.get(keyOf(x, y)); }

function canPlace(st, x, y, rot) {
  if (tileAt(st, x, y)) return false;
  const t = rotatedTemplate(st.current.tpl, rot);
  let touches = false;
  for (let d = 0; d < 4; d++) {
    const nb = tileAt(st, x + EDGE_DIRS[d][0], y + EDGE_DIRS[d][1]);
    if (!nb) continue;
    touches = true;
    const nbT = rotatedTemplate(nb.tpl, nb.rot);
    if (t.edges[d] !== nbT.edges[(d + 2) % 4]) return false;
  }
  return true; // free cells adjacent to nothing are filtered by caller
}

// frontier = empty cells adjacent to at least one tile
function frontierCells(st) {
  const out = [];
  const seen = new Set();
  for (const k of st.board.keys()) {
    const [x, y] = k.split(',').map(Number);
    for (let d = 0; d < 4; d++) {
      const nx = x + EDGE_DIRS[d][0], ny = y + EDGE_DIRS[d][1];
      const nk = keyOf(nx, ny);
      if (!st.board.has(nk) && !seen.has(nk)) { seen.add(nk); out.push([nx, ny]); }
    }
  }
  return out;
}

function placeTile(st, x, y, rot) {
  const entry = { tpl: st.current.tpl, rot: rot, meeples: [] };
  st.board.set(keyOf(x, y), entry);
  st.justPlaced = { x, y };
  return entry;
}

/* BFS over connected city/road segments starting from (x,y,segIdx).
 * Returns { cells, tiles, shields, meeples, complete } */
function collectGroup(st, x, y, segIdx, type) {
  const start = tileAt(st, x, y);
  const groups = type === 'city' ? rotatedTemplate(start.tpl, start.rot).city
                                 : rotatedTemplate(start.tpl, start.rot).road;
  const seen = new Set([x + ',' + y + ':' + segIdx]);
  const queue = [{ x, y, segIdx }];
  const cells = [];
  const meeples = [];
  let tiles = 0, shields = 0, complete = true;
  while (queue.length) {
    const node = queue.shift();
    const t = tileAt(st, node.x, node.y);
    const def = rotatedTemplate(t.tpl, t.rot);
    const seg = (type === 'city' ? def.city : def.road)[node.segIdx];
    cells.push(node);
    tiles++;
    if (def.shield && type === 'city') shields++;
    for (const m of t.meeples) if (m.type === type && m.segIdx === node.segIdx) meeples.push(m);
    for (const e of seg) {
      const nx = node.x + EDGE_DIRS[e][0], ny = node.y + EDGE_DIRS[e][1];
      const nb = tileAt(st, nx, ny);
      if (!nb) { complete = false; continue; }
      const nbDef = rotatedTemplate(nb.tpl, nb.rot);
      const opp = (e + 2) % 4;
      const nbGroups = type === 'city' ? nbDef.city : nbDef.road;
      let linked = false;
      for (let si = 0; si < nbGroups.length; si++) {
        if (nbGroups[si].includes(opp)) {
          const nk = nx + ',' + ny + ':' + si;
          if (!seen.has(nk)) { seen.add(nk); queue.push({ x: nx, y: ny, segIdx: si }); }
          linked = true;
          break;
        }
      }
      if (!linked) complete = false; // neighbor edge is field/other type
    }
  }
  return { cells, tiles, shields, meeples, complete };
}

// segments of the just-placed tile that can host a new meeple
function validMeepleSpots(st, x, y) {
  const t = tileAt(st, x, y);
  const def = rotatedTemplate(t.tpl, t.rot);
  const spots = [];
  const check = (type, count) => {
    for (let si = 0; si < count; si++) {
      const g = collectGroup(st, x, y, si, type);
      if (g.meeples.length === 0) spots.push({ type, segIdx: si });
    }
  };
  check('city', def.city.length);
  check('road', def.road.length);
  if (def.monastery) {
    const has = t.meeples.some(m => m.type === 'monastery');
    if (!has) spots.push({ type: 'monastery', segIdx: 0 });
  }
  return spots;
}

function addMeeple(st, x, y, playerId, spot) {
  const p = st.players[playerId];
  if (p.meeples <= 0) return false;
  const t = tileAt(st, x, y);
  t.meeples.push({ type: spot.type, segIdx: spot.segIdx, player: playerId });
  p.meeples--;
  return true;
}

function structurePoints(type, group, complete) {
  if (type === 'city') return complete ? group.tiles * 2 + group.shields * 2
                                       : group.tiles + group.shields;
  return group.tiles; // road: 1 per tile
}

/* Score every completed structure touching the just-placed tile.
 * Returns array of {players:[ids], points, x, y} */
function scoreCompletions(st) {
  const { x, y } = st.justPlaced;
  const t = tileAt(st, x, y);
  const def = rotatedTemplate(t.tpl, t.rot);
  const results = [];
  const handled = [];
  const scan = (type, count) => {
    for (let si = 0; si < count; si++) {
      const g = collectGroup(st, x, y, si, type);
      const sig = g.cells.map(c => c.x + ',' + c.y + ':' + c.segIdx).sort().join('|');
      if (handled.includes(sig)) continue;
      handled.push(sig);
      if (!g.complete || g.meeples.length === 0) continue;
      const pts = structurePoints(type, g, true);
      const owners = [...new Set(g.meeples.map(m => m.player))];
      for (const pid of owners) st.players[pid].score += pts;
      // remove all meeples sitting on the group's segments, return to owners
      for (const c of g.cells) {
        const ct = tileAt(st, c.x, c.y);
        const removed = ct.meeples.filter(m => m.type === type && m.segIdx === c.segIdx);
        if (removed.length) {
          ct.meeples = ct.meeples.filter(m => !(m.type === type && m.segIdx === c.segIdx));
          for (const m of removed) st.players[m.player].meeples = Math.min(7, st.players[m.player].meeples + 1);
        }
      }
      results.push({ players: owners, points: pts, type });
      addFloater(st, x, y, '+' + pts, owners);
    }
  };
  scan('city', def.city.length);
  scan('road', def.road.length);
  // monastery
  if (def.monastery && t.meeples.some(m => m.type === 'monastery')) {
    let around = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (dx || dy) { if (tileAt(st, x + dx, y + dy)) around++; }
    }
    if (around === 8) {
      const m = t.meeples.find(m => m.type === 'monastery');
      st.players[m.player].score += 9;
      t.meeples = t.meeples.filter(m2 => m2 !== m);
      st.players[m.player].meeples++;
      results.push({ players: [m.player], points: 9, type: 'monastery' });
      addFloater(st, x, y, '+9', [m.player]);
    }
  }
  return results;
}

function addFloater(st, x, y, text, players) {
  st.floaters.push({ x, y, text, color: st.players[players[0]].color, born: performance.now() });
}

/* Final scoring at end of deck: incomplete structures + monasteries */
function finalScoring(st) {
  const visited = new Set();
  const lines = [];
  const scan = (type) => {
    for (const [k, t] of st.board) {
      const [x, y] = k.split(',').map(Number);
      const def = rotatedTemplate(t.tpl, t.rot);
      const groups = type === 'city' ? def.city : def.road;
      for (let si = 0; si < groups.length; si++) {
        const sig = k + ':' + si + ':' + type;
        if (visited.has(sig)) continue;
        const g = collectGroup(st, x, y, si, type);
        for (const c of g.cells) visited.add(c.x + ',' + c.y + ':' + c.segIdx + ':' + type);
        if (g.meeples.length === 0) continue;
        const pts = structurePoints(type, g, false);
        const owners = [...new Set(g.meeples.map(m => m.player))];
        for (const pid of owners) st.players[pid].score += pts;
        lines.push({ players: owners, points: pts, what: type });
      }
    }
  };
  scan('city'); scan('road');
  for (const [k, t] of st.board) {
    const [x, y] = k.split(',').map(Number);
    const def = rotatedTemplate(t.tpl, t.rot);
    if (!def.monastery) continue;
    const m = t.meeples.find(m => m.type === 'monastery');
    if (!m) continue;
    let around = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if ((dx || dy) && tileAt(st, x + dx, y + dy)) around++;
    }
    st.players[m.player].score += 1 + around;
    lines.push({ players: [m.player], points: 1 + around, what: 'monastery' });
  }
  return lines;
}

function drawNextTile(st) {
  if (!st.deck.length) return false;
  st.current = { tpl: st.deck.pop(), rot: 0 };
  return true;
}
