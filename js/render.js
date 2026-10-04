'use strict';
/* Castlelands - canvas rendering & input (procedural art, no external assets) */

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const render = {
  canvas: null, ctx: null,
  cam: { x: 0, y: 0, scale: 1 },
  hoverCell: null,
  drag: null,
  st: null,
  previewCtx: null,
  onCellClick: null,
  onSpotClick: null,
  onRotate: null,
  choiceOverlay: null,
};

const EDGE_MID = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]; // N,E,S,W in tile units

function segAnchor(def, type, segIdx, S) {
  if (type === 'monastery') return [S / 2, S / 2];
  const seg = (type === 'city' ? def.city : def.road)[segIdx];
  let ax = 0, ay = 0;
  for (const e of seg) { ax += EDGE_MID[e][0]; ay += EDGE_MID[e][1]; }
  ax = (ax / seg.length) * S; ay = (ay / seg.length) * S;
  const pull = type === 'city' ? 0.42 : 0.30;
  return [ax + (S / 2 - ax) * pull, ay + (S / 2 - ay) * pull];
}

/* ---------- tile art ---------- */
const tileArtCache = new Map();
function drawTileArt(ctx, def, S, seed) {
  const key = [def.tpl, def.rot, S, seed].join(':');
  let art = tileArtCache.get(key);
  if (!art) {
    art = document.createElement('canvas');
    art.width = art.height = S;
    paintTile(art.getContext('2d'), def, S, seed);
    tileArtCache.set(key, art);
  }
  ctx.drawImage(art, 0, 0, S, S);
}

