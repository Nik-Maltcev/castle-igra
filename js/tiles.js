'use strict';
/* Castlelands - tile data
 * Edge order: 0=N, 1=E, 2=S, 3=W. Edge types: C=city, R=road, F=field.
 * A tile template lists its border edges, its city groups and road groups
 * (each group = array of border edge indexes that belong to one structure).
 */

const N = 0, E = 1, S = 2, W = 3;
const EDGE_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // dx,dy for N,E,S,W
const C = 'C', R = 'R', F = 'F'; // edge types: city / road / field

const TEMPLATES = [
  // start tile: city gate on north, road leaving south toward the gate
  { n: 1, edges: [C, F, R, F], city: [[N]], road: [[S]], start: true },
  { n: 4, edges: [F, F, F, F], monastery: true },
  { n: 2, edges: [R, F, R, F], road: [[N, S]], monastery: true },
  { n: 6, edges: [R, F, R, F], road: [[N, S]] },
  { n: 5, edges: [R, R, F, F], road: [[N, E]] },
  { n: 5, edges: [F, R, R, F], road: [[E, S]] },
  { n: 5, edges: [F, F, R, R], road: [[S, W]] },
  { n: 5, edges: [R, F, F, R], road: [[W, N]] },
  { n: 3, edges: [R, R, R, F], road: [[N, E, S]] },
  { n: 3, edges: [F, R, R, R], road: [[E, S, W]] },
  { n: 3, edges: [R, F, R, R], road: [[S, W, N]] },
  { n: 3, edges: [R, R, F, R], road: [[W, N, E]] },
  { n: 1, edges: [R, R, R, R], road: [[N, E, S, W]] },
  { n: 1, edges: [C, F, F, F], city: [[N]], shield: true },
  { n: 2, edges: [C, F, F, F], city: [[N]] },
  { n: 5, edges: [C, C, F, F], city: [[N, E]] },
  { n: 2, edges: [C, C, F, F], city: [[N, E]], shield: true },
  { n: 2, edges: [C, F, C, F], city: [[N, S]] },
  { n: 1, edges: [C, F, C, F], city: [[N, S]], shield: true },
  { n: 3, edges: [C, C, C, F], city: [[N, E, S]] },
  { n: 1, edges: [C, C, C, F], city: [[N, E, S]], shield: true },
  { n: 1, edges: [C, C, C, C], city: [[N, E, S, W]], shield: true },
  { n: 3, edges: [C, F, R, F], city: [[N]], road: [[S]] },
  { n: 3, edges: [C, C, R, F], city: [[N, E]], road: [[S]] },
  { n: 2, edges: [C, C, F, R], city: [[N, E]], road: [[W]] },
];

const TPL_TOTAL = TEMPLATES.reduce((a, t) => a + t.n, 0);
if (TPL_TOTAL !== 72) console.error('Tile set size mismatch:', TPL_TOTAL, '(expected 72)');

// rotate an edge-index array clockwise by rot quarter turns
function rotEdgesRaw(edges, rot) {
  const out = new Array(4);
  for (let i = 0; i < 4; i++) out[i] = edges[(i - rot % 4 + 4) % 4];
  return out;
}
function rotGroupsRaw(groups, rot) {
  return groups.map(g => g.map(e => (e + rot) % 4));
}

// rotated view of a template, cached
const rotCache = new Map();
function rotatedTemplate(tplIdx, rot) {
  rot %= 4;
  const k = tplIdx + ':' + rot;
  let v = rotCache.get(k);
  if (!v) {
    const t = TEMPLATES[tplIdx];
    v = {
      tpl: tplIdx,
      rot: rot,
      edges: rotEdgesRaw(t.edges, rot),
      city: rotGroupsRaw(t.city || [], rot),
      road: rotGroupsRaw(t.road || [], rot),
      shield: !!t.shield,
      monastery: !!t.monastery,
      start: !!t.start,
    };
    rotCache.set(k, v);
  }
  return v;
}

function buildDeck() {
  const deck = [];
  TEMPLATES.forEach((t, i) => {
    if (t.start) return; // start tile is placed separately
    for (let k = 0; k < t.n; k++) deck.push(i);
  });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
