// Renderer: chase-view pseudo-3D di canvas 2D + HUD instrumen + layar menu.
// Satu-satunya yang melukis; tidak ada aset gambar — semua digambar dari
// path canvas, jadi game tetap offline penuh dan lolos gate references.
import { MISSIONS, PALETTES, SEG_LEN, DRAW_SEGS, GROUND_HALF } from './config.js';
import { centerAt, islandHalfWidth, terrainAt, visibleSegments } from './course.js';
import { clamp, lerp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const CAM_DEPTH = 0.84;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 1280;
  let H = 720;
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth || 1280;
    H = canvas.clientHeight || 720;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // Proyeksi satu titik dunia ke layar. z = jarak ke depan (meter),
  // camX = posisi lateral kamera, camY = ketinggian kamera (kaki).
  function project(wx, wy, z, camX, camY, horizonY) {
    const scale = CAM_DEPTH / Math.max(1, z);
    return {
      x: W / 2 + scale * (wx - camX) * (W / 2),
      y: horizonY + (camY - wy) * scale * (H / 2),
      scale,
    };
  }

  function horizonYFor(state) {
    // Horizon naik saat menukik, turun saat menanjak.
    return H * 0.44 + state.pitch * H * 0.1 + state.bank * 0;
  }

  // Kamera chase 40 kaki di atas pesawat: darat di bawah selalu punya
  // perspektif, bahkan saat pesawat masih di landasan (alt rendah).
  function camYFor(state) {
    return Math.max(2, state.alt) + 40;
  }

  function drawSky(state, pal, time) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(0.55, pal.skyMid);
    g.addColorStop(1, pal.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.56);
    // Bintang untuk palet malam — posisi tetap dari hash indeks (deterministik).
    if (pal.stars) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 70; i++) {
        const hx = Math.sin(i * 12.9898) * 43758.5453;
        const hy = Math.sin(i * 78.233) * 12543.1234;
        const sx = (hx - Math.floor(hx)) * W;
        const sy = (hy - Math.floor(hy)) * H * 0.5;
        const r = 0.6 + ((hx * 7 - Math.floor(hx * 7)) * 1.1);
        ctx.globalAlpha = 0.35 + ((hy * 5 - Math.floor(hy * 5)) * 0.55);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // Matahari + halo.
    const sunX = W * 0.76 - state.heading * 60;
    const sunY = H * 0.2 - state.pitch * 40;
    const halo = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 190);
    halo.addColorStop(0, pal.sunCore);
    halo.addColorStop(0.25, pal.sun);
    halo.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(sunX - 200, sunY - 200, 400, 400);
    ctx.fillStyle = pal.sunCore;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();
    // Pegunungan jauh: dua lapis siluet dengan parallax dari heading.
    drawRidge(state, pal, 0.16, pal.mountain, 0.9, time);
    drawRidge(state, pal, 0.3, pal.mountain, 0.6, time);
  }

  function drawRidge(state, pal, baseY, color, par, time) {
    const y0 = H * baseY - state.pitch * 30 * par;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(-10, H * 0.48);
    const off = -state.heading * 220 * par + time * 0;
    for (let x = -10; x <= W + 10; x += 40) {
      const n = Math.sin((x + off) * 0.008 + par * 9) * 0.5 + Math.sin((x + off) * 0.021 + 3) * 0.3;
      ctx.lineTo(x, y0 + n * 34 * par + 18);
    }
    ctx.lineTo(W + 10, H * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawGround(world, state, pal) {
    const horizonY = horizonYFor(state);
    const camD = state.dist;
    const camX = state.x;
    const camY = camYFor(state);
    const segs = visibleSegments(world.course, camD, DRAW_SEGS);
    // Gambar dari jauh ke dekat supaya yang dekat menimpa.
    for (let i = segs.length - 1; i >= 0; i--) {
      const seg = segs[i];
      const next = segs[i + 1] ?? { d: seg.d + SEG_LEN, center: seg.center, ground: seg.ground };
      const zNear = Math.max(2, seg.d - camD);
      const zFar = Math.max(3, next.d - camD);
      // Laut: pita selebar pandangan, satu warna — tanpa garis-garis.
      const pNearL = project(seg.center - GROUND_HALF, 0, zNear, camX, camY, horizonY);
      const pNearR = project(seg.center + GROUND_HALF, 0, zNear, camX, camY, horizonY);
      const pFarL = project(next.center - GROUND_HALF, 0, zFar, camX, camY, horizonY);
      const pFarR = project(next.center + GROUND_HALF, 0, zFar, camX, camY, horizonY);
      ctx.fillStyle = pal.seaNear;
      ctx.beginPath();
      ctx.moveTo(pNearL.x, pNearL.y);
      ctx.lineTo(pNearR.x, pNearR.y);
      ctx.lineTo(pFarR.x, pFarR.y);
      ctx.lineTo(pFarL.x, pFarL.y);
      ctx.closePath();
      ctx.fill();
      // Kilau laut: garis tipis saat segmen laut dekat (v3: lebih rapat).
      if (seg.ground <= 2 && zNear < 500 && i % 2 === 0) {
        ctx.strokeStyle = pal.seaGlint;
        ctx.globalAlpha = 0.45 * (1 - zNear / 500);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pNearL.x + (pNearR.x - pNearL.x) * 0.2, pNearL.y);
        ctx.lineTo(pNearR.x - (pNearR.x - pNearL.x) * 0.2, pNearR.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Pulau: daratan selebar pulau, dengan pantai di tepinya.
      if (seg.ground > 2) {
        const halfNear = islandHalfWidth(world.course, seg.d);
        const halfFar = islandHalfWidth(world.course, next.d);
        if (halfNear > 10 && halfFar > 10) {
          // Pantai: pita pasir tipis di tepi pulau, sedikit lebih lebar.
          const bNearL = project(seg.center - halfNear * 1.08, seg.ground * 0.3, zNear, camX, camY, horizonY);
          const bNearR = project(seg.center + halfNear * 1.08, seg.ground * 0.3, zNear, camX, camY, horizonY);
          const bFarL = project(next.center - halfFar * 1.08, next.ground * 0.3, zFar, camX, camY, horizonY);
          const bFarR = project(next.center + halfFar * 1.08, next.ground * 0.3, zFar, camX, camY, horizonY);
          ctx.fillStyle = pal.beach;
          ctx.beginPath();
          ctx.moveTo(bNearL.x, bNearL.y);
          ctx.lineTo(bNearR.x, bNearR.y);
          ctx.lineTo(bFarR.x, bFarR.y);
          ctx.lineTo(bFarL.x, bFarL.y);
          ctx.closePath();
          ctx.fill();
          // Darat: hijau dengan puncak membulat — tepi atas melengkung ke atas
          // supaya pulau terbaca sebagai bukit, bukan meja datar.
          const lNearL = project(seg.center - halfNear, seg.ground, zNear, camX, camY, horizonY);
          const lNearR = project(seg.center + halfNear, seg.ground, zNear, camX, camY, horizonY);
          const lFarL = project(next.center - halfFar, next.ground, zFar, camX, camY, horizonY);
          const lFarR = project(next.center + halfFar, next.ground, zFar, camX, camY, horizonY);
          const liftFar = (lFarL.y - project(next.center, next.ground * 1.9, zFar, camX, camY, horizonY).y) * 0.5;
          ctx.fillStyle = seg.ground > 40 ? pal.landFar : pal.landMid;
          ctx.beginPath();
          ctx.moveTo(lNearL.x, lNearL.y);
          ctx.lineTo(lNearR.x, lNearR.y);
          ctx.lineTo(lFarR.x, lFarR.y);
          ctx.quadraticCurveTo((lFarL.x + lFarR.x) / 2, lFarL.y - liftFar, lFarL.x, lFarL.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    // Garis horizon tipis supaya laut dan langit menyatu.
    ctx.strokeStyle = pal.haze;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(W, horizonY);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Pita kabut hangat di atas horizon (v3): langit dan laut menyatu.
    const hazeG = ctx.createLinearGradient(0, horizonY - 30, 0, horizonY + 2);
    hazeG.addColorStop(0, 'rgba(255,240,200,0)');
    hazeG.addColorStop(1, pal.haze);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = hazeG;
    ctx.fillRect(0, horizonY - 30, W, 32);
    ctx.globalAlpha = 1;
  }

  function drawClouds(world, state, pal, time) {
    const horizonY = horizonYFor(state);
    const camY = camYFor(state);
    for (const cl of world.course.clouds) {
      const z = cl.d - state.dist;
      if (z < 20 || z > 6000) continue;
      const wx = centerAt(world.course, cl.d) + cl.x + Math.sin(time * 0.05 + cl.drift) * 30;
      const p = project(wx, cl.alt, z, state.x, camY, horizonY);
      const r = cl.s * p.scale * (W / 2) * 0.9;
      if (r < 2) continue;
      ctx.fillStyle = pal.cloud;
      ctx.globalAlpha = clamp(0.75 - z / 9000, 0.12, 0.75);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.36, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - r * 0.55, p.y + r * 0.08, r * 0.6, r * 0.26, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + r * 0.55, p.y + r * 0.06, r * 0.65, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawRunway(world, state, pal) {
    drawRunwayStrip(world, state, world.course.runway.d - 260, world.course.runway.d + 60);
    // Landasan berangkat di bawah pesawat saat start — terlihat di menu.
    drawRunwayStrip(world, state, -260, 60);
  }

  function drawRunwayStrip(world, state, d0, d1) {
    const horizonY = horizonYFor(state);
    const camY = camYFor(state);
    const rw = world.course.runway;
    const c0 = centerAt(world.course, Math.max(d0, state.dist + 6));
    const c1 = centerAt(world.course, d1);
    const z0 = Math.max(d0, state.dist + 6) - state.dist;
    const z1 = d1 - state.dist;
    if (z1 < 4 || z0 > 6000) return;
    const g0 = terrainAt(world.course, Math.max(d0, state.dist + 6));
    const g1 = terrainAt(world.course, d1);
    const a = project(c0 - rw.halfWidth, g0, Math.max(2, z0), state.x, camY, horizonY);
    const b = project(c0 + rw.halfWidth, g0, Math.max(2, z0), state.x, camY, horizonY);
    const cPt = project(c1 + rw.halfWidth, g1, Math.max(2, z1), state.x, camY, horizonY);
    const dPt = project(c1 - rw.halfWidth, g1, Math.max(2, z1), state.x, camY, horizonY);
    // Aspal.
    ctx.fillStyle = '#3a3f46';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(cPt.x, cPt.y);
    ctx.lineTo(dPt.x, dPt.y);
    ctx.closePath();
    ctx.fill();
    // Garis tengah putus-putus (proyeksi tiap 30 m).
    ctx.fillStyle = '#f5f0dc';
    for (let d = d0 + 10; d < d1 - 10; d += 32) {
      const z = d - state.dist;
      if (z < 4) continue;
      const cc = centerAt(world.course, d);
      const gg = terrainAt(world.course, d);
      const p = project(cc, gg, z, state.x, camY, horizonY);
      const w = Math.max(1, 1.6 * p.scale * (W / 2));
      const h = Math.max(1.5, 8 * p.scale * (H / 2));
      ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
    }
    // Lampu tepi landasan (amber) + PAPI.
    for (let d = d0 + 20; d < d1; d += 60) {
      const z = d - state.dist;
      if (z < 4) continue;
      const cc = centerAt(world.course, d);
      const gg = terrainAt(world.course, d);
      for (const side of [-1, 1]) {
        const p = project(cc + side * rw.halfWidth, gg, z, state.x, camY, horizonY);
        ctx.fillStyle = '#ffb02e';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, 2.2 * p.scale * (W / 2) * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Nomor landasan "27" di ujung dekat.
    const numP = project(c0, g0, Math.max(2, z0), state.x, camY, horizonY);
    if (z0 > 4 && z0 < 900) {
      ctx.fillStyle = '#f5f0dc';
      ctx.font = `bold ${Math.max(10, 26 * numP.scale * (W / 2) * 0.06)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('27', numP.x, numP.y);
    }
  }

  function drawRings(world, state, pal) {
    const horizonY = horizonYFor(state);
    const camY = camYFor(state);
    const rings = [...world.course.rings].sort((a, b) => b.d - a.d);
    for (const ring of rings) {
      const z = ring.d - state.dist;
      if (z < 8 || z > 5200) continue;
      const cx = centerAt(world.course, ring.d) + ring.x;
      const p = project(cx, ring.alt, z, state.x, camY, horizonY);
      const rx = ring.r * p.scale * (W / 2);
      const ry = rx * 0.88;
      if (rx < 2) continue;
      const passed = ring.passed;
      const col = passed ? '#37d67a' : '#ff8c1a';
      const glow = passed ? 'rgba(55,214,122,0.35)' : 'rgba(255,140,26,0.4)';
      ctx.save();
      ctx.globalAlpha = passed ? 0.55 : 0.95;
      // Halo.
      ctx.strokeStyle = glow;
      ctx.lineWidth = Math.max(2, rx * 0.22);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Torus.
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1.5, rx * 0.1);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, rx * 0.03);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx * 0.86, ry * 0.86, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Chevron arah terbang di tengah ring.
      if (!passed) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        const s = Math.max(3, rx * 0.16);
        ctx.beginPath();
        ctx.moveTo(p.x - s, p.y - s * 0.7);
        ctx.lineTo(p.x + s * 0.4, p.y);
        ctx.lineTo(p.x - s, p.y + s * 0.7);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Landmark dunia: mercusuar, desa, palem — supaya terrain terbaca sebagai
  // tempat yang dikenali, bukan blok warna abstrak. Digambar jauh-ke-dekat.
  function drawLandmarks(world, state, pal, time) {
    const lm = world.course.landmarks;
    if (!lm) return;
    const items = [
      { d: lm.lighthouse.d, kind: 'lighthouse' },
      { d: lm.village.d, kind: 'village' },
    ];
    for (const p of lm.palms) items.push({ d: p.d, kind: 'palm', p });
    items.sort((a, b) => b.d - a.d);
    for (const it of items) {
      const z = it.d - state.dist;
      if (z < 12 || z > 5200) continue;
      const cx = centerAt(world.course, it.d);
      if (it.kind === 'lighthouse') drawLighthouse(world, state, pal, time, cx + lm.lighthouse.x, it.d, lm.lighthouse.h);
      else if (it.kind === 'village') drawVillage(world, state, pal, time, cx + lm.village.x, it.d);
      else drawPalm(world, state, pal, cx + it.p.x, it.d, it.p);
    }
  }

  // Mercusuar Tanjung Biru: menara meruncing belang merah-putih, galeri +
  // lampu, dan sorot yang berputar saat gelap.
  function drawLighthouse(world, state, pal, time, wx, d, hFt) {
    const horizonY = horizonYFor(state);
    const camY = camYFor(state);
    const g = terrainAt(world.course, d);
    const base = project(wx, g, d - state.dist, state.x, camY, horizonY);
    const top = project(wx, g + hFt, d - state.dist, state.x, camY, horizonY);
    const hPx = base.y - top.y;
    if (hPx < 4) return;
    const wBase = Math.max(2, hPx * 0.16);
    const wTop = Math.max(1.5, hPx * 0.09);
    const night = !!pal.stars;
    // Sorot (beam) saat gelap: segitiga tembus pandang dari lampu.
    if (night) {
      const ang = Math.sin(time * 0.5) * 0.9;
      const bx = top.x + Math.cos(ang) * hPx * 3.2;
      const by = top.y + Math.sin(ang) * hPx * 0.5;
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#fff6c8';
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(bx + hPx * 0.35, by - hPx * 0.22);
      ctx.lineTo(bx + hPx * 0.35, by + hPx * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Menara: tiga belang (putih-merah-putih).
    const bands = ['#f2ede0', '#c23b2e', '#f2ede0'];
    for (let i = 0; i < 3; i++) {
      const y0 = base.y - (hPx * i) / 3;
      const y1 = base.y - (hPx * (i + 1)) / 3;
      const w0 = wBase + ((wTop - wBase) * i) / 3;
      const w1 = wBase + ((wTop - wBase) * (i + 1)) / 3;
      ctx.fillStyle = bands[i];
      ctx.beginPath();
      ctx.moveTo(base.x - w0, y0);
      ctx.lineTo(base.x + w0, y0);
      ctx.lineTo(base.x + w1, y1);
      ctx.lineTo(base.x - w1, y1);
      ctx.closePath();
      ctx.fill();
    }
    // Galeri + ruang lampu.
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(top.x - wTop * 1.5, top.y - hPx * 0.12, wTop * 3, hPx * 0.1);
    ctx.fillStyle = night ? '#ffe9a8' : '#3a4a5a';
    ctx.beginPath();
    ctx.arc(top.x, top.y - hPx * 0.16, Math.max(1.5, wTop * 0.8), 0, Math.PI * 2);
    ctx.fill();
    if (night) {
      const glow = ctx.createRadialGradient(top.x, top.y - hPx * 0.16, 1, top.x, top.y - hPx * 0.16, hPx * 0.9);
      glow.addColorStop(0, 'rgba(255,233,168,0.55)');
      glow.addColorStop(1, 'rgba(255,233,168,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(top.x - hPx, top.y - hPx * 1.1, hPx * 2, hPx * 2);
    }
  }

  // Desa Senja: deret rumah dengan jendela hangat yang menyala saat gelap.
  function drawVillage(world, state, pal, time, wx, d) {
    const horizonY = horizonYFor(state);
    const camY = camYFor(state);
    const g = terrainAt(world.course, d);
    const night = !!pal.stars;
    const dusk = pal === PALETTES.sunset || pal === PALETTES.storm;
    for (let i = 0; i < 6; i++) {
      const hx = wx + (i - 2.5) * 34;
      const p = project(hx, g, d - state.dist, state.x, camY, horizonY);
      const s = p.scale * (W / 2);
      const w = Math.max(2, 16 * s * 0.09);
      const h = Math.max(2, 13 * s * 0.09);
      if (w < 2.5) continue;
      // Dinding + atap.
      ctx.fillStyle = i % 2 === 0 ? '#e8dcc0' : '#d9c9a8';
      ctx.fillRect(p.x - w / 2, p.y - h, w, h);
      ctx.fillStyle = i % 2 === 0 ? '#a34d2d' : '#7a4a2e';
      ctx.beginPath();
      ctx.moveTo(p.x - w / 2 - 1, p.y - h);
      ctx.lineTo(p.x, p.y - h * 1.55);
      ctx.lineTo(p.x + w / 2 + 1, p.y - h);
      ctx.closePath();
      ctx.fill();
      // Jendela hangat.
      if (night || dusk) {
        ctx.fillStyle = '#ffca6a';
        ctx.shadowColor = 'rgba(255,190,80,0.9)';
        ctx.shadowBlur = Math.max(2, w * 0.4);
        ctx.fillRect(p.x - w * 0.22, p.y - h * 0.72, w * 0.2, h * 0.3);
        ctx.fillRect(p.x + w * 0.05, p.y - h * 0.72, w * 0.2, h * 0.3);
        ctx.shadowBlur = 0;
      }
    }
  }

  // Palem di pantai: batang melengkung + pelepah.
  function drawPalm(world, state, pal, wx, d, p) {
    const horizonY = horizonYFor(state);
    const camY = camYFor(state);
    const g = terrainAt(world.course, d);
    const base = project(wx, g, d - state.dist, state.x, camY, horizonY);
    const top = project(wx, g + p.h, d - state.dist, state.x, camY, horizonY);
    const hPx = base.y - top.y;
    if (hPx < 3) return;
    const lean = p.lean * hPx * 0.4;
    ctx.strokeStyle = '#6b4a2a';
    ctx.lineWidth = Math.max(1, hPx * 0.05);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.quadraticCurveTo(base.x + lean * 0.4, base.y - hPx * 0.6, top.x + lean, top.y);
    ctx.stroke();
    ctx.strokeStyle = pal.landNear;
    ctx.lineWidth = Math.max(1, hPx * 0.045);
    for (let i = 0; i < 5; i++) {
      const a = -0.4 - (i * Math.PI) / 7;
      ctx.beginPath();
      ctx.moveTo(top.x + lean, top.y);
      ctx.quadraticCurveTo(
        top.x + lean + Math.cos(a) * hPx * 0.42,
        top.y + Math.sin(a) * hPx * 0.3 - hPx * 0.08,
        top.x + lean + Math.cos(a) * hPx * 0.62,
        top.y + Math.sin(a) * hPx * 0.42 + hPx * 0.14,
      );
      ctx.stroke();
    }
  }

  // Hujan untuk palet badai: garis diagonal, posisi dari dist + indeks
  // (deterministik per shot, bergerak saat waktu berjalan).
  function drawRain(state, pal, time) {
    if (!pal.rain) return;
    ctx.strokeStyle = 'rgba(205,225,240,0.34)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 90; i++) {
      const hx = Math.sin(i * 12.9898) * 43758.5453;
      const hy = Math.sin(i * 78.233) * 12543.1234;
      const fx = hx - Math.floor(hx);
      const fy = hy - Math.floor(hy);
      const x = ((fx * W + time * 260 + state.dist * 0.35) % W + W) % W;
      const y = ((fy * H + time * 620 + state.dist * 1.7) % H + H) % H;
      const len = 12 + fy * 14;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * 0.22, y + len);
      ctx.stroke();
    }
  }

  function drawBirds(world, state, time) {
    const horizonY = horizonYFor(state);
    const camY = camYFor(state);
    ctx.strokeStyle = 'rgba(30,30,40,0.7)';
    ctx.lineWidth = 1.6;
    for (const b of world.course.birds) {
      const z = b.d - state.dist + Math.sin(time * b.speed + b.phase) * 12;
      if (z < 10 || z > 1500) continue;
      const p = project(centerAt(world.course, b.d) + b.x, b.alt + Math.sin(time * 2 + b.phase) * 6, z, state.x, camY, horizonY);
      const w = Math.max(2, 7 * p.scale * (W / 2) * 0.35);
      const flap = Math.sin(time * 6 + b.phase) * w * 0.4;
      ctx.beginPath();
      ctx.moveTo(p.x - w, p.y - flap);
      ctx.quadraticCurveTo(p.x, p.y + w * 0.25, p.x + w, p.y - flap);
      ctx.stroke();
    }
  }

  // Pesawat dari belakang (chase view): badan, sayap, ekor, lampu nav.
  // v3: pesawat 1,35x lebih besar di frame + baling-baling blur + halo lampu.
  function drawPlane(world, state, pal, time) {
    const px = W / 2;
    const py = H * 0.68 - state.pitch * 26;
    const s = (Math.min(W, H) / 720) * 1.35; // skala dasar
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-state.bank * 0.85);
    ctx.scale(s, s);
    // Jejak asap ujung sayap saat bank keras.
    if (Math.abs(state.bank) > 0.55) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 3;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 118, 6);
        ctx.quadraticCurveTo(side * 150, 26 + Math.sin(time * 9) * 4, side * 168, 52);
        ctx.stroke();
      }
    }
    // Sayap: kiri-kanan dengan dihedral.
    ctx.fillStyle = '#e8e2d2';
    ctx.strokeStyle = '#b8b09a';
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 18, -6);
      ctx.lineTo(side * 132, -26 - side * 0);
      ctx.lineTo(side * 138, -10);
      ctx.lineTo(side * 20, 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // Stripe sayap teal.
    ctx.fillStyle = '#0f766e';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 52, -13);
      ctx.lineTo(side * 96, -21);
      ctx.lineTo(side * 99, -13);
      ctx.lineTo(side * 54, -6);
      ctx.closePath();
      ctx.fill();
    }
    // Badan: meruncing ke ekor (atas layar = depan pesawat menjauh).
    const body = ctx.createLinearGradient(0, -64, 0, 46);
    body.addColorStop(0, '#f4efe2');
    body.addColorStop(0.6, '#e8e2d2');
    body.addColorStop(1, '#c9c2ae');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-16, -62);
    ctx.quadraticCurveTo(-20, -10, -13, 34);
    ctx.quadraticCurveTo(0, 46, 13, 34);
    ctx.quadraticCurveTo(20, -10, 16, -62);
    ctx.quadraticCurveTo(0, -72, -16, -62);
    ctx.fill();
    // Stripe livery + tulisan.
    ctx.fillStyle = '#0f766e';
    ctx.fillRect(-15, -34, 30, 7);
    ctx.fillStyle = '#f97316';
    ctx.fillRect(-15, -27, 30, 3);
    // Jendela kokpit (dari belakang: atap kanopi mengkilap).
    ctx.fillStyle = '#274b63';
    ctx.beginPath();
    ctx.ellipse(0, -52, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-3, -55, 4, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // Baling-baling: cakram blur di depan hidung (terlihat dari belakang).
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#cfd6dd';
    ctx.beginPath();
    ctx.ellipse(0, -58, 13, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Stabilizer horizontal + fin vertikal (ekor).
    ctx.fillStyle = '#e8e2d2';
    ctx.strokeStyle = '#b8b09a';
    ctx.beginPath();
    ctx.moveTo(-52, 30);
    ctx.lineTo(-14, 26);
    ctx.lineTo(-12, 38);
    ctx.lineTo(-50, 42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(52, 30);
    ctx.lineTo(14, 26);
    ctx.lineTo(12, 38);
    ctx.lineTo(50, 42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Fin: sirip tegak dengan logo matahari.
    ctx.fillStyle = '#0f766e';
    ctx.beginPath();
    ctx.moveTo(-8, 34);
    ctx.lineTo(0, -2);
    ctx.lineTo(8, 34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, 22, 4.5, 0, Math.PI * 2);
    ctx.fill();
    // Lampu navigasi: merah kiri, hijau kanan, putih ekor (berkedip).
    // Halo cahaya di tiap lampu supaya terbaca sebagai lampu menyala.
    const blink = Math.sin(time * 6) > 0;
    for (const [lx, col] of [[-136, '#ff3b30'], [136, '#34d17b']]) {
      const halo = ctx.createRadialGradient(lx, -18, 1, lx, -18, 16);
      halo.addColorStop(0, col);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(lx, -18, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-136, -18, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#34d17b';
    ctx.beginPath();
    ctx.arc(136, -18, 4, 0, Math.PI * 2);
    ctx.fill();
    if (blink) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 44, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Bayangan pesawat di tanah/laut saat rendah.
    if (state.alt < 600) {
      const horizonY = horizonYFor(state);
      const g = terrainAt(world.course, state.dist);
      const p = project(state.x, g, 30, state.x, camYFor(state), horizonY);
      const a = clamp(1 - state.alt / 600, 0.08, 0.4);
      ctx.fillStyle = `rgba(20,30,40,${a})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 4, 46 * (1 - state.alt / 700), 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSpeedLines(state) {
    if (state.speed < 120 || state.phase !== 'fly') return;
    const n = Math.floor((state.speed - 120) / 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const edge = i % 2 === 0 ? 0 : 1;
      const y = ((i * 137 + state.dist * 2.2) % (H * 0.9)) + H * 0.05;
      const x0 = edge === 0 ? 0 : W;
      const len = 26 + (state.speed - 120) * 0.5;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + (edge === 0 ? len : -len), y + (edge === 0 ? 6 : -6));
      ctx.stroke();
    }
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(8,18,28,0.58)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    // Bingkai menyala lembut (v3): instrumen terbaca sebagai panel hidup.
    ctx.save();
    ctx.shadowColor = 'rgba(255,176,46,0.5)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(255,220,150,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function hudText(x, y, label, value, unit, opts = {}) {
    ctx.textAlign = opts.align ?? 'left';
    ctx.fillStyle = 'rgba(190,225,245,0.85)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(label, x, y);
    ctx.fillStyle = opts.warn ? '#ff5d47' : '#ffffff';
    ctx.font = `700 ${opts.size ?? 24}px system-ui, sans-serif`;
    ctx.shadowColor = opts.warn ? 'rgba(255,60,40,0.8)' : 'rgba(120,200,255,0.7)';
    ctx.shadowBlur = 8;
    ctx.fillText(value, x, y + 26);
    const valueW = ctx.measureText(value).width;
    ctx.shadowBlur = 0;
    if (unit) {
      ctx.fillStyle = 'rgba(190,225,245,0.85)';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(unit, x + valueW + 6, y + 26);
    }
  }

  function drawCompass(state) {
    const w = 340;
    const x0 = W / 2 - w / 2;
    const y = 14;
    panel(x0, y, w, 34);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y, w, 34);
    ctx.clip();
    const hdg = ((Math.atan2(Math.sin(state.heading), Math.cos(state.heading)) * 180) / Math.PI + 360) % 360;
    const pxPerDeg = w / 120;
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let d = -60; d <= 60; d += 5) {
      const deg = Math.round((hdg + d + 360) % 360);
      const x = W / 2 + d * pxPerDeg;
      const major = deg % 30 === 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 8);
      ctx.lineTo(x, y + (major ? 20 : 15));
      ctx.stroke();
      if (major) {
        const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg);
        ctx.fillText(label, x, y + 31);
      }
    }
    ctx.restore();
    // Penanda heading + angka.
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 6, y + 2);
    ctx.lineTo(W / 2 + 6, y + 2);
    ctx.lineTo(W / 2, y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${String(Math.round(hdg)).padStart(3, '0')}°`, W / 2, y + 46);
  }

  function drawArtificialHorizon(state) {
    const cx = 92;
    const cy = H - 92;
    const r = 66; // v3: lebih besar + bercahaya
    panel(cx - r - 12, cy - r - 12, (r + 12) * 2, (r + 12) * 2);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-state.bank);
    ctx.translate(0, state.pitch * 34);
    ctx.fillStyle = '#5aa3d6';
    ctx.fillRect(-r - 4, -r - 40, (r + 4) * 2, r + 40);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-r - 4, 0, (r + 4) * 2, r + 44);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.restore();
    // Simbol pesawat tetap.
    ctx.strokeStyle = '#ffb02e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 22, cy);
    ctx.lineTo(cx - 6, cy);
    ctx.moveTo(cx + 6, cy);
    ctx.lineTo(cx + 22, cy);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + 6);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Cincin cahaya (v3): horizon buatan tampak menyala.
    ctx.save();
    ctx.shadowColor = 'rgba(255,176,46,0.7)';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = 'rgba(255,220,150,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawGauges(state) {
    const x = W - 178;
    const y = H - 150;
    panel(x, y, 162, 134);
    // Throttle.
    ctx.fillStyle = 'rgba(190,225,245,0.85)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('THR', x + 12, y + 20);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 52, y + 10, 96, 12);
    ctx.fillStyle = '#37b6ff';
    ctx.fillRect(x + 52, y + 10, 96 * state.throttle, 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(`${Math.round(state.throttle * 100)}%`, x + 52, y + 38);
    // Fuel.
    ctx.fillStyle = 'rgba(190,225,245,0.85)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText('FUEL', x + 12, y + 58);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 52, y + 48, 96, 12);
    ctx.fillStyle = state.fuel < 25 ? '#ff5d47' : '#37d67a';
    ctx.fillRect(x + 52, y + 48, 96 * clamp(state.fuel / 100, 0, 1), 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(`${Math.round(state.fuel)}`, x + 52, y + 76);
    // Damage.
    ctx.fillStyle = 'rgba(190,225,245,0.85)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText('DMG', x + 12, y + 96);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 52, y + 86, 96, 12);
    ctx.fillStyle = state.damage > 60 ? '#ff5d47' : state.damage > 0 ? '#ffb02e' : '#37d67a';
    ctx.fillRect(x + 52, y + 86, 96 * clamp(state.damage / 100, 0, 1), 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(`${Math.round(state.damage)}%`, x + 52, y + 114);
    // Peringatan.
    if (state.fuel < 25 && state.phase === 'fly') {
      ctx.fillStyle = Math.sin(Date.now() / 180) > 0 ? '#ff5d47' : '#ffffff';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LOW FUEL', x + 81, y + 130);
    }
  }

  function drawHUD(world, state, time) {
    const m = world.mission;
    // Kiri atas: ALT / SPD / V/S.
    panel(14, 14, 216, 118);
    hudText(28, 34, 'ALTITUDE', String(Math.round(state.alt)), 'ft');
    hudText(28, 78, 'SPEED', String(Math.round(state.speed)), 'kt', { warn: state.stallWarn });
    ctx.fillStyle = 'rgba(190,225,245,0.85)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('VERT SPEED', 150, 78);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillText(`${state.vspeed >= 0 ? '+' : ''}${Math.round(state.vspeed * 60)}`, 150, 104);
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(190,225,245,0.85)';
    ctx.fillText('ft/min', 150, 118);
    drawCompass(state);
    // Kanan atas: misi, ring, skor, waktu.
    panel(W - 230, 14, 216, 118);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(190,225,245,0.85)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(m.name.toUpperCase(), W - 216, 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.fillText(`RING ${state.ringsHit}/${state.ringsTotal}`, W - 216, 62);
    ctx.fillStyle = '#ffb02e';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillText(`SKOR ${state.score}`, W - 216, 90);
    // Progress ring + tingkat kesulitan.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(W - 216, 96, 188, 6);
    ctx.fillStyle = state.ringsHit === state.ringsTotal ? '#37d67a' : '#ff8c1a';
    ctx.fillRect(W - 216, 96, 188 * (state.ringsTotal > 0 ? state.ringsHit / state.ringsTotal : 0), 6);
    ctx.fillStyle = 'rgba(190,225,245,0.9)';
    ctx.font = '600 13px system-ui, sans-serif';
    const distLeft = Math.max(0, Math.round((world.course.lengthM - state.dist) / 100) / 10);
    const timeTxt = m.timeLimit > 0
      ? `WAKTU ${Math.max(0, Math.ceil(m.timeLimit - state.time))} dtk`
      : `SISA ${distLeft} km`;
    ctx.fillText(`${timeTxt}  ·  ${m.diffName ? m.diffName.toUpperCase() : 'NORMAL'}`, W - 216, 114);
    drawArtificialHorizon(state);
    drawGauges(state);
    // Panah ke ring berikutnya.
    const ring = world.course.rings.find((r) => !r.passed && state.dist < r.d + 14);
    if (ring && state.phase === 'fly') {
      const dx = ring.x - state.x;
      const dy = (ring.alt - state.alt) / 3.28;
      const ang = Math.atan2(dy, dx);
      const ax = W / 2 + Math.cos(ang) * 210;
      const ay = H * 0.5 + Math.sin(ang) * 120;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(255,140,26,0.9)';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -9);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      const dz = Math.round(ring.d - state.dist);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${dz} m`, W / 2, H * 0.5 - 128);
    }
    // Landasan dekat: info jarak.
    const rwD = world.course.lengthM - state.dist;
    if (rwD < 900 && rwD > 0 && state.phase === 'fly') {
      ctx.fillStyle = '#37d67a';
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`▼ LANDASAN ${Math.round(rwD)} m — KURANGI KECEPATAN, TURUN PERLAHAN ▼`, W / 2, H - 176);
    }
    // Pesan + stall.
    if (state.messageT > 0 && state.message) {
      ctx.globalAlpha = clamp(state.messageT, 0, 1);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 6;
      ctx.fillText(state.message, W / 2, H * 0.24);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    if (state.stallWarn && state.phase === 'fly') {
      ctx.fillStyle = Math.sin(time * 10) > 0 ? '#ff5d47' : '#ffffff';
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ STALL — TAMBAH THROTTLE ⚠', W / 2, H * 0.3);
    }
  }

  function drawTitle(world, bests, selected, difficulty) {
    ctx.fillStyle = 'rgba(6,14,24,0.3)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 14;
    ctx.font = '800 60px system-ui, sans-serif';
    ctx.fillText('SKYLANE COURIER', W / 2, H * 0.2);
    ctx.font = '600 19px system-ui, sans-serif';
    ctx.fillStyle = '#ffd98a';
    ctx.fillText('Kurir udara Kepulauan Senja — terbang, lewati ring, mendarat mulus.', W / 2, H * 0.2 + 34);
    ctx.shadowBlur = 0;
    // Kartu misi (5 kartu sebaris).
    const cardW = 224;
    const cardH = 210;
    const gap = 14;
    const totalW = cardW * 5 + gap * 4;
    let x = W / 2 - totalW / 2;
    const y = H * 0.33;
    MISSIONS.forEach((mm, i) => {
      const sel = i === selected;
      ctx.fillStyle = sel ? 'rgba(15,118,110,0.88)' : 'rgba(8,18,28,0.72)';
      ctx.strokeStyle = sel ? '#ffb02e' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = sel ? 3 : 1;
      ctx.beginPath();
      ctx.roundRect(x, y, cardW, cardH, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      // Kecilkan font nama bila terlalu lebar untuk kartu.
      let nameSize = 17;
      ctx.font = `700 ${nameSize}px system-ui, sans-serif`;
      while (ctx.measureText(mm.name).width > cardW - 24 && nameSize > 12) {
        nameSize -= 1;
        ctx.font = `700 ${nameSize}px system-ui, sans-serif`;
      }
      ctx.fillText(mm.name, x + cardW / 2, y + 32);
      ctx.fillStyle = '#ffd98a';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText(mm.sub, x + cardW / 2, y + 54);
      ctx.fillStyle = 'rgba(230,240,250,0.92)';
      ctx.font = '400 12px system-ui, sans-serif';
      wrapText(mm.brief, x + 16, y + 80, cardW - 32, 16);
      const best = bests[mm.id] ?? 0;
      ctx.textAlign = 'center'; // wrapText mengeset left; kembalikan ke tengah
      ctx.fillStyle = '#37d67a';
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.fillText(best > 0 ? `TERBAIK: ${best}` : 'BELUM DIMAINKAN', x + cardW / 2, y + cardH - 18);
      x += cardW + gap;
    });
    // Pil tingkat kesulitan di bawah kartu.
    const diffText = `TINGKAT: ${difficulty.name.toUpperCase()}  ·  tekan T untuk ganti (Mudah / Normal / Sulit)`;
    ctx.font = '700 15px system-ui, sans-serif';
    const dw = ctx.measureText(diffText).width + 36;
    panel(W / 2 - dw / 2, y + cardH + 14, dw, 34);
    ctx.fillStyle = '#ffd98a';
    ctx.textAlign = 'center';
    ctx.fillText(diffText, W / 2, y + cardH + 37);
    // Baris kontrol + kredit di atas panel gelap supaya terbaca di atas landasan.
    const ctrlText = '1-5 misi · T kesulitan · Enter terbang · W/S throttle · ←/→ belok · ↑/↓ naik-turun · Space rem';
    const creditText = 'Game orisinal — dibuat untuk bounty make.fun “Make the best flight game”.';
    ctx.font = '600 14px system-ui, sans-serif';
    const w1 = ctx.measureText(ctrlText).width;
    ctx.font = '400 13px system-ui, sans-serif';
    const w2 = ctx.measureText(creditText).width;
    const pw = Math.max(w1, w2) + 36;
    panel(W / 2 - pw / 2, H - 84, pw, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ctrlText, W / 2, H - 56);
    ctx.fillStyle = 'rgba(230,240,250,0.85)';
    ctx.font = '400 13px system-ui, sans-serif';
    ctx.fillText(creditText, W / 2, H - 32);
  }

  function wrapText(text, x, y, maxW, lh) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    ctx.textAlign = 'left';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = w;
        yy += lh;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  function drawDebrief(world, state, best) {
    ctx.fillStyle = 'rgba(6,14,24,0.55)';
    ctx.fillRect(0, 0, W, H);
    const w = 460;
    const h = 448;
    const x = W / 2 - w / 2;
    const y = H / 2 - h / 2;
    panel(x, y, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = state.phase === 'done' ? '#37d67a' : '#ff5d47';
    ctx.font = '800 44px system-ui, sans-serif';
    ctx.fillText(state.phase === 'done' ? `MISI SELESAI — ${state.grade}` : 'PESAWAT JATUH', W / 2, y + 62);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 16px system-ui, sans-serif';
    if (state.phase === 'crashed') {
      ctx.fillText(state.crashReason, W / 2, y + 92);
      ctx.fillStyle = 'rgba(230,240,250,0.9)';
      ctx.font = '400 15px system-ui, sans-serif';
      ctx.fillText(`Ring dilewati ${state.ringsHit}/${state.ringsTotal} · jarak ${Math.round(state.dist)} m`, W / 2, y + 118);
    } else {
      ctx.fillText(`${world.mission.name} · ${world.mission.diffName ? world.mission.diffName : 'Normal'}`, W / 2, y + 92);
    }
    let yy = y + 128;
    if (state.phase === 'crashed') yy = y + 148;
    ctx.textAlign = 'left';
    ctx.font = '400 15px system-ui, sans-serif';
    for (const row of state.breakdown) {
      ctx.fillStyle = 'rgba(230,240,250,0.9)';
      ctx.fillText(row.label, x + 30, yy);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'right';
      ctx.fillText(`+${row.value}`, x + w - 30, yy);
      ctx.textAlign = 'left';
      yy += 28;
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.moveTo(x + 30, yy + 4);
    ctx.lineTo(x + w - 30, yy + 4);
    ctx.stroke();
    ctx.fillStyle = '#ffb02e';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`SKOR AKHIR  ${state.score}`, W / 2, yy + 40);
    if (state.phase === 'done' && best > 0) {
      ctx.fillStyle = '#37d67a';
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillText(state.score >= best ? '★ SKOR TERBAIK BARU!' : `TERBAIK MISI INI: ${best}`, W / 2, yy + 66);
    }
    ctx.fillStyle = 'rgba(230,240,250,0.9)';
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText('Enter: ulangi misi  ·  N: misi berikutnya', W / 2, y + h - 46);
    ctx.fillText('1-5: ganti misi  ·  R: menu', W / 2, y + h - 24);
  }

  function drawPaused(world) {
    const state = world.state;
    ctx.fillStyle = 'rgba(6,14,24,0.55)';
    ctx.fillRect(0, 0, W, H);
    const w = 460;
    const h = 250;
    const x = W / 2 - w / 2;
    const y = H / 2 - h / 2;
    panel(x, y, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 44px system-ui, sans-serif';
    ctx.fillText('JEDA', W / 2, y + 62);
    ctx.fillStyle = '#ffd98a';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText(`${world.mission.name} · ${world.mission.diffName ? world.mission.diffName : 'Normal'}`, W / 2, y + 94);
    ctx.fillStyle = 'rgba(230,240,250,0.92)';
    ctx.font = '400 16px system-ui, sans-serif';
    ctx.fillText(`Ring ${state.ringsHit}/${state.ringsTotal}  ·  Skor ${state.score}  ·  Bahan bakar ${Math.round(state.fuel)}`, W / 2, y + 126);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText('P: lanjut  ·  1-5: ganti misi  ·  R: kembali ke menu  ·  M: suara', W / 2, y + 170);
    ctx.fillStyle = 'rgba(230,240,250,0.7)';
    ctx.font = '400 13px system-ui, sans-serif';
    ctx.fillText('Pesawat diam — tidak ada bahan bakar yang terbuang saat jeda.', W / 2, y + 200);
  }

  function draw(world, screen, bests, selected, time, difficulty) {
    const state = world.state;
    const pal = PALETTES[world.mission.palette];
    // Langit & darat selalu digambar — menu pun menampilkan dunia.
    drawSky(state, pal, time);
    drawClouds(world, state, pal, time);
    drawGround(world, state, pal);
    drawRunway(world, state, pal);
    drawLandmarks(world, state, pal, time);
    drawRings(world, state, pal);
    drawBirds(world, state, time);
    drawPlane(world, state, pal, time);
    drawSpeedLines(state);
    drawRain(state, pal, time);
    drawVignette();
    if (screen === SCREEN_PLAY) drawHUD(world, state, time);
    if (screen === SCREEN_TITLE) drawTitle(world, bests, selected, difficulty);
    if (screen === SCREEN_OVER) drawDebrief(world, state, bests[world.mission.id] ?? 0);
    if (screen === SCREEN_PAUSED) {
      drawHUD(world, state, time);
      drawPaused(world);
    }
  }

  return { draw, resize };
}