function paintTile(ctx, def, S, seed) {
  const rnd = mulberry32(seed * 977 + def.rot * 13 + def.tpl * 31);
  const u = S / 100;
  const rect = (x, y, w, h) => ctx.fillRect(x * u, y * u, w * u, h * u);
  const circle = (x, y, r) => {
    ctx.beginPath(); ctx.arc(x * u, y * u, r * u, 0, Math.PI * 2); ctx.fill();
  };
  const poly = (points) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x * u, y * u) : ctx.moveTo(x * u, y * u));
    ctx.closePath(); ctx.fill();
  };

  // A gentle wash gives every tile the same illustrated-map palette.
  const grass = ctx.createLinearGradient(0, 0, S, S);
  grass.addColorStop(0, '#a6bc78');
  grass.addColorStop(1, '#8fac6d');
  ctx.fillStyle = grass;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#c2cc92';
  poly([[0, 12], [30, 2], [63, 18], [100, 8], [100, 25], [70, 36], [29, 24], [0, 38]]);
  ctx.fillStyle = '#86a364';
  poly([[0, 74], [35, 62], [65, 80], [100, 65], [100, 100], [0, 100]]);

  for (let i = 0; i < 35; i++) {
    const x = rnd() * 100, y = rnd() * 100;
    ctx.fillStyle = rnd() > .5 ? '#e0d9a4' : '#658c59';
    circle(x, y, rnd() * .8 + .25);
  }

  // Forests and wildflowers are kept away from structure edges.
  for (let i = 0; i < 8; i++) {
    const x = 12 + rnd() * 76, y = 12 + rnd() * 76;
    if (def.monastery && Math.hypot(x - 50, y - 50) < 30) continue;
    if (def.city.some(g => g.some(e => (e === N && y < 36) || (e === S && y > 64) || (e === E && x > 64) || (e === W && x < 36)))) continue;
    if (def.road.some(g => g.length && Math.hypot(x - 50, y - 50) < 13)) continue;
    if (rnd() < .6) {
      ctx.fillStyle = '#608150'; circle(x + 2, y + 3, 4);
      ctx.fillStyle = '#365d43'; circle(x, y, 4);
      ctx.fillStyle = '#75965a'; circle(x - 1.3, y - 1.5, 1.8);
    } else {
      ctx.fillStyle = '#e9dbad'; circle(x, y, 1.5);
      ctx.fillStyle = '#a77744'; circle(x, y, .55);
    }
  }

  const cityRects = (group) => {
    const rects = [];
    for (const e of group) {
      if (e === N) rects.push([0, 0, 100, 35]);
      if (e === S) rects.push([0, 65, 100, 35]);
      if (e === W) rects.push([0, 0, 35, 100]);
      if (e === E) rects.push([65, 0, 35, 100]);
    }
    if (group.length >= 2) {
      if (group.includes(N) && group.includes(S)) rects.push([31, 0, 38, 100]);
      if (group.includes(E) && group.includes(W)) rects.push([0, 31, 100, 38]);
      if (group.includes(N) && group.includes(E)) rects.push([50, 0, 50, 50]);
      if (group.includes(N) && group.includes(W)) rects.push([0, 0, 50, 50]);
      if (group.includes(S) && group.includes(E)) rects.push([50, 50, 50, 50]);
      if (group.includes(S) && group.includes(W)) rects.push([0, 50, 50, 50]);
    }
    return rects;
  };

  for (const group of def.city) {
    const rs = cityRects(group);
    ctx.fillStyle = '#7d684d';
    rs.forEach(([x, y, w, h]) => rect(x + 1, y + 2, w, h));
    const stone = ctx.createLinearGradient(0, 0, S, S);
    stone.addColorStop(0, '#dcc08b'); stone.addColorStop(1, '#b99668');
    ctx.fillStyle = stone;
    rs.forEach(([x, y, w, h]) => rect(x, y, w, h));

    // Small roofs and courtyards read clearly even when zoomed out.
    ctx.save();
    ctx.beginPath();
    rs.forEach(([x, y, w, h]) => ctx.rect(x * u, y * u, w * u, h * u));
    ctx.clip();
    for (let i = 0; i < Math.max(3, group.length * 5); i++) {
      const x = 9 + rnd() * 82, y = 9 + rnd() * 82;
      ctx.fillStyle = '#9b6949'; rect(x + 1.5, y + 3, 10, 7);
      ctx.fillStyle = rnd() > .5 ? '#8e4b3c' : '#a75e45';
      poly([[x, y + 3], [x + 5, y - 3], [x + 12, y + 3]]);
      ctx.fillStyle = '#edcf9a'; rect(x + 4, y + 4, 2, 2);
    }
    ctx.restore();
    ctx.strokeStyle = '#755f43'; ctx.lineWidth = 1.3 * u;
    for (const [x, y, w, h] of rs) {
      ctx.strokeRect(x * u + u, y * u + u, (w - 2) * u, (h - 2) * u);
    }
  }

  // The map edge is a complete city wall; road edges remain open.
  for (let e = 0; e < 4; e++) if (def.edges[e] === 'C') {
    ctx.strokeStyle = '#66533d'; ctx.lineWidth = 3 * u;
    ctx.beginPath();
    if (e === N) { ctx.moveTo(0, 2 * u); ctx.lineTo(S, 2 * u); }
    if (e === S) { ctx.moveTo(0, S - 2 * u); ctx.lineTo(S, S - 2 * u); }
    if (e === W) { ctx.moveTo(2 * u, 0); ctx.lineTo(2 * u, S); }
    if (e === E) { ctx.moveTo(S - 2 * u, 0); ctx.lineTo(S - 2 * u, S); }
    ctx.stroke();
    ctx.fillStyle = '#e8d4a9';
    for (let k = 0; k < 7; k++) {
      if (e === N) rect(k * 15, 0, 8, 5);
      if (e === S) rect(k * 15, 95, 8, 5);
      if (e === W) rect(0, k * 15, 5, 8);
      if (e === E) rect(95, k * 15, 5, 8);
    }
  }

  for (const group of def.road) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#675d43'; ctx.lineWidth = 17 * u;
    drawRoadPath(ctx, group, S, false);
    ctx.strokeStyle = '#cbb582'; ctx.lineWidth = 13 * u;
    drawRoadPath(ctx, group, S, false);
    ctx.strokeStyle = '#e6d2a2'; ctx.lineWidth = 8 * u;
    drawRoadPath(ctx, group, S, false);
    if (group.length === 1) {
      ctx.fillStyle = '#f1ddb1'; circle(50, 50, 8);
      ctx.fillStyle = '#7c5940'; rect(44, 48, 12, 10);
      ctx.fillStyle = '#9d6545'; poly([[42, 49], [50, 42], [58, 49]]);
    }
  }

  if (def.monastery) {
    ctx.fillStyle = '#5d7154'; circle(50, 53, 24);
    ctx.fillStyle = '#e5d7ae'; rect(34, 45, 32, 28);
    ctx.fillStyle = '#aa845b'; rect(38, 49, 24, 21);
    ctx.fillStyle = '#f3e9c9'; rect(40, 51, 20, 20);
    ctx.fillStyle = '#784c3d'; poly([[32, 48], [50, 30], [68, 48]]);
    ctx.fillStyle = '#aa6548'; poly([[38, 47], [50, 35], [62, 47]]);
    ctx.fillStyle = '#6c4b35'; rect(47, 59, 6, 12);
    ctx.fillStyle = '#ebd7a1'; rect(48, 38, 4, 5);
    ctx.strokeStyle = '#f6e8c1'; ctx.lineWidth = 2 * u;
    ctx.beginPath(); ctx.moveTo(50 * u, 29 * u); ctx.lineTo(50 * u, 38 * u); ctx.moveTo(46 * u, 33 * u); ctx.lineTo(54 * u, 33 * u); ctx.stroke();
  }

  if (def.shield && def.city.length) {
    const [ax, ay] = segAnchor(def, 'city', 0, S);
    ctx.fillStyle = '#493e30'; circle(ax / u + 1, ay / u + 2, 11);
    ctx.fillStyle = '#315c77';
    poly([[ax / u - 8, ay / u - 8], [ax / u + 8, ay / u - 8], [ax / u + 7, ay / u + 4], [ax / u, ay / u + 10], [ax / u - 7, ay / u + 4]]);
    ctx.fillStyle = '#f4d687'; rect(ax / u - 1, ay / u - 5, 2, 10); rect(ax / u - 5, ay / u - 1, 10, 2);
  }

  ctx.strokeStyle = '#57664766'; ctx.lineWidth = .8 * u;
  ctx.strokeRect(.4 * u, .4 * u, S - .8 * u, S - .8 * u);
}

