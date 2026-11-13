/* Marble machine, part 1 of 3: shared helpers.
   Maths, theme tokens, canvas-drawn textures, the motion engine that rolls and drops the balls,
   and the small geometry builders the machine is assembled from.
   Nothing in this file touches THREE until a function is called, so it is safe to load first. */
(function (MM) {
  'use strict';

  // ---------- maths ----------
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sat = v => clamp(v, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ramp = (t, t0, t1) => sat((t - t0) / (t1 - t0));
  const smooth = t => { t = sat(t); return t * t * (3 - 2 * t); };
  const smoother = t => { t = sat(t); return t * t * t * (t * (6 * t - 15) + 10); };
  const easeOut = t => 1 - Math.pow(1 - sat(t), 3);
  const easeIn = t => { t = sat(t); return t * t; };
  const easeOutBack = t => { t = sat(t); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  // step response of a damped spring: 0 -> 1 with overshoot
  const spring = (t, freq, damp) => (t <= 0 ? 0 : 1 - Math.exp(-damp * t) * Math.cos(freq * t));
  // a short damped wobble: 0 at t=0, peaks, dies out
  const wobble = (t, freq, damp) => (t <= 0 ? 0 : Math.exp(-damp * t) * Math.sin(freq * t));
  // deterministic random numbers, so every visitor sees the same run
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  MM.math = { clamp, sat, lerp, ramp, smooth, smoother, easeOut, easeIn, easeOutBack, spring, wobble, rng };

  // ---------- dimensions ----------
  // A staircase of four steps. Step k (1 = top) has its tread at treadY(k) and starts at treadZ(k).
  const D = MM.D = {
    W: 6.4,        // staircase width (x)
    RH: 2.0,       // riser height
    TD: 1.8,       // tread depth
    STEPS: 4,
    R: 0.17,       // marble radius
    G: 20,         // gravity, units per second squared
    ROLL: 5 / 7,   // a rolling solid sphere accelerates at 5/7 of a sliding one
    SIGN_W: 4.7,   // split-flap board on each riser
    SIGN_H: 1.24,
    SIGN_TOP: 0.2  // gap between the tread above and the top of the board
  };
  D.treadY = k => (D.STEPS + 1 - k) * D.RH;
  D.treadZ = k => (k - 1) * D.TD;

  // ---------- loading three.js ----------
  // index.html asks jsDelivr first; if that failed, try the same file from two other CDNs.
  MM.ensureThree = function () {
    if (window.THREE) return Promise.resolve();
    const urls = [
      'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.159.0/three.min.js',
      'https://unpkg.com/three@0.159.0/build/three.min.js'
    ];
    return urls.reduce(function (p, url) {
      return p.catch(function () {
        return new Promise(function (resolve, reject) {
          const s = document.createElement('script');
          s.src = url;
          s.onload = function () { window.THREE ? resolve() : reject(new Error('three.js did not load')); };
          s.onerror = function () { reject(new Error('three.js did not load')); };
          document.head.appendChild(s);
        });
      });
    }, Promise.reject());
  };

  // ---------- theme tokens ----------
  // Colours live in styles.css as custom properties; the 3D scene reads them from there,
  // so the page and the model always agree and both follow light/dark.
  const TOKEN_NAMES = ['paper', 'grid', 'grid-strong', 'ink', 'ink-soft', 'label', 'shade', 'model', 'track',
    'steel', 'dark', 'red', 'yellow', 'mint', 'pink', 'sign-ink'];
  MM.readTokens = function () {
    const cs = getComputedStyle(document.documentElement);
    const css = {};
    TOKEN_NAMES.forEach(function (n) { css[n] = cs.getPropertyValue('--' + n).trim() || '#888888'; });
    return { css: css, dark: cs.getPropertyValue('--is-dark').trim() === '1' };
  };

  // ---------- materials ----------
  MM.makeMaterials = function () {
    const std = (token, o) => {
      const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.6, metalness: 0 }, o || {}));
      m.userData.token = token;
      return m;
    };
    return {
      model: std('model', { roughness: 0.9 }),
      label: std('label', { roughness: 0.85 }),
      track: std('track', { roughness: 0.7 }),
      steel: std('steel', { roughness: 0.28, metalness: 0.85 }),
      dark: std('dark', { roughness: 0.5 }),
      ink: std('sign-ink', { roughness: 0.6 }),
      red: std('red', { roughness: 0.42 }),
      yellow: std('yellow', { roughness: 0.42 }),
      mint: std('mint', { roughness: 0.42 }),
      pink: std('pink', { roughness: 0.42 })
    };
  };
  MM.applyTokens = function (mats, tokens) {
    Object.keys(mats).forEach(function (k) {
      const m = mats[k];
      if (m.userData.token) m.color.set(tokens.css[m.userData.token]);
    });
  };

  // ---------- canvas textures ----------
  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = MM.maxAnisotropy || 4;
    tex.redraw = function (arg) { draw(ctx, w, h, arg); tex.needsUpdate = true; };
    tex.redraw();
    return tex;
  }
  MM.canvasTexture = canvasTexture;

  // drafting grid for the floor: one tile covers 4 x 4 units
  MM.gridTexture = function (getTokens) {
    const tex = canvasTexture(512, 512, function (ctx, w, h) {
      const css = getTokens().css, cell = w / 4;
      ctx.fillStyle = css.paper; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = css.grid; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, h);
        ctx.moveTo(0, i * cell); ctx.lineTo(w, i * cell);
      }
      ctx.stroke();
      ctx.strokeStyle = css['grid-strong']; ctx.lineWidth = 7;   // half of this falls on each side of the tile seam
      ctx.strokeRect(0, 0, w, h);
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  };

  const FONT_DISPLAY = '"Big Shoulders Display", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  const FONT_HAND = '"Architects Daughter", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
  MM.FONT_DISPLAY = FONT_DISPLAY;
  MM.FONT_HAND = FONT_HAND;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // pictograms on the signs, drawn inside a square of side s centred on (cx, cy)
  function drawIcon(ctx, name, cx, cy, s, ink, face) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (name === 'pad') {              // game controller
      roundRect(ctx, -s * 0.56, -s * 0.33, s * 1.12, s * 0.66, s * 0.3); ctx.fill();
      ctx.fillStyle = face;
      ctx.fillRect(-s * 0.37, -s * 0.045, s * 0.26, s * 0.09);
      ctx.fillRect(-s * 0.285, -s * 0.13, s * 0.09, s * 0.26);
      ctx.beginPath(); ctx.arc(s * 0.2, s * 0.07, s * 0.065, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.36, -s * 0.07, s * 0.065, 0, 7); ctx.fill();
    } else if (name === 'pen') {       // pencil
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-s * 0.13, -s * 0.56, s * 0.26, s * 0.74);
      ctx.beginPath(); ctx.moveTo(-s * 0.13, s * 0.24); ctx.lineTo(s * 0.13, s * 0.24); ctx.lineTo(0, s * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = face; ctx.fillRect(-s * 0.13, -s * 0.42, s * 0.26, s * 0.06);
    } else if (name === 'play') {      // play button
      roundRect(ctx, -s * 0.54, -s * 0.4, s * 1.08, s * 0.8, s * 0.14); ctx.fill();
      ctx.fillStyle = face;
      ctx.beginPath(); ctx.moveTo(-s * 0.15, -s * 0.22); ctx.lineTo(s * 0.24, 0); ctx.lineTo(-s * 0.15, s * 0.22); ctx.closePath(); ctx.fill();
    } else {                           // face
      ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, 7); ctx.fill();
      ctx.fillStyle = face; ctx.strokeStyle = face;
      ctx.beginPath(); ctx.arc(-s * 0.17, -s * 0.12, s * 0.065, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.17, -s * 0.12, s * 0.065, 0, 7); ctx.fill();
      ctx.lineWidth = s * 0.075;
      ctx.beginPath(); ctx.arc(0, s * 0.03, s * 0.27, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
    }
    ctx.restore();
  }

  // The lit face of a sign: icon, label, arrow. All signs share one type size - the largest at
  // which the longest label still fits. `typed` (optional) shows only that many letters followed
  // by a block cursor; the typewriter uses it.
  MM.drawSignFace = function (ctx, w, h, sec, css, typed) {
    const face = css[sec.color], ink = css['sign-ink'];
    ctx.fillStyle = face; ctx.fillRect(0, 0, w, h);
    drawIcon(ctx, sec.icon, h * 0.52, h * 0.5, h * 0.45, ink, face);

    const base = Math.round(h * 0.74), x0 = h * 0.94, room = w - x0 - h * 0.6;
    const widthOf = function (text, size) {
      ctx.font = '800 ' + size + 'px ' + FONT_DISPLAY;
      let x = 0;
      for (let i = 0; i < text.length; i++) x += ctx.measureText(text[i]).width + size * 0.05;
      return x;
    };
    let widest = 1;
    (sec.siblings || [sec.label]).forEach(function (l) { widest = Math.max(widest, widthOf(l.toUpperCase(), base)); });
    const size = Math.round(base * Math.min(1, room / widest));

    const label = sec.label.toUpperCase();
    ctx.font = '800 ' + size + 'px ' + FONT_DISPLAY;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const cap = ctx.measureText('H').actualBoundingBoxAscent || size * 0.72;
    const baseline = Math.round(h / 2 + cap / 2);
    const n = typed == null ? label.length : typed;
    let x = x0;
    ctx.fillStyle = ink;
    for (let i = 0; i < label.length; i++) {
      const adv = ctx.measureText(label[i]).width + size * 0.05;
      if (i < n) ctx.fillText(label[i], x, baseline);
      else if (i === n) ctx.fillRect(x, baseline - cap, size * 0.3, cap);
      x += adv;
    }
    if (n >= label.length) {                          // chevron: "go"
      const ax = w - h * 0.3, ay = h * 0.5, a = h * 0.15;
      ctx.strokeStyle = ink; ctx.lineWidth = h * 0.085; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(ax - a, ay - a * 1.25); ctx.lineTo(ax, ay); ctx.lineTo(ax - a, ay + a * 1.25); ctx.stroke();
    }
  };

  // the unrevealed side of a sign: hatched, like a part of a drawing still to be filled in
  MM.drawBlankFace = function (ctx, w, h, css) {
    ctx.fillStyle = css.label; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = css.grid; ctx.lineWidth = h * 0.022;
    ctx.beginPath();
    for (let x = -h; x < w; x += h * 0.2) { ctx.moveTo(x, h); ctx.lineTo(x + h, 0); }
    ctx.stroke();
  };

  // a marble with wavy bands, so you can see it roll
  MM.marbleTexture = function (getColors) {
    return canvasTexture(256, 128, function (ctx, w, h) {
      const c = getColors();
      ctx.fillStyle = c[0]; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = c[1]; ctx.lineCap = 'round';
      for (let b = 0; b < 3; b++) {
        ctx.lineWidth = 9 + b * 5;
        ctx.beginPath();
        for (let x = -8; x <= w + 8; x += 4) {
          const y = h * (0.26 + b * 0.24) + Math.sin(x / w * Math.PI * 2 * (b + 1) + b * 1.7) * h * 0.11;
          if (x === -8) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    });
  };

  // diagonal black/white bars for the clapperboard sticks
  MM.stripeTexture = function (getTokens) {
    return canvasTexture(256, 32, function (ctx, w, h) {
      const css = getTokens().css;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = css.dark;
      for (let x = -h; x < w + h; x += 64) {
        ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 32, h); ctx.lineTo(x + 32 + h, 0); ctx.lineTo(x + h, 0); ctx.closePath(); ctx.fill();
      }
    });
  };

  // ---------- geometry helpers ----------
  MM.v3 = (x, y, z) => new THREE.Vector3(x, y, z);

  function shadows(m) { m.castShadow = true; m.receiveShadow = true; return m; }
  MM.mesh = (geo, mat) => shadows(new THREE.Mesh(geo, mat));
  MM.box = (w, h, d, mat) => shadows(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
  MM.cyl = (rTop, rBottom, h, mat, seg) => shadows(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg || 24), mat));
  MM.ball = (r, mat) => shadows(new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), mat));
  MM.put = function (obj, x, y, z, parent) { obj.position.set(x, y, z); if (parent) parent.add(obj); return obj; };

  // Extrude a side profile given as [z, y] pairs along x, from x0 to x1.
  MM.extrudeX = function (profile, x0, x1) {
    const shape = new THREE.Shape(profile.map(p => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);
    g.translate(x1, 0, 0);
    return g;
  };

  // Smooth path through waypoints, returned as evenly spaced points.
  MM.path = function (waypoints, spacing) {
    const curve = new THREE.CatmullRomCurve3(waypoints, false, 'centripetal');
    const n = Math.max(2, Math.round(curve.getLength() / (spacing || 0.04)));
    return curve.getSpacedPoints(n);
  };

  // A U-shaped channel swept along a path of ball-centre points. The channel floor sits one ball
  // radius below the path, so a ball animated along the same points rests exactly on it.
  MM.trackGeometry = function (pts, opt) {
    opt = opt || {};
    const r = opt.radius == null ? D.R : opt.radius;
    const a = (opt.width == null ? 0.37 : opt.width) / 2;
    const b = a + (opt.wall == null ? 0.035 : opt.wall);
    const lip = opt.lip == null ? 0.075 : opt.lip;
    const thick = opt.thick == null ? 0.035 : opt.thick;
    const prof = [[-b, -thick], [-b, lip], [-a, lip], [-a, 0], [a, 0], [a, lip], [b, lip], [b, -thick]];
    const n = pts.length, ne = prof.length;
    const pos = [], nor = [], idx = [];
    const UP = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
    const frames = [];
    for (let i = 0; i < n; i++) {
      const t = pts[Math.min(i + 1, n - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
      const s = new THREE.Vector3().crossVectors(t, UP).normalize();
      const nn = new THREE.Vector3().crossVectors(s, t).normalize();
      frames.push({ t: t, s: s, n: nn, c: pts[i].clone().addScaledVector(nn, -r) });
    }
    const point = (f, p) => v.copy(f.c).addScaledVector(f.s, p[0]).addScaledVector(f.n, p[1]);
    for (let j = 0; j < ne; j++) {
      const p0 = prof[j], p1 = prof[(j + 1) % ne];
      const da = p1[0] - p0[0], db = p1[1] - p0[1], l = Math.hypot(da, db) || 1;
      const na = -db / l, nb = da / l;              // outward normal of this clockwise profile edge
      const base = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const f = frames[i];
        point(f, p0); pos.push(v.x, v.y, v.z);
        point(f, p1); pos.push(v.x, v.y, v.z);
        v.set(0, 0, 0).addScaledVector(f.s, na).addScaledVector(f.n, nb);
        nor.push(v.x, v.y, v.z, v.x, v.y, v.z);
      }
      for (let i = 0; i < n - 1; i++) {
        const v0 = base + i * 2, v1 = v0 + 1, v3 = v0 + 2, v2 = v0 + 3;
        idx.push(v0, v1, v2, v0, v2, v3);
      }
    }
    // close both ends with three rectangles (two walls and the floor slab)
    const rects = [[-b, -thick, -a, lip], [-a, -thick, a, 0], [a, -thick, b, lip]];
    [[frames[0], -1], [frames[n - 1], 1]].forEach(function (end) {
      const f = end[0], sign = end[1];
      rects.forEach(function (q) {
        const base = pos.length / 3;
        [[q[0], q[1]], [q[2], q[1]], [q[2], q[3]], [q[0], q[3]]].forEach(function (p) {
          point(f, p); pos.push(v.x, v.y, v.z);
          nor.push(f.t.x * sign, f.t.y * sign, f.t.z * sign);
        });
        if (sign > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    g.userData.frames = frames;
    g.userData.thick = thick;
    return g;
  };

  // Thin posts holding a raised track up off its tread (y = 0 in the track's own group).
  MM.addPosts = function (group, geo, mat, gap) {
    const frames = geo.userData.frames, thick = geo.userData.thick;
    let since = (gap || 0.6) / 2, prev = frames[0].c;
    frames.forEach(function (f) {
      since += f.c.distanceTo(prev); prev = f.c;
      const top = f.c.y - thick;
      if (since < (gap || 0.6) || top < 0.09) return;
      since = 0;
      MM.put(MM.box(0.055, top, 0.055, mat), f.c.x, top / 2, f.c.z, group);
    });
  };

  // ---------- motion engine ----------
  // Every moving part is a pure function of time, so the run is identical on every device,
  // can be skipped or replayed, and never "fails" the way a live physics simulation can.

  // A ball rolling along a polyline of ball-centre points under gravity, starting at speed v0.
  MM.rail = function (pts, v0, opt) {
    opt = opt || {};
    const drag = opt.drag == null ? 0.2 : opt.drag, vMin = opt.vMin == null ? 0.4 : opt.vMin;
    const n = pts.length, cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + pts[i].distanceTo(pts[i - 1]);
    const len = cum[n - 1], h = 1 / 240, ss = [0];
    let s = 0, v = Math.max(v0, vMin), seg = 0, dur = 0;
    while (s < len && ss.length < 240 * 20) {
      while (seg < n - 2 && cum[seg + 1] <= s) seg++;
      const slope = (pts[seg + 1].y - pts[seg].y) / ((cum[seg + 1] - cum[seg]) || 1e-6);
      v = Math.max(vMin, v + (-D.G * D.ROLL * slope - drag * v) * h);
      const step = v * h;
      if (s + step >= len) { dur += h * (len - s) / step; s = len; } else { s += step; dur += h; }
      ss.push(s);
    }
    const last = ss.length - 1;
    const posAt = function (sv, out) {
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= sv) lo = mid; else hi = mid; }
      return out.copy(pts[lo]).lerp(pts[hi], sat((sv - cum[lo]) / ((cum[hi] - cum[lo]) || 1e-6)));
    };
    const dir = pts[n - 1].clone().sub(pts[n - 2]).normalize();
    return {
      dur: dur, len: len, speedEnd: v, vEnd: dir.multiplyScalar(v),
      at: function (t, out) {
        if (t >= dur) return out.copy(pts[n - 1]);
        const x = clamp(t / h, 0, last), i = Math.floor(x);
        return posAt(i >= last ? len : lerp(ss[i], ss[i + 1], x - i), out);
      }
    };
  };

  // Free flight from p0 with velocity v0, lasting dur seconds.
  MM.flight = function (p0, v0, dur) {
    const p = p0.clone(), vel = v0.clone();
    return {
      dur: dur,
      vEnd: new THREE.Vector3(vel.x, vel.y - D.G * dur, vel.z),
      at: function (t, out) {
        t = clamp(t, 0, dur);
        return out.set(p.x + vel.x * t, p.y + vel.y * t - 0.5 * D.G * t * t, p.z + vel.z * t);
      }
    };
  };
  // how long a ball launched at height y0 with vertical speed vy takes to come down to height y1
  MM.fallTime = (y0, vy, y1) => (vy + Math.sqrt(Math.max(0, vy * vy + 2 * D.G * (y0 - y1)))) / D.G;

  // A custom segment: fn(t, out) for t in [0, dur].
  MM.custom = (dur, fn) => ({ dur: dur, at: (t, out) => fn(clamp(t, 0, dur), out) });

  // A chain of segments laid end to end on the machine's clock.
  MM.Motion = function (start) {
    this.start = start.clone();
    this.end = start.clone();
    this.segs = [];
    this.t0 = 0;
    this.tEnd = 0;
  };
  MM.Motion.prototype = {
    begin: function (t) { this.t0 = t; this.tEnd = t; return this; },
    add: function (seg) {
      seg.t0 = this.tEnd;
      this.segs.push(seg);
      this.tEnd += seg.dur;
      seg.at(seg.dur, this.end);
      return this;
    },
    hold: function (dur) {
      const p = this.end.clone();
      return this.add({ dur: dur, at: (t, out) => out.copy(p) });
    },
    at: function (t, out) {
      if (t <= this.t0 || !this.segs.length) return out.copy(this.start);
      if (t >= this.tEnd) return out.copy(this.end);
      for (let i = this.segs.length - 1; i >= 0; i--) {
        const s = this.segs[i];
        if (t >= s.t0) return s.at(t - s.t0, out);
      }
      return out.copy(this.start);
    }
  };
})(window.MM = window.MM || {});
