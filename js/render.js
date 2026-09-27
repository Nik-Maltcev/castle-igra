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
function drawTileArt(ctx, def, S, seed) {
  const rnd = mulberry32(seed * 977 + def.rot * 13 + def.tpl * 31);
  // field base
  ctx.fillStyle = '#7fa15b';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(rnd() * S, rnd() * S, 2.5, 2.5);
  }
  // grass tufts
  ctx.strokeStyle = 'rgba(38,66,28,0.35)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 7; i++) {
    const gx = rnd() * S, gy = rnd() * S;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 1.5, gy - 4); ctx.stroke();
  }

  // city blocks: rect from each border edge of the group + connector blocks
  const cityRects = (group) => {
    const rects = [];
    for (const e of group) {
      const d = 0.34 * S;
      if (e === N) rects.push([0, 0, S, d]);
      if (e === S) rects.push([0, S - d, S, d]);
      if (e === W) rects.push([0, 0, d, S]);
      if (e === E) rects.push([S - d, 0, d, S]);
    }
    if (group.length >= 2) {
      const hasN = group.includes(N), hasS = group.includes(S);
      const hasE = group.includes(E), hasW = group.includes(W);
      if (hasN && hasE) rects.push([S / 2, 0, S / 2, S / 2]);
      if (hasN && hasW) rects.push([0, 0, S / 2, S / 2]);
      if (hasS && hasE) rects.push([S / 2, S / 2, S / 2, S / 2]);
      if (hasS && hasW) rects.push([0, S / 2, S / 2, S / 2]);
      if (hasN && hasS) rects.push([S * 0.28, 0, S * 0.44, S]);
      if (hasE && hasW) rects.push([0, S * 0.28, S, S * 0.44]);
    }
    return rects;
  };

  const wall = '#4a3016';
  for (const group of def.city) {
    ctx.fillStyle = '#b3854f';
    for (const r of cityRects(group)) ctx.fillRect(r[0], r[1], r[2], r[3]);
    // windows
    ctx.fillStyle = 'rgba(60,38,18,0.55)';
    for (const r of cityRects(group)) {
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(r[0] + 6 + rnd() * Math.max(1, r[2] - 14), r[1] + 6 + rnd() * Math.max(1, r[3] - 14), 3.5, 5);
      }
    }
    // wall outline
    ctx.strokeStyle = wall;
    ctx.lineWidth = 3;
    for (const r of cityRects(group)) ctx.strokeRect(r[0] + 1.5, r[1] + 1.5, r[2] - 3, r[3] - 3);
  }
  // border edge types: draw wall crest along city borders
  ctx.strokeStyle = 'rgba(40,26,10,0.8)';
  ctx.lineWidth = 3;
  for (let e = 0; e < 4; e++) {
    if (def.edges[e] === 'C') {
      ctx.beginPath();
      if (e === N) { ctx.moveTo(0, 1.5); ctx.lineTo(S, 1.5); }
      if (e === S) { ctx.moveTo(0, S - 1.5); ctx.lineTo(S, S - 1.5); }
      if (e === W) { ctx.moveTo(1.5, 0); ctx.lineTo(1.5, S); }
      if (e === E) { ctx.moveTo(S - 1.5, 0); ctx.lineTo(S - 1.5, S); }
      ctx.stroke();
    }
  }

  // roads
  for (const group of def.road) {
    ctx.strokeStyle = '#7c6a44';
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawRoadPath(ctx, group, S, false);
    ctx.strokeStyle = '#e5d49f';
    ctx.lineWidth = 10;
    drawRoadPath(ctx, group, S, false);
    if (group.length === 1) {
      // dead end: little house at tile center
      ctx.fillStyle = '#8a5a33';
      ctx.fillRect(S * 0.40, S * 0.40, S * 0.20, S * 0.16);
      ctx.fillStyle = '#5d3a1c';
      ctx.beginPath();
      ctx.moveTo(S * 0.38, S * 0.40); ctx.lineTo(S * 0.5, S * 0.30); ctx.lineTo(S * 0.62, S * 0.40);
      ctx.closePath(); ctx.fill();
    }
  }

  // monastery chapel
  if (def.monastery) {
    ctx.fillStyle = '#e9e2d0';
    ctx.fillRect(S * 0.36, S * 0.44, S * 0.28, S * 0.26);
    ctx.fillStyle = '#6d4a2a';
    ctx.beginPath();
    ctx.moveTo(S * 0.33, S * 0.44); ctx.lineTo(S * 0.50, S * 0.28); ctx.lineTo(S * 0.67, S * 0.44);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6d4a2a';
    ctx.fillRect(S * 0.47, S * 0.72, S * 0.06, S * 0.12);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(S * 0.36, S * 0.44, S * 0.28, S * 0.26);
  }

  // shield pennant
  if (def.shield && def.city.length) {
    const [ax, ay] = segAnchor(def, 'city', 0, S);
    ctx.fillStyle = '#2b6cb0';
    ctx.beginPath();
    ctx.moveTo(ax, ay - 10);
    ctx.lineTo(ax + 9, ay - 6);
    ctx.lineTo(ax, ay + 8);
    ctx.lineTo(ax - 9, ay - 6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1a365d'; ctx.lineWidth = 1.5; ctx.stroke();
  }
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
  ctx.fillStyle = '#2c3b2b';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  const [ox, oy] = worldToScreen(0, 0);
  ctx.translate(ox, oy);
  ctx.scale(render.cam.scale, render.cam.scale);

  const S = TILE;
  // valid placement hints
  if (st.phase === 'place' && st.humanActing && st.validCells) {
    ctx.setLineDash([6, 5]);
    for (const [x, y] of st.validCells) {
      const isHover = render.hoverCell && render.hoverCell[0] === x && render.hoverCell[1] === y;
      ctx.strokeStyle = isHover ? 'rgba(255,255,180,0.95)' : 'rgba(255,255,255,0.28)';
      ctx.lineWidth = isHover ? 3 : 2;
      ctx.strokeRect(x * S + 3, y * S + 3, S - 6, S - 6);
      if (isHover) {
        ctx.save();
        ctx.globalAlpha = 0.72;
        ctx.translate(x * S, y * S);
        drawTileArt(ctx, rotatedTemplate(st.current.tpl, st.current.rot), S, 999);
        ctx.restore();
      }
    }
    ctx.setLineDash([]);
  }

  // placed tiles
  for (const [k, t] of st.board) {
    const [x, y] = k.split(',').map(Number);
    ctx.save();
    ctx.translate(x * S, y * S);
    drawTileArt(ctx, rotatedTemplate(t.tpl, t.rot), S, t.tpl);
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

  // meeple placement hotspots
  if (st.phase === 'meeple' && st.meepleSpots) {
    const { x, y } = st.justPlaced;
    const def = rotatedTemplate(st.current.tpl, st.current.rot);
    const pid = st.turn;
    for (const spot of st.meepleSpots) {
      const [ax, ay] = segAnchor(def, spot.type, spot.segIdx, S);
      const px = x * S + ax, py = y * S + ay;
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      drawMeeple(ctx, px, py, st.players[pid].color, 0.85);
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

function frame() {
  if (render.st) { drawBoard(); drawPreview(); }
  requestAnimationFrame(frame);
}

function initRender(canvas, previewCanvas, st, hooks) {
  render.canvas = canvas;
  render.ctx = canvas.getContext('2d');
  render.previewCtx = previewCanvas.getContext('2d');
  render.st = st;
  Object.assign(render, hooks);

  function resize() {
    canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
    canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
    render.pxScale = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
  }
  window.addEventListener('resize', resize);
  resize();

  canvas.addEventListener('mousedown', e => {
    render.drag = { sx: e.offsetX, sy: e.offsetY, cx: render.cam.x, cy: render.cam.y, moved: false };
  });
  window.addEventListener('mousemove', e => {
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
  window.addEventListener('mouseup', e => {
    if (!render.drag) return;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const wasClick = !render.drag.moved && mx >= 0 && my >= 0 && mx <= r.width && my <= r.height;
    render.drag = null;
    if (!wasClick) return;
    const [wx, wy] = screenToWorld(mx, my);
    const cx = Math.floor(wx / TILE), cy = Math.floor(wy / TILE);
    if (render.st.phase === 'place' && render.onCellClick) render.onCellClick(cx, cy);
    else if (render.st.phase === 'meeple' && render.onSpotClick) {
      // find hotspot within radius
      const { x, y } = render.st.justPlaced;
      const def = rotatedTemplate(render.st.current.tpl, render.st.current.rot);
      for (const spot of render.st.meepleSpots || []) {
        const [ax, ay] = segAnchor(def, spot.type, spot.segIdx, TILE);
        const px = (x * TILE + ax - render.cam.x) * render.cam.scale + r.width / 2;
        const py = (y * TILE + ay - render.cam.y) * render.cam.scale + r.height / 2;
        if (Math.hypot(px - mx, py - my) < 18) { render.onSpotClick(spot); return; }
      }
    }
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