function drawRoadPath(ctx, group, S, debug) {
  ctx.beginPath();
  const pts = group.map(e => [EDGE_MID[e][0] * S, EDGE_MID[e][1] * S]);
  if (pts.length === 1) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(S / 2, S / 2);
  } else {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      ctx.quadraticCurveTo(S / 2, S / 2, pts[i][0], pts[i][1]);
    }
  }
  ctx.stroke();
}

function drawMeeple(ctx, x, y, color, scale) {
  const s = scale || 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -7, 5, 0, Math.PI * 2); // head
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-7, 8);
  ctx.quadraticCurveTo(-8, -2, -4, -3);
  ctx.lineTo(4, -3);
  ctx.quadraticCurveTo(8, -2, 7, 8);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

/* ---------- main render ---------- */
function worldToScreen(wx, wy) {
  const W = render.canvas.clientWidth, H = render.canvas.clientHeight;
  return [(wx - render.cam.x) * render.cam.scale + W / 2, (wy - render.cam.y) * render.cam.scale + H / 2];
}
function screenToWorld(sx, sy) {
  const W = render.canvas.clientWidth, H = render.canvas.clientHeight;
  return [(sx - W / 2) / render.cam.scale + render.cam.x, (sy - H / 2) / render.cam.scale + render.cam.y];
}

