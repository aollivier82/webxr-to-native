/* Marble machine, part 3 of 3: the page around the model.
   Renderer and lights, the camera that follows the action and then pulls back to the menu,
   and the handful of controls (push, skip, run again, sound, the four sign links). */
(function (MM) {
  'use strict';
  const M = MM.math, D = MM.D;
  const $ = id => document.getElementById(id);
  const FOV = 18;
  const SPEED = 1.06;              // 1 = real time; raise to make the whole run brisker

  function fallback() {
    const app = $('app');
    app.classList.add('no-gl');
    app.dataset.state = 'done';
  }

  // ---------- sound: everything is synthesised, nothing is downloaded ----------
  MM.sound = (function () {
    let ctx = null, on = false, out = null, noiseBuf = null;
    function ensure() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      out = ctx.createGain();
      out.gain.value = 0.55;
      out.connect(ctx.destination);
      const n = Math.floor(ctx.sampleRate * 0.6);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    function envelope(gain, dur, when) {
      const g = ctx.createGain(), t = ctx.currentTime + (when || 0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(out);
      return g;
    }
    function tone(freq, dur, type, gain, when, slideTo) {
      const o = ctx.createOscillator(), t = ctx.currentTime + (when || 0);
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      o.connect(envelope(gain, dur, when));
      o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, gain, freq, q, when, slideTo) {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), t = ctx.currentTime + (when || 0);
      src.buffer = noiseBuf; src.loop = true;
      f.type = 'bandpass'; f.Q.value = q || 1;
      f.frequency.setValueAtTime(freq, t);
      if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      src.connect(f); f.connect(envelope(gain, dur, when));
      src.start(t); src.stop(t + dur + 0.02);
    }
    const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
    const voices = {
      plunger: function () { noise(0.05, 0.5, 1700, 1); tone(150, 0.13, 'sine', 0.5, 0, 60); },
      clack: function (e) { noise(0.03, 0.4, 2400 + (e.i || 0) * 110, 3); tone(480 + (e.i || 0) * 26, 0.05, 'triangle', 0.14); },
      tick: function () { noise(0.03, 0.35, 1900, 2); },
      tap: function () { noise(0.03, 0.22, 1300, 2); tone(260, 0.05, 'sine', 0.12); },
      thud: function () { tone(120, 0.14, 'sine', 0.5, 0, 70); noise(0.05, 0.2, 600, 1); },
      bumper: function () { tone(660, 0.16, 'square', 0.1); tone(990, 0.24, 'square', 0.09, 0.07); noise(0.04, 0.3, 3200, 1); },
      flap: function () { noise(0.07, 0.45, 850, 1.2); tone(170, 0.08, 'triangle', 0.22); },
      key: function (e) { noise(0.024, e.big ? 0.55 : 0.32, 3300, 4); tone(e.big ? 140 : 230, 0.035, 'square', 0.06); },
      ding: function () { tone(2093, 1.0, 'sine', 0.22); tone(4186, 0.5, 'sine', 0.05); },
      clap: function () { noise(0.1, 0.9, 1300, 0.8); noise(0.035, 0.6, 4200, 1); },
      whirl: function (e) { noise(e.dur || 1.1, 0.16, 500, 2.5, 0, 2200); },
      note: function (e) { const f = SCALE[(e.i || 0) % SCALE.length]; tone(f, 0.75, 'sine', 0.3); tone(f * 4, 0.1, 'sine', 0.05); },
      pop: function () {
        tone(200, 0.32, 'sine', 0.35, 0, 900);
        [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, 1.5, 'triangle', 0.11, 0.14 + i * 0.035); });
        noise(0.25, 0.14, 5200, 0.7, 0.1);
      }
    };
    return {
      enable: function (v) { on = v; if (v) { ensure(); if (ctx && ctx.state !== 'running') ctx.resume(); } },
      unlock: function () { if (on && ctx && ctx.state !== 'running') ctx.resume(); },
      play: function (e) { if (on && ctx && ctx.state === 'running' && voices[e.type]) voices[e.type](e); }
    };
  })();

  function start() {
    if (window.__restoreWarn) window.__restoreWarn();
    const app = $('app'), canvas = $('scene'), titleEl = app.querySelector('.titleblock');
    const pushBtn = $('push'), skipBtn = $('skip'), replayBtn = $('replay'), soundBtn = $('sound');
    const captionEl = $('caption'), skipLink = $('skipLink');
    const hitEls = Array.prototype.slice.call(app.querySelectorAll('.hit'));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { return fallback(); }
    if (!renderer.getContext()) return fallback();

    let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    MM.maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    // ---------- scene ----------
    let tokens = MM.readTokens();
    const getTokens = () => tokens;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(tokens.css.paper);
    const mats = MM.makeMaterials();
    MM.applyTokens(mats, tokens);

    const gridTex = MM.gridTexture(getTokens);
    gridTex.repeat.set(60, 60);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshBasicMaterial({ map: gridTex }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const shadowMat = new THREE.ShadowMaterial({ color: tokens.css.shade, opacity: 0.26, depthWrite: false });
    const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), shadowMat);
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.set(2, 0.006, 0);
    shadowCatcher.receiveShadow = true;
    scene.add(shadowCatcher);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb9c8ee, 1.25);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff8ee, 2.45);
    key.position.set(-7.5, 16, 15);
    key.target.position.set(0.5, 3.5, 3.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -10.5, right: 11.5, top: 10.5, bottom: -9.5, near: 4, far: 48 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.022;
    scene.add(key, key.target);

    // a soft studio environment, used only for reflections on the shiny parts
    const env = (function () {
      const pm = new THREE.PMREMGenerator(renderer);
      const sc = new THREE.Scene();
      const geo = new THREE.SphereGeometry(40, 32, 16), col = [];
      const top = new THREE.Color('#ffffff'), mid = new THREE.Color('#d6e0f6'), low = new THREE.Color('#6f86c4'), c = new THREE.Color();
      for (let i = 0; i < geo.attributes.position.count; i++) {
        const y = geo.attributes.position.getY(i) / 40;
        if (y > 0) c.copy(mid).lerp(top, Math.min(1, y * 1.6)); else c.copy(mid).lerp(low, Math.min(1, -y * 1.4));
        col.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 5) }));
      lamp.position.set(-20, 26, 18); lamp.lookAt(0, 0, 0);
      sc.add(lamp);
      const tex = pm.fromScene(sc, 0.04).texture;
      pm.dispose();
      return tex;
    })();
    mats.steel.envMap = env;
    mats.steel.envMapIntensity = 1.1;

    const sections = hitEls.map(function (el) {
      return { id: (el.getAttribute('href') || '').replace('#', ''), label: el.textContent.trim(), color: el.dataset.color || 'red', icon: el.dataset.icon || 'face', el: el };
    });
    sections.forEach(function (s) { s.siblings = sections.map(x => x.label); });
    const machine = MM.buildMachine({
      mats: mats, getTokens: getTokens, sections: sections, env: env,
      hiRes: pixelRatio * Math.max(window.innerWidth, window.innerHeight) > 2000
    });
    scene.add(machine.root);

    function applyTheme() {
      tokens = MM.readTokens();
      MM.applyTokens(mats, tokens);
      scene.background.set(tokens.css.paper);
      shadowMat.color.set(tokens.css.shade);
      shadowMat.opacity = tokens.dark ? 0.42 : 0.24;
      hemi.groundColor.set(tokens.dark ? '#7f9ae6' : '#b9c8ee');
      gridTex.redraw();
      machine.retheme();
    }
    applyTheme();
    (function (mq) {
      if (mq.addEventListener) mq.addEventListener('change', applyTheme); else if (mq.addListener) mq.addListener(applyTheme);
    })(window.matchMedia('(prefers-color-scheme: dark)'));
    new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    // the signs are drawn with the display font, so redraw them once it has arrived
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load('800 64px "Big Shoulders Display"'), document.fonts.ready]).then(function () { machine.retheme(); }, function () {});
    }

    // ---------- camera ----------
    const camera = new THREE.PerspectiveCamera(FOV, 1, 8, 260);
    const TAN = Math.tan(FOV * Math.PI / 360);
    const V = () => new THREE.Vector3();
    const tmp = V(), right = V(), up = V();

    function axes(yaw, pitch) {
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      up.set(-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), -Math.cos(yaw) * Math.sin(pitch));
    }
    function place(cam, p) {
      cam.position.set(
        p.target.x + p.dist * Math.sin(p.yaw) * Math.cos(p.pitch),
        p.target.y + p.dist * Math.sin(p.pitch),
        p.target.z + p.dist * Math.cos(p.yaw) * Math.cos(p.pitch));
      cam.lookAt(p.target);
      cam.updateMatrixWorld();
    }

    // everything that must be in view once the machine has finished
    const fitPts = [];
    for (let k = 1; k <= D.STEPS; k++) [-1, 1].forEach(function (s) {
      fitPts.push(new THREE.Vector3(s * D.W / 2, D.treadY(k), D.treadZ(k)), new THREE.Vector3(s * D.W / 2, D.treadY(k), D.treadZ(k) + D.TD));
    });
    [-1, 1].forEach(function (s) { fitPts.push(new THREE.Vector3(s * D.W / 2, 0, 0), new THREE.Vector3(s * D.W / 2, 0, D.STEPS * D.TD)); });
    (machine.fitExtras || []).forEach(p => fitPts.push(p));

    const fitCam = new THREE.PerspectiveCamera(FOV, 1, 8, 260);
    // the target point and distance that make the whole machine fill `rect` (in CSS pixels)
    function fit(L) {
      const p = { target: new THREE.Vector3(0, 4.2, 3.6), dist: 40, yaw: L.yaw, pitch: L.pitch };
      fitCam.aspect = L.vw / L.vh;
      fitCam.updateProjectionMatrix();
      axes(L.yaw, L.pitch);
      for (let it = 0; it < 8; it++) {
        place(fitCam, p);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        fitPts.forEach(function (q) {
          tmp.copy(q).project(fitCam);
          const sx = (tmp.x * 0.5 + 0.5) * L.vw, sy = (-tmp.y * 0.5 + 0.5) * L.vh;
          x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        });
        const ppu = L.vh / (2 * p.dist * TAN);
        p.target.addScaledVector(right, ((x0 + x1) / 2 - (L.rect.x + L.rect.w / 2)) / ppu);
        p.target.addScaledVector(up, -((y0 + y1) / 2 - (L.rect.y + L.rect.h / 2)) / ppu);
        p.dist *= Math.max((x1 - x0) / L.rect.w, (y1 - y0) / L.rect.h);
      }
      return p;
    }

    function underTitle(p, tb) {
      place(fitCam, p);
      return fitPts.some(function (q) {
        tmp.copy(q).project(fitCam);
        const sx = (tmp.x * 0.5 + 0.5) * L.vw, sy = (-tmp.y * 0.5 + 0.5) * L.vh;
        return sx < tb.right + 14 && sy < tb.bottom + 14;
      });
    }

    let L = null, finalPose = null;
    function layout() {
      const vw = canvas.clientWidth || window.innerWidth, vh = canvas.clientHeight || window.innerHeight;
      if (!(vw > 40 && vh > 40)) return;                 // not on screen yet; try again on the next resize
      const wide = vw / vh > 1.15 && vw >= 640;
      const tb = titleEl.getBoundingClientRect(), ar = app.getBoundingClientRect();
      let rect;
      if (wide) rect = { x: vw * 0.2, y: ar.top + 16, w: Math.max(120, ar.right - 18 - vw * 0.2), h: Math.max(120, ar.height - 32) };
      else {
        const y0 = tb.bottom + 10;
        rect = { x: 10, y: y0, w: vw - 20, h: Math.max(120, ar.bottom - 56 - y0) };
      }
      L = { vw: vw, vh: vh, wide: wide, rect: rect, yaw: wide ? 0.42 : 0.16, pitch: wide ? 0.5 : 0.53 };
      finalPose = fit(L);
      // on wide screens the machine may sit partly beside the title block, but never under it
      for (let i = 0; wide && i < 8 && underTitle(finalPose, tb); i++) {
        rect.x += vw * 0.04; rect.w = Math.max(120, ar.right - 18 - rect.x);
        finalPose = fit(L);
      }
      renderer.setSize(vw, vh, false);
      camera.aspect = vw / vh;
      camera.updateProjectionMatrix();
    }

    // the camera's path during the run: the machine says what to look at, this smooths it
    const HZ = 60, LOOKAHEAD = 0.16;
    const trackN = Math.ceil((machine.duration + 1) * HZ) + 2;
    const track = new Float32Array(trackN * 3);
    (function () {
      const raw = V(), s = machine.focusAt(0, V()).clone();
      const kxz = 1 - Math.exp(-(1 / HZ) / 0.3), ky = 1 - Math.exp(-(1 / HZ) / 0.42);
      for (let i = 0; i < trackN; i++) {
        machine.focusAt(i / HZ + LOOKAHEAD, raw);
        s.x += (raw.x - s.x) * kxz; s.z += (raw.z - s.z) * kxz; s.y += (raw.y - s.y) * ky;
        track[i * 3] = s.x; track[i * 3 + 1] = s.y; track[i * 3 + 2] = s.z;
      }
    })();
    function focus(t, out) {
      const x = M.clamp(t * HZ, 0, trackN - 1.001), i = Math.floor(x), f = x - i;
      return out.set(
        M.lerp(track[i * 3], track[i * 3 + 3], f),
        M.lerp(track[i * 3 + 1], track[i * 3 + 4], f),
        M.lerp(track[i * 3 + 2], track[i * 3 + 5], f));
    }

    const FOOT = new THREE.Vector3(0, 0, D.STEPS * D.TD);
    const T_OUT = machine.T.finale == null ? machine.duration - 1.8 : machine.T.finale, OUT_DUR = 1.7;
    const desired = { target: V(), dist: 40, yaw: 0, pitch: 0 }, shown = { target: V(), dist: 40, yaw: 0, pitch: 0 };
    let trans = null, override = null;

    function poseAt(t, wall, out) {
      // phones start close on the marble, then ease back until a whole step fits across the screen
      const settle = M.smooth(t / 2.4);
      const zoom = L.wide ? 1.6 : M.lerp(1.6, 1.2, settle);
      const w = M.smoother((t - T_OUT) / OUT_DUR);
      // run framing: keep the action at a fixed spot on screen
      const dist = finalPose.dist / zoom, ppu = L.vh / (2 * dist * TAN);
      const yaw = finalPose.yaw + (L.wide ? 0.05 : 0.03), pitch = finalPose.pitch;
      focus(t, tmp);
      tmp.x *= L.wide ? 0.24 : M.lerp(0.66, 0.3, settle);          // follow sideways only a little
      const ax = L.wide ? L.vw * 0.57 : L.vw * 0.5, ay = L.wide ? L.vh * 0.5 : L.rect.y + L.rect.h * 0.44;
      axes(yaw, pitch);
      out.target.copy(tmp).addScaledVector(right, (L.vw / 2 - ax) / ppu).addScaledVector(up, (ay - L.vh / 2) / ppu);
      // never follow so far down that the screen is mostly empty floor below the last step
      const foot = L.vh / 2 - (FOOT.clone().sub(out.target).dot(up)) * ppu, low = L.vh * (L.wide ? 0.93 : 0.88);
      if (foot < low) out.target.addScaledVector(up, (low - foot) / ppu);
      // ...then ease out to the framing that shows all four signs
      out.target.lerp(finalPose.target, w);
      out.dist = Math.exp(M.lerp(Math.log(dist), Math.log(finalPose.dist), w));
      out.yaw = M.lerp(yaw, finalPose.yaw, w) + (w >= 1 && !reduced ? 0.022 * Math.sin(wall * 0.45) : 0);
      out.pitch = M.lerp(pitch, finalPose.pitch, w);
      return out;
    }
    function copyPose(a, b) { a.target.copy(b.target); a.dist = b.dist; a.yaw = b.yaw; a.pitch = b.pitch; }
    function beginTransition(dur) {
      trans = { from: { target: shown.target.clone(), dist: shown.dist, yaw: shown.yaw, pitch: shown.pitch }, t0: performance.now(), dur: dur * 1000 };
    }

    // ---------- state ----------
    const st = { t: 0, playing: false, phase: 'ready', wall: 0, last: performance.now(), frames: 0, drawn: 0 };
    let slow = 0, wasDrawn = false, rate = 1 / 60;
    function setPhase(p) {
      st.phase = p;
      app.dataset.state = p;
      skipBtn.hidden = p !== 'running';
      replayBtn.hidden = p !== 'done';
      skipLink.hidden = p === 'done';
      pushBtn.disabled = p !== 'ready';
      soundBtn.hidden = p === 'ready';         // on arrival there is exactly one thing to press
    }

    const captions = (machine.captions || []).slice().sort((a, b) => a.t - b.t);
    let captionShown = null, flash = null;
    function updateCaption() {
      let text = '';
      if (flash && st.wall < flash.until && st.phase === 'done') text = flash.text;
      else if (st.phase === 'done') text = 'Pick a step.';
      else if (st.phase === 'running') for (let i = 0; i < captions.length; i++) if (st.t >= captions[i].t) text = captions[i].text;
      if (text !== captionShown) {
        captionShown = text;
        captionEl.textContent = text;
        captionEl.classList.toggle('flash', !!flash && text === flash.text);
      }
    }

    function push() {
      if (st.phase !== 'ready') return;
      st.t = 0; st.playing = true;
      setPhase('running');
      MM.sound.unlock();
    }
    function finish(instant) {
      st.t = machine.duration; st.playing = false;
      if (!instant) beginTransition(0.9);
      setPhase('done');
    }
    function replay() {
      beginTransition(1.0);
      st.t = -1.05; st.playing = true;
      setPhase('running');
      MM.sound.unlock();
    }
    pushBtn.addEventListener('click', push);
    skipBtn.addEventListener('click', function () { finish(false); });
    replayBtn.addEventListener('click', replay);
    skipLink.addEventListener('click', function (e) {
      e.preventDefault();
      finish(false);
      updateHits();
      if (hitEls[0]) hitEls[0].focus();
    });

    // sound is opt-in
    let soundOn = false;
    soundBtn.addEventListener('click', function () {
      soundOn = !soundOn;
      soundBtn.setAttribute('aria-pressed', String(soundOn));
      soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off';
      MM.sound.enable(soundOn);
    });

    // tapping the marble itself also pushes it
    canvas.addEventListener('pointerdown', function (e) {
      if (st.phase !== 'ready' || !machine.marble) return;
      tmp.copy(machine.marble.position).project(camera);
      const r = canvas.getBoundingClientRect();
      const sx = r.left + (tmp.x * 0.5 + 0.5) * r.width, sy = r.top + (-tmp.y * 0.5 + 0.5) * r.height;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < 64) push();
    });

    canvas.addEventListener('pointermove', function (e) {
      let near = false;
      if (st.phase === 'ready' && machine.marble) {
        tmp.copy(machine.marble.position).project(camera);
        const r = canvas.getBoundingClientRect();
        near = Math.hypot(e.clientX - (r.left + (tmp.x * 0.5 + 0.5) * r.width), e.clientY - (r.top + (-tmp.y * 0.5 + 0.5) * r.height)) < 64;
      }
      canvas.style.cursor = near ? 'pointer' : '';
    });

    // the sign links: nothing behind them yet, so a click just says so
    hitEls.forEach(function (el, i) {
      const sign = machine.signs[i];
      el.addEventListener('click', function (e) {
        e.preventDefault();
        sign.pressAt = st.wall;
        flash = { text: sections[i].label + ' page goes here.', until: st.wall + 2.4 };
      });
      const over = function (v) { return function () { sign.hoverTarget = v; }; };
      el.addEventListener('pointerenter', over(1));
      el.addEventListener('pointerleave', over(0));
      el.addEventListener('focus', over(1));
      el.addEventListener('blur', over(0));
    });

    function updateHits() {
      const r = canvas.getBoundingClientRect();
      machine.signs.forEach(function (s, i) {
        const el = hitEls[i], on = st.t >= s.tFlip + 0.3;
        if (on !== s.on) { s.on = on; el.classList.toggle('on', on); }
        if (!on) return;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        s.corners.forEach(function (c) {
          tmp.copy(c).project(camera);
          const sx = r.left + (tmp.x * 0.5 + 0.5) * r.width, sy = r.top + (-tmp.y * 0.5 + 0.5) * r.height;
          x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        });
        const box = Math.round(x0) + ',' + Math.round(y0) + ',' + Math.round(x1 - x0) + ',' + Math.round(y1 - y0);
        if (box !== s.box) {
          s.box = box;
          el.style.transform = 'translate(' + Math.round(x0) + 'px,' + Math.round(y0) + 'px)';
          el.style.width = Math.round(x1 - x0) + 'px';
          el.style.height = Math.round(y1 - y0) + 'px';
        }
      });
    }

    // ---------- loop ----------
    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - st.last) / 1000));
      st.last = now;
      if (!L) { layout(); if (!L) return; }
      st.wall += dt;
      rate += (dt - rate) * 0.05;                         // smoothed time between browser frames
      // keep the frame rate up on slower phones: trade away resolution first, then shadow detail.
      // (dt after a drawn frame is how long that frame took)
      if (wasDrawn && !navigator.webdriver && document.visibilityState === 'visible') {
        slow = dt > 1 / 27 ? slow + 1 : Math.max(0, slow - 2);     // a steady 30 fps (battery savers) is left alone
        if (slow > 40) {
          slow = 0;
          if (pixelRatio > 1.01) { pixelRatio = Math.max(1, pixelRatio - 0.4); renderer.setPixelRatio(pixelRatio); renderer.setSize(L.vw, L.vh, false); }
          else if (key.shadow.mapSize.x > 1024) { key.shadow.mapSize.set(1024, 1024); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } }
        }
      }
      wasDrawn = false;
      if (st.playing) {
        const before = st.t;
        st.t += dt * SPEED;
        for (let i = 0; i < machine.events.length; i++) {
          const e = machine.events[i];
          if (e.t > st.t) break;
          if (e.t > before) MM.sound.play(e);
        }
        if (st.t >= machine.duration) finish(true);
      }
      let busy = st.playing || !!trans;
      machine.signs.forEach(function (s) {
        s.hover += ((s.hoverTarget || 0) - s.hover) * Math.min(1, dt * 14);
        s.press = s.pressAt == null ? 0 : Math.max(0, M.wobble(st.wall - s.pressAt, 22, 9));
        if (Math.abs((s.hoverTarget || 0) - s.hover) > 0.01 || (s.pressAt != null && st.wall - s.pressAt < 0.6)) busy = true;
      });
      // while idle (waiting for the push, or sitting on the finished menu) draw every other frame,
      // unless the browser is already holding the page to a low frame rate
      st.frames++;
      if (!busy && rate < 0.021 && (st.frames & 1)) return;
      machine.update(st.t, reduced ? 0 : st.wall);
      if (override) copyPose(shown, override);
      else {
        poseAt(st.t, st.wall, desired);
        if (trans) {
          const u = (now - trans.t0) / trans.dur;
          if (u >= 1) { trans = null; copyPose(shown, desired); }
          else {
            const e = M.smoother(u);
            shown.target.copy(trans.from.target).lerp(desired.target, e);
            shown.dist = Math.exp(M.lerp(Math.log(trans.from.dist), Math.log(desired.dist), e));
            shown.yaw = M.lerp(trans.from.yaw, desired.yaw, e);
            shown.pitch = M.lerp(trans.from.pitch, desired.pitch, e);
          }
        } else copyPose(shown, desired);
      }
      place(camera, shown);
      renderer.render(scene, camera);
      updateHits();
      updateCaption();
      st.drawn++;
      wasDrawn = true;
    }

    layout();
    let resizeTimer = 0;
    const onResize = function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 60); };
    window.addEventListener('resize', onResize);
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(app);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout, function () {});

    setPhase('ready');
    if (reduced) { finish(true); replayBtn.textContent = 'Play the machine'; }
    st.last = performance.now();
    requestAnimationFrame(frame);

    // hooks for testing from the console
    MM.debug = {
      machine: machine, state: st, camera: camera, scene: scene, renderer: renderer,
      layout: function () { return L; }, finalPose: function () { return finalPose; },
      seek: function (t) {
        st.playing = false; st.t = t; trans = null;
        setPhase(t <= 0 ? 'ready' : t >= machine.duration ? 'done' : 'running');
      },
      look: function (p) { override = p ? { target: new THREE.Vector3(p.x, p.y, p.z), dist: p.dist || 20, yaw: p.yaw == null ? 0.3 : p.yaw, pitch: p.pitch == null ? 0.5 : p.pitch } : null; },
      push: push, finish: finish, replay: replay
    };
  }

  MM.ensureThree().then(start, fallback);
})(window.MM = window.MM || {});
