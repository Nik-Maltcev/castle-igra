'use strict';
/* Castlelands - heuristic AI.
 * For every legal (cell, rotation) of the current tile it simulates the
 * placement, values immediate completions and potential meeple spots,
 * and picks the best total. */

function aiFrontier(st) {
  const cells = frontierCells(st);
  return cells;
}

// simulate placing tile tpl at (x,y,rot); returns undo()
function simPlace(st, x, y, tpl, rot) {
  const entry = { tpl, rot, meeples: [] };
  st.board.set(keyOf(x, y), entry);
  return () => st.board.delete(keyOf(x, y));
}

function aiChooseMove(st, player) {
  const tpl = st.current.tpl;
  const candidates = [];
  for (const [x, y] of aiFrontier(st)) {
    const tried = new Set();
    for (let rot = 0; rot < 4; rot++) {
      if (!canPlace(st, x, y, rot)) continue;
      const t = rotatedTemplate(tpl, rot);
      const sig = t.edges.join('');
      if (tried.has(sig)) continue;
      tried.add(sig);
      candidates.push(evaluatePlacement(st, player, x, y, rot));
    }
  }
  if (!candidates.length) return null; // should not happen in practice
  candidates.sort((a, b) => b.value - a.value);
  return candidates[0];
}

function evaluatePlacement(st, player, x, y, rot) {
  const tpl = st.current.tpl;
  const undo = simPlace(st, x, y, tpl, rot);
  let value = 0;

  // structures completed by this tile (with meeples already on them)
  const t = rotatedTemplate(tpl, rot);
  const seen = [];
  const scan = (type, count) => {
    for (let si = 0; si < count; si++) {
      const g = collectGroup(st, x, y, si, type);
      const sig = g.cells.map(c => c.x + ',' + c.y + ':' + c.segIdx).sort().join('|');
      if (seen.includes(sig)) continue;
      seen.push(sig);
      if (!g.complete || g.meeples.length === 0) continue;
      const pts = structurePoints(type, g, true);
      for (const m of g.meeples) {
        value += (m.player === player.id ? pts : -pts * 0.9);
      }
    }
  };
  scan('city', t.city.length);
  scan('road', t.road.length);
  if (t.monastery && !tileAt(st, x, y).meeples.length) {
    // neighbors count check happens only if a meeple is placed later
  }

  // best optional meeple spot
  if (player.meeples > 0) {
    let best = 0;
    const spots = validMeepleSpots(st, x, y);
    for (const spot of spots) {
      let v = 0;
      if (spot.type === 'monastery') {
        let around = 0;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          if ((dx || dy) && tileAt(st, x + dx, y + dy)) around++;
        }
        v = around >= 8 ? 9 : 2.5 + around * 0.35;
      } else {
        const g = collectGroup(st, x, y, spot.segIdx, spot.type);
        if (g.complete) {
          v = structurePoints(spot.type, g, true);
        } else if (spot.type === 'city') {
          v = g.tiles * 1.7 + g.shields * 1.6;
          if (g.tiles >= 3) v += 1.2; // big city potential
        } else {
          v = g.tiles * 0.75;
        }
        // slight discount for crowding segments others may share
        v *= 0.95;
      }
      if (v > best) best = v;
    }
    value += best;
  }

  undo();
  value += Math.random() * 0.15;
  return { x, y, rot, value };
}