function drawBoard() {
  const ctx = render.ctx, st = render.st;
  const W = render.canvas.clientWidth, H = render.canvas.clientHeight;
  const ps = render.pxScale || 1;
  ctx.setTransform(ps, 0, 0, ps, 0, 0);
  ctx.fillStyle = '#c9bc99';
  ctx.fillRect(0, 0, W, H);
  const paper = ctx.createRadialGradient(W * .48, H * .42, 10, W * .5, H * .5, Math.max(W, H) * .75);
  paper.addColorStop(0, '#ffffff0b');
  paper.addColorStop(1, '#6d5c4033');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#786f572b';
  ctx.lineWidth = 1;
  const step = TILE * render.cam.scale;
  if (step > 16) {
    const [gx, gy] = worldToScreen(0, 0);
    for (let x = gx % step; x < W; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = gy % step; y < H; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }
  ctx.save();
  ctx.translate(W - 52, 53);
  ctx.strokeStyle = '#7d674799'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 27, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#715b3a';
  ctx.beginPath(); ctx.moveTo(0, -23); ctx.lineTo(5, 0); ctx.lineTo(0, -5); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a7824d';
  ctx.beginPath(); ctx.moveTo(0, 23); ctx.lineTo(5, 0); ctx.lineTo(0, 5); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
  ctx.font = 'bold 10px Georgia'; ctx.textAlign = 'center'; ctx.fillText('N', 0, -31);
  ctx.restore();

  ctx.save();
  const [ox, oy] = worldToScreen(0, 0);
  ctx.translate(ox, oy);
  ctx.scale(render.cam.scale, render.cam.scale);

  const S = TILE;
  // valid placement hints
  if (st.phase === 'place' && st.humanActing && st.validCells) {
    for (const [x, y] of st.validCells) {
      const isHover = render.hoverCell && render.hoverCell[0] === x && render.hoverCell[1] === y;
      ctx.fillStyle = isHover ? '#ffed9faa' : '#f7e5a9c9';
      ctx.fillRect(x * S + 4, y * S + 4, S - 8, S - 8);
      ctx.strokeStyle = isHover ? '#faeaa9' : '#617b4d';
      ctx.lineWidth = isHover ? 3 : 1.5;
      ctx.setLineDash(isHover ? [] : [5, 5]);
      ctx.strokeRect(x * S + 4, y * S + 4, S - 8, S - 8);
      ctx.setLineDash([]);
      if (!isHover) {
        ctx.fillStyle = '#4d6c45';
        ctx.font = '25px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+', x * S + S / 2, y * S + S / 2);
      }
      if (isHover) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.translate(x * S, y * S);
        drawTileArt(ctx, rotatedTemplate(st.current.tpl, st.current.rot), S, 999);
        ctx.strokeStyle = '#ffefaa'; ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, S - 4, S - 4);
        ctx.restore();
      }
    }
  }

  // placed tiles
  for (const [k, t] of st.board) {
    const [x, y] = k.split(',').map(Number);
    ctx.save();
    ctx.translate(x * S, y * S);
    ctx.shadowColor = '#42352377'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 4;
    drawTileArt(ctx, rotatedTemplate(t.tpl, t.rot), S, t.tpl);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    if (st.justPlaced && st.justPlaced.x === x && st.justPlaced.y === y) {
      ctx.strokeStyle = 'rgba(255,240,150,0.9)';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, S - 4, S - 4);
    }
    ctx.restore();
    // meeples
    const def = rotatedTemplate(t.tpl, t.rot);
    const allSpots = [];
    def.city.forEach((g, si) => allSpots.push(['city', si]));
    def.road.forEach((g, si) => allSpots.push(['road', si]));
    if (def.monastery) allSpots.push(['monastery', 0]);
    for (const m of t.meeples) {
      const [ax, ay] = segAnchor(def, m.type, m.segIdx, S);
      drawMeeple(ctx, x * S + ax, y * S + ay, st.players[m.player].color, 0.9);
    }
  }

  // floaters
  const now = performance.now();
  st.floaters = st.floaters.filter(f => now - f.born < 1600);
  for (const f of st.floaters) {
    const t = (now - f.born) / 1600;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 4;
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const fx = f.x * S + S / 2, fy = f.y * S + S / 2 - t * 55;
    ctx.strokeText(f.text, fx, fy);
    ctx.fillText(f.text, fx, fy);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawPreview() {
  const st = render.st;
  const pc = render.previewCtx;
  if (!pc || !st.current) return;
  const S = 120;
  pc.setTransform(1, 0, 0, 1, 0, 0);
  pc.clearRect(0, 0, S, S);
  pc.save();
  pc.beginPath(); pc.rect(0, 0, S, S); pc.clip();
  drawTileArt(pc, rotatedTemplate(st.current.tpl, st.current.rot), S, st.current.tpl);
  pc.restore();
}

function positionFollowerChoices() {
  const choices = render.choiceOverlay;
  const st = render.st;
  if (!choices || choices.hidden || !st.justPlaced) return;
  const W = render.canvas.clientWidth, H = render.canvas.clientHeight;
  const def = rotatedTemplate(st.current.tpl, st.current.rot);
  const positions = st.meepleSpots.map(spot => {
    const [ax, ay] = segAnchor(def, spot.type, spot.segIdx, TILE);
    return worldToScreen(st.justPlaced.x * TILE + ax, st.justPlaced.y * TILE + ay);
  });
  // Keep nearby choices separate, including a road through a monastery.
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      let dx = positions[j][0] - positions[i][0];
      let dy = positions[j][1] - positions[i][1];
      const distance = Math.hypot(dx, dy);
      if (distance >= 82) continue;
      if (distance < 1) { dx = 1; dy = 0; }
      else { dx /= distance; dy /= distance; }
      const shift = (82 - distance) / 2;
      positions[i][0] -= dx * shift;
      positions[i][1] -= dy * shift;
      positions[j][0] += dx * shift;
      positions[j][1] += dy * shift;
    }
  }
  const pad = 45;
  [...choices.children].forEach((button, i) => {
    button.style.left = Math.max(Math.min(pad, W / 2), Math.min(W - pad, positions[i][0])) + 'px';
    button.style.top = Math.max(Math.min(pad, H / 2), Math.min(H - pad, positions[i][1])) + 'px';
  });
}

function frame() {
  if (render.st) { drawBoard(); drawPreview(); positionFollowerChoices(); }
  requestAnimationFrame(frame);
}

function initRender(canvas, previewCanvas, st, hooks) {
  render.canvas = canvas;
  render.ctx = canvas.getContext('2d');
  render.previewCtx = previewCanvas.getContext('2d');
  render.choiceOverlay = document.getElementById('meepleChoices');
  render.st = st;
  Object.assign(render, hooks);

  function resize() {
    canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
    canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
    render.pxScale = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
  }
  window.addEventListener('resize', resize);
  resize();

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    render.drag = { sx: e.offsetX, sy: e.offsetY, cx: render.cam.x, cy: render.cam.y, moved: false };
  });
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (render.drag) {
      const dx = mx - render.drag.sx, dy = my - render.drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 6) render.drag.moved = true;
      if (render.drag.moved) {
        render.cam.x = render.drag.cx - dx / render.cam.scale;
        render.cam.y = render.drag.cy - dy / render.cam.scale;
      }
    } else if (mx >= 0 && my >= 0 && mx <= r.width && my <= r.height &&
               render.st.phase === 'place' && render.st.humanActing) {
      const [wx, wy] = screenToWorld(mx, my);
      render.hoverCell = [Math.floor(wx / TILE), Math.floor(wy / TILE)];
    }
  });
  canvas.addEventListener('pointerleave', () => { if (!render.drag) render.hoverCell = null; });
  canvas.addEventListener('pointercancel', () => { render.drag = null; });
  canvas.addEventListener('pointerup', e => {
    if (!render.drag) return;
    canvas.releasePointerCapture(e.pointerId);
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const wasClick = !render.drag.moved && mx >= 0 && my >= 0 && mx <= r.width && my <= r.height;
    render.drag = null;
    if (!wasClick) return;
    const [wx, wy] = screenToWorld(mx, my);
    const cx = Math.floor(wx / TILE), cy = Math.floor(wy / TILE);
    if (render.st.phase === 'place' && render.onCellClick) render.onCellClick(cx, cy);
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const [wx, wy] = screenToWorld(mx, my);
    render.cam.scale = Math.min(2.5, Math.max(0.3, render.cam.scale * factor));
    // keep cursor anchored
    const [wx2, wy2] = screenToWorld(mx, my);
    render.cam.x += wx - wx2;
    render.cam.y += wy - wy2;
  }, { passive: false });

  requestAnimationFrame(frame);
}
