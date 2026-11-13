/* Marble machine, part 2 of 3: the model and its choreography.
   buildMachine() assembles the staircase, the four signs and the gadgets on each step, and works out
   when everything happens. The result is one update(t) function: give it a time in seconds since the
   push and every part takes its place. */
(function (MM) {
  'use strict';

  MM.buildMachine = function (ctx) {
    const M = MM.math, D = MM.D, R = D.R, G = D.G;
    const v3 = MM.v3, box = MM.box, cyl = MM.cyl, put = MM.put, mesh = MM.mesh;
    const mats = ctx.mats, getTokens = ctx.getTokens, sections = ctx.sections;
    const css = () => getTokens().css;

    const root = new THREE.Group();
    const updaters = [];     // functions of machine time
    const events = [];       // { t, type, ... } - used for sound and captions
    const themed = [];       // canvas textures to redraw when the theme changes
    const focusKeys = [];    // { t, get(t, out) } - what the camera should be looking at
    const tmp = v3(0, 0, 0), tmp2 = v3(0, 0, 0);
    const AX = v3(0, 0, 0), Q = new THREE.Quaternion();

    // step groups use local coordinates: x across, y up from the tread, z from the riser behind
    // (0) to the front edge (TD)
    const step = [null];
    for (let k = 1; k <= D.STEPS; k++) step[k] = put(new THREE.Group(), 0, D.treadY(k), D.treadZ(k), root);
    const W3 = (k, x, y, z) => v3(x, D.treadY(k) + y, D.treadZ(k) + z);
    const toWorld = (k, pts) => pts.map(p => v3(p.x, p.y + D.treadY(k), p.z + D.treadZ(k)));

    // ---------- balls ----------
    function makeBall(token, swirl) {
      const tex = MM.marbleTexture(() => [css()[token], swirl || '#ffffff']);
      themed.push(tex);
      const m = MM.ball(R, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.16, metalness: 0.05, envMap: ctx.env || null, envMapIntensity: 0.7 }));
      root.add(m);
      return m;
    }
    // move a ball and spin it by the distance it travelled
    function rollTo(b, p) {
      const dx = p.x - b.position.x, dy = p.y - b.position.y, dz = p.z - b.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const flat = Math.hypot(dx, dz);
      if (flat > 1e-6 && dist < 0.7) {
        AX.set(dz / flat, 0, -dx / flat);
        b.quaternion.premultiply(Q.setFromAxisAngle(AX, dist / R));
      }
      b.position.copy(p);
    }
    function runBall(b, motion) {
      updaters.push(function (t) { rollTo(b, motion.at(t, tmp)); });
    }

    // ---------- staircase ----------
    (function () {
      const c = 0.035, prof = [[0, 0], [0, D.treadY(1)]];
      for (let k = 1; k <= D.STEPS; k++) {       // each nosing gets a small chamfer that catches the light
        const y = D.treadY(k), z = k * D.TD;
        prof.push([z - c, y], [z, y - c]);
        if (k < D.STEPS) prof.push([z, D.treadY(k + 1)]);
      }
      prof.push([D.STEPS * D.TD, 0]);
      root.add(mesh(MM.extrudeX(prof, -D.W / 2, D.W / 2), mats.model));
    })();

    // ---------- signs: one split-flap board on each riser ----------
    const TEX_W = ctx.hiRes ? 2048 : 1024, TEX_H = Math.round(TEX_W * D.SIGN_H / D.SIGN_W);
    const blankTex = MM.canvasTexture(TEX_W / 2, TEX_H / 2, (c2, w, h) => MM.drawBlankFace(c2, w, h, css()));
    themed.push(blankTex);
    const blankMat = new THREE.MeshStandardMaterial({ map: blankTex, roughness: 0.8 });
    const blankBack = blankMat.clone(); blankBack.side = THREE.BackSide;
    const signBackMat = mats.ink;

    function halfPlane(v0, v1) {             // a plane whose texture shows only rows v0..v1
      const g = new THREE.PlaneGeometry(D.SIGN_W, (D.SIGN_H - 0.02) / 2);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, M.lerp(v0, v1, uv.getY(i)));
      return g;
    }
    const signs = sections.map(function (sec, i) {
      const k = i + 1, hh = (D.SIGN_H - 0.02) / 2;
      const g = put(new THREE.Group(), 0, D.treadY(k) - D.SIGN_TOP - D.SIGN_H / 2, k * D.TD, root);
      put(box(D.SIGN_W + 0.12, D.SIGN_H + 0.12, 0.06, signBackMat), 0, 0, 0.03, g);

      const tex = MM.canvasTexture(TEX_W, TEX_H, (c2, w, h, typed) => MM.drawSignFace(c2, w, h, sec, css(), typed));
      themed.push(tex);
      const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.22 });
      const faceBack = face.clone(); faceBack.side = THREE.BackSide;

      const top = put(new THREE.Mesh(halfPlane(0.5, 1), face), 0, hh / 2 + 0.01, 0.062, g);
      const bottom = put(new THREE.Mesh(halfPlane(0, 0.5), blankMat), 0, -hh / 2 - 0.01, 0.062, g);
      top.receiveShadow = bottom.receiveShadow = true;

      // the flap: hinged on the centre line, blank on the front, the label's lower half on the back
      const pivot = put(new THREE.Group(), 0, 0, 0.076, g);
      const fg = halfPlane(0.5, 1); fg.translate(0, hh / 2 + 0.01, 0);
      const bg = halfPlane(0.5, 0); bg.translate(0, hh / 2 + 0.01, 0);
      const ff = new THREE.Mesh(fg, blankMat), fb = new THREE.Mesh(bg, faceBack);
      ff.castShadow = fb.castShadow = true;
      pivot.add(ff, fb);

      const s = {
        index: i, sec: sec, group: g, tex: tex, face: face, faceBack: faceBack, pivot: pivot,
        tFlip: Infinity, typed: null, hover: 0, press: 0,
        corners: [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(c => v3(c[0] * D.SIGN_W / 2, D.treadY(k) - D.SIGN_TOP - D.SIGN_H / 2 + c[1] * D.SIGN_H / 2, k * D.TD + 0.08)),
        centre: v3(0, D.treadY(k) - D.SIGN_TOP - D.SIGN_H / 2, k * D.TD + 0.08)
      };
      return s;
    });
    const FLIP = 0.36;
    updaters.push(function (t) {
      signs.forEach(function (s) {
        const u = (t - s.tFlip) / FLIP;
        let a = 0;
        if (u >= 1) a = Math.PI - 0.5 * Math.exp(-7 * (u - 1)) * Math.abs(Math.sin(8.5 * (u - 1)));   // lands, rattles
        else if (u > 0) a = Math.PI * u * u;                                                           // falls
        s.pivot.rotation.x = a;
        const lit = M.sat(u);
        const glow = (getTokens().dark ? 0.3 : 0.2) + 0.26 * Math.exp(-3 * Math.max(0, u - 1)) * lit + 0.2 * s.hover;
        s.face.emissiveIntensity = s.faceBack.emissiveIntensity = glow;
        s.group.position.z = (s.index + 1) * D.TD + 0.05 * s.hover - 0.04 * s.press;
      });
    });

    // =====================================================================================
    // STEP 1: plunger, ramp, dominoes, bumper  ->  GAMES
    // =====================================================================================
    const T = {};                // named moments, filled in as the chain is worked out
    const s1 = step[1];
    const PH = 0.66, LANE = 0.62;            // perch height, and the z of the first lane
    const AX0 = -2.52;                       // where the first marble waits

    put(box(0.95, PH, 0.74, mats.model), -2.7, PH / 2, LANE, s1);

    // plunger: a pinball-style rod that flicks the marble
    const plunger = put(new THREE.Group(), AX0 - R - 0.03, PH + R, LANE, s1);
    (function () {
      const rod = cyl(0.035, 0.035, 0.5, mats.steel, 12); rod.rotation.z = Math.PI / 2; put(rod, -0.25, 0, 0, plunger);
      const tip = cyl(0.085, 0.085, 0.07, mats.dark, 20); tip.rotation.z = Math.PI / 2; put(tip, -0.035, 0, 0, plunger);
      put(MM.ball(0.085, mats.red), -0.52, 0, 0, plunger);
      put(box(0.1, 0.3, 0.26, mats.dark), AX0 - 0.42, PH + 0.15, LANE, s1);      // housing the rod slides through
    })();
    T.push = 0;
    T.strike = 0.3;
    updaters.push(function (t) {
      let x = 0;
      if (t > 0 && t < 0.24) x = -0.2 * M.easeOut(t / 0.24);
      else if (t >= 0.24 && t < 0.3) x = M.lerp(-0.2, 0.05, (t - 0.24) / 0.06);
      else if (t >= 0.3) x = 0.05 * (1 - M.easeOut((t - 0.3) / 0.35));
      plunger.position.x = AX0 - R - 0.03 + x;
    });

    // the bobbing arrow that says "this one"
    const arrow = put(new THREE.Group(), AX0, PH + 2 * R + 0.34, LANE, s1);
    (function () {
      const head = mesh(new THREE.ConeGeometry(0.13, 0.22, 4), mats.yellow); head.rotation.x = Math.PI; put(head, 0, 0, 0, arrow);
      put(box(0.075, 0.2, 0.075, mats.yellow), 0, 0.2, 0, arrow);
    })();
    updaters.push(function (t, wall) {
      const gone = M.ramp(t, 0, 0.18);
      arrow.visible = gone < 1;
      arrow.position.y = PH + 2 * R + 0.34 + 0.05 * Math.sin(wall * 3.2) + gone * 0.2;
      arrow.rotation.y = wall * 1.4;
      arrow.scale.setScalar(1 - gone);
    });

    // dominoes along a gentle S-curve
    const DOM = { t: 0.075, h: 0.52, w: 0.27 }, ND = 10, DS = 0.22, DT = 0.095;
    const X0D = -0.95;
    const domCurve = [];
    for (let i = 0; i <= 400; i++) {
      const x = X0D + i * 0.006;
      domCurve.push(v3(x, 0, LANE + 0.46 * M.smooth((x - X0D) / 1.9)));
    }
    const dominoes = [];
    (function () {
      const geo = new THREE.BoxGeometry(DOM.t, DOM.h, DOM.w); geo.translate(-DOM.t / 2, DOM.h / 2, 0);
      let acc = 0, next = 0;
      for (let i = 1; i < domCurve.length && dominoes.length < ND; i++) {
        const seg = domCurve[i].distanceTo(domCurve[i - 1]);
        if (acc + seg >= next) {
          const p = domCurve[i - 1].clone().lerp(domCurve[i], (next - acc) / seg);
          const tan = domCurve[i].clone().sub(domCurve[i - 1]).normalize();
          const g = put(new THREE.Group(), p.x + tan.x * DOM.t / 2, 0, p.z + tan.z * DOM.t / 2, s1);
          g.rotation.y = -Math.atan2(tan.z, tan.x);
          const m = mesh(geo, dominoes.length % 2 ? mats.label : mats.red);
          g.add(m);
          dominoes.push({ group: g, mesh: m, pos: p, tan: tan, pivot: g.position.clone() });
          next += DS;
        }
        acc += seg;
      }
    })();
    const TH_HIT = Math.asin((DS - DOM.t) / DOM.h);                  // a domino touches the next one
    const lastDom = dominoes[ND - 1];

    // marble A: perch -> ramp -> first domino
    const ballA = makeBall('red');
    const hitX = X0D - DOM.t / 2 - R;
    const pathA = MM.path([
      v3(AX0, PH + R, LANE), v3(-2.36, PH + R, LANE), v3(-2.22, PH + R - 0.015, LANE), v3(-2.06, PH + R - 0.1, LANE),
      v3(-1.52, 0.2 + R, LANE), v3(-1.36, 0.05 + R, LANE), v3(-1.26, 0.008 + R, LANE), v3(hitX, R, LANE)
    ], 0.03);
    pathA.forEach(p => { p.y = Math.max(p.y, R); });
    (function () {
      const rampPts = pathA.filter(p => p.x > -2.27 && p.x < -1.22);
      const geo = MM.trackGeometry(rampPts);
      s1.add(mesh(geo, mats.track));
      MM.addPosts(s1, geo, mats.track, 0.5);
    })();
    const moA = new MM.Motion(W3(1, AX0, PH + R, LANE)).begin(T.strike);
    moA.add(MM.rail(toWorld(1, pathA), 1.5));
    T.dom0 = moA.tEnd;
    (function () {                                        // a small recoil off the first domino
      const p = moA.end.clone();
      moA.add(MM.custom(0.4, (t, out) => out.set(p.x - 0.09 * M.easeOut(t / 0.4), p.y, p.z)));
    })();
    runBall(ballA, moA);

    // domino wave: each domino falls freely until it meets the next, then leans on it
    const thFree = tau => (tau <= 0 ? 0 : TH_HIT * (tau / DT) * (tau / DT));
    const lean = thNext => thNext + Math.asin(M.clamp((DS * Math.cos(thNext) - DOM.t) / DOM.h, -1, 1));
    const tauFlat = DT * Math.sqrt((Math.PI / 2) / TH_HIT);            // the last one lands flat
    updaters.push(function (t) {
      let thNext = 0;
      for (let i = ND - 1; i >= 0; i--) {
        const tau = t - (T.dom0 + i * DT);
        let th;
        if (i === ND - 1) {
          th = Math.min(thFree(tau), Math.PI / 2);
          if (tau > tauFlat) th -= 0.07 * Math.exp(-11 * (tau - tauFlat)) * Math.abs(Math.sin(26 * (tau - tauFlat)));
        } else th = Math.min(thFree(tau), lean(thNext));
        dominoes[i].mesh.rotation.z = -th;
        thNext = th;
      }
    });
    for (let i = 0; i < ND; i++) events.push({ t: T.dom0 + i * DT, type: 'clack', i: i });
    T.domEnd = T.dom0 + (ND - 1) * DT;

    // ball B waits where the tip of the last domino comes down, and gets squirted forward
    const zEnd = lastDom.pos.z, TIP = 80 * Math.PI / 180;
    const bX = lastDom.pivot.x + DOM.h * Math.sin(TIP) + Math.sqrt(R * R - Math.pow(R - DOM.h * Math.cos(TIP), 2));
    const ballB = makeBall('yellow');
    T.ballB = T.domEnd + DT * Math.sqrt(TIP / TH_HIT);
    events.push({ t: T.ballB, type: 'tick' });

    // bumper: placed so the ball leaves it heading for the front edge
    const OUT = v3(0.1, 0, 0.995), RB = 0.3;
    const nrm = v3(OUT.x - 1, 0, OUT.z).normalize();          // surface normal at the contact point
    const BUMP = { x: 2.8, z: zEnd - nrm.z * (RB + R) };
    const contactX = BUMP.x + nrm.x * (RB + R);
    const bumper = put(new THREE.Group(), BUMP.x, 0, BUMP.z, s1);
    const bumperCap = new THREE.Group();
    (function () {
      put(cyl(0.2, 0.22, 0.3, mats.label, 28), 0, 0.15, 0, bumper);
      put(cyl(RB, RB, 0.05, mats.red, 32), 0, 0.045, 0, bumper);             // skirt
      put(cyl(0.34, 0.3, 0.09, mats.red, 32), 0, 0, 0, bumperCap);
      put(cyl(0.2, 0.26, 0.05, mats.yellow, 28), 0, 0.07, 0, bumperCap);
      put(bumperCap, 0, 0.345, 0, bumper);
    })();
    const bumperLamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe08a, emissiveIntensity: 0, roughness: 0.4 });
    put(MM.ball(0.085, bumperLamp), 0, 0.12, 0, bumperCap);

    const moB = new MM.Motion(W3(1, bX, R, zEnd)).begin(T.ballB);
    (function () {
      const cPt = W3(1, contactX, R, zEnd);
      moB.add(MM.rail([moB.start.clone(), cPt], 2.5, { drag: 0.1 }));
      T.bump = moB.tEnd;
      const edge = cPt.clone().addScaledVector(OUT, (D.TD - zEnd) / OUT.z);
      const out = MM.rail([cPt, edge], 2.8, { drag: 0.1 });
      moB.add(out);
      T.edge1 = moB.tEnd;
      T.out1 = out.vEnd.clone();
    })();
    events.push({ t: T.bump, type: 'bumper' });
    updaters.push(function (t) {
      const u = t - T.bump;
      const kick = u > 0 ? Math.exp(-9 * u) : 0;
      bumperCap.position.y = 0.345 - 0.07 * kick * Math.cos(u * 30);
      bumperCap.scale.setScalar(1 + 0.12 * kick);
      bumperLamp.emissiveIntensity = u > 0 ? 0.35 + 2.2 * kick : 0;
    });
    signs[0].tFlip = T.bump + 0.05;

    // ---------- shared pieces for the lower steps ----------
    const toLocal = (k, p) => v3(p.x, p.y - D.treadY(k), p.z - D.treadZ(k));
    const UPV = v3(0, 1, 0), dummy = new THREE.Object3D();
    // a thin rod between two points
    function rod(a, b, r, mat, seg) {
      const d = b.clone().sub(a), len = d.length();
      const m = cyl(r, r, len, mat, seg || 8);
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(UPV, d.normalize());
      return m;
    }
    // A ball arriving from the step above: it flies, lands on a floor at height floorY and takes one
    // small hop. Returns when it landed and where the hop ends (in the step's local coordinates).
    function dropInto(mo, k, v, floorY, keep) {
      const p0 = mo.end.clone();
      const f = MM.flight(p0, v, MM.fallTime(p0.y, v.y, D.treadY(k) + floorY + R));
      mo.add(f);
      const tLand = mo.tEnd;
      events.push({ t: tLand, type: 'thud' });
      const vb = v3(f.vEnd.x * (keep || 0.42), -f.vEnd.y * 0.26, f.vEnd.z * (keep || 0.42));
      mo.add(MM.flight(mo.end, vb, 2 * vb.y / G));
      events.push({ t: mo.tEnd, type: 'tap' });
      return { t: tLand, q: toLocal(k, mo.end), speed: Math.max(1.5, Math.hypot(vb.x, vb.z)) };
    }
    // An open tray on a plinth: floor at height y, low walls on three sides.
    function tray(g, x0, x1, z0, z1, y, open) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, wall = 0.04, hgt = 0.11;
      put(box(w - 0.1, y - 0.04, d - 0.1, mats.model), cx, (y - 0.04) / 2, cz, g);
      put(box(w, 0.04, d, mats.track), cx, y - 0.02, cz, g);
      if (open !== 'back') put(box(w, hgt, wall, mats.track), cx, y + hgt / 2, z0 + wall / 2, g);
      if (open !== 'front') put(box(w, hgt, wall, mats.track), cx, y + hgt / 2, z1 - wall / 2, g);
      if (open !== 'left') put(box(wall, hgt, d, mats.track), x0 + wall / 2, y + hgt / 2, cz, g);
      if (open !== 'right') put(box(wall, hgt, d, mats.track), x1 - wall / 2, y + hgt / 2, cz, g);
    }
    // a hop that lands exactly on `target` after tau seconds
    function hopTo(mo, target, tau) {
      const p = mo.end.clone();
      mo.add(MM.flight(p, v3((target.x - p.x) / tau, (target.y - p.y + 0.5 * G * tau * tau) / tau, (target.z - p.z) / tau), tau));
    }
    function addTrack(g, pts, postGap) {
      const geo = MM.trackGeometry(pts);
      g.add(mesh(geo, mats.track));
      MM.addPosts(g, geo, mats.track, postGap || 0.55);
    }

    // =====================================================================================
    // STEP 2: catch tray, ramp, typewriter  ->  WRITING
    // =====================================================================================
    const s2 = step[2], H2 = 0.62;
    const in2 = dropInto(moB, 2, T.out1, H2);
    T.land2 = in2.t;
    const LANE2 = in2.q.z + 0.2;
    tray(s2, 2.2, 3.14, in2.q.z - 0.62, LANE2 + 0.24, H2, 'left');

    const pathB2 = MM.path([
      in2.q, v3(in2.q.x - 0.03, H2 + R, in2.q.z + 0.1), v3(in2.q.x - 0.17, H2 + R, LANE2 - 0.03), v3(in2.q.x - 0.36, H2 + R, LANE2),
      v3(2.2, H2 + R, LANE2), v3(1.95, H2 + R - 0.03, LANE2), v3(1.2, 0.43 + R, LANE2), v3(0.86, 0.36 + R, LANE2)
    ], 0.03);
    addTrack(s2, pathB2.filter(p => p.x < 2.23));
    const railB2 = MM.rail(toWorld(2, pathB2), in2.speed);
    moB.add(railB2);

    // the ball drops off the ramp onto a big key on a lever, and stays there
    const DISH_Y = 0.25;
    moB.add(MM.flight(moB.end, railB2.vEnd, MM.fallTime(moB.end.y, railB2.vEnd.y, D.treadY(2) + DISH_Y + R)));
    T.key = moB.tEnd;
    events.push({ t: T.key, type: 'key', big: true });
    const dishX = toLocal(2, moB.end).x;
    const pressY = tau => (tau <= 0 ? 0 : -0.1 * M.easeOut(tau / 0.09) + 0.02 * M.wobble(tau - 0.09, 30, 11));
    (function () {
      const p = moB.end.clone();
      moB.add(MM.custom(0.6, (t, out) => out.set(p.x, p.y + pressY(t), p.z)));
    })();
    runBall(ballB, moB);

    // typewriter
    const TWX = -0.72, TWZ = LANE2 - 0.56;
    const tw = put(new THREE.Group(), TWX, 0, TWZ, s2);
    tw.add(mesh(MM.extrudeX([[0, 0], [0, 0.46], [0.3, 0.46], [0.36, 0.4], [0.9, 0.13], [0.9, 0]], -0.9, 0.9), mats.yellow));
    const deckA = Math.atan2(0.27, 0.54), deckY = z => 0.4 - (z - 0.36) * 0.5;
    const KEYS = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 10 - r; c++) KEYS.push({ x: (c - (9 - r) / 2) * 0.158, z: 0.47 + r * 0.135 });
    const keyMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.052, 0.052, 0.045, 14), mats.dark, KEYS.length);
    keyMesh.castShadow = true;
    tw.add(keyMesh);
    function setKey(i, dip) {
      const k = KEYS[i], off = 0.032 - dip;
      dummy.position.set(k.x, deckY(k.z) + off * Math.cos(deckA), k.z + off * Math.sin(deckA));
      dummy.rotation.set(deckA, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      keyMesh.setMatrixAt(i, dummy.matrix);
    }
    KEYS.forEach((k, i) => setKey(i, 0));
    (function () {
      const bar = box(0.78, 0.04, 0.085, mats.dark);
      put(bar, 0, deckY(0.855) + 0.03, 0.855 + 0.015, tw).rotation.x = deckA;
      put(box(1.9, 0.06, 0.2, mats.dark), 0, 0.47, 0.2, tw);                 // the rail the carriage rides on
      put(box(0.5, 0.05, 0.14, mats.dark), 0, 0.445, 0.37, tw);              // type basket
    })();
    const typebar = put(new THREE.Group(), 0, 0.43, 0.4, tw);
    put(box(0.024, 0.2, 0.024, mats.steel), 0, 0.1, 0, typebar);

    const LABEL2 = sections[1].label, NL = LABEL2.length, KD = 0.115, CS = Math.min(0.07, 0.5 / NL);
    const paperTex = MM.canvasTexture(256, 128, function (c2, w, h, n) {
      c2.fillStyle = '#ffffff'; c2.fillRect(0, 0, w, h);
      c2.fillStyle = '#a9b4d2';
      [[26, 170], [26, 200], [26, 120]].forEach((l, r) => c2.fillRect(l[0], 20 + r * 18, l[1], 5));
      c2.fillStyle = '#0e2470';
      c2.font = 'bold 26px "Courier New", Courier, monospace';
      c2.textBaseline = 'alphabetic';
      c2.fillText(LABEL2.slice(0, n || 0).toLowerCase(), 26, 106);
    });
    const car = put(new THREE.Group(), 0, 0, 0, tw);
    (function () {
      const platen = cyl(0.075, 0.075, 1.84, mats.dark, 20); platen.rotation.z = Math.PI / 2; put(platen, 0, 0.56, 0.2, car);
      [-1, 1].forEach(function (s) { const k = cyl(0.105, 0.105, 0.08, mats.steel, 20); k.rotation.z = Math.PI / 2; put(k, s * 0.96, 0.56, 0.2, car); });
      put(box(1.36, 0.3, 0.035, mats.dark), 0, 0.66, 0.085, car);
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.4), new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.9, side: THREE.DoubleSide }));
      paper.castShadow = true; paper.rotation.x = -0.16;
      put(paper, 0, 0.78, 0.126, car);
      car.add(rod(v3(-0.9, 0.56, 0.2), v3(-0.82, 0.74, 0.42), 0.016, mats.steel));        // return lever
    })();

    // the lever with the big key the ball lands on
    const padLen = dishX - (TWX + 0.9);
    const pad = put(new THREE.Group(), 0.9, 0.2, LANE2 - TWZ, tw);
    put(box(padLen + 0.2, 0.035, 0.09, mats.dark), (padLen + 0.2) / 2 - 0.02, 0, 0, pad);
    put(cyl(0.2, 0.2, 0.04, mats.dark, 28), padLen, 0.03, 0, pad);
    put(cyl(0.15, 0.15, 0.045, mats.label, 28), padLen, 0.03, 0, pad);

    T.type0 = T.key + 0.46;
    T.ding = T.type0 + NL * KD + 0.05;
    const strikeKeys = (function () {
      const rnd = M.rng(11), used = {}, out = [];
      while (out.length < NL) { const i = Math.floor(rnd() * KEYS.length); if (!used[i]) { used[i] = 1; out.push(i); } }
      return out;
    })();
    for (let j = 0; j < NL; j++) events.push({ t: T.type0 + j * KD, type: 'key' });
    events.push({ t: T.ding, type: 'ding' });
    signs[1].tFlip = T.key + 0.03;
    signs[1].typed = 0;
    signs[1].tex.redraw(0);
    updaters.push(function (t) {
      pad.rotation.z = Math.asin(M.clamp((0.03 + pressY(t - T.key)) / padLen, -1, 1));
      const n = t < T.type0 ? 0 : Math.min(NL, Math.floor((t - T.type0) / KD) + 1);
      if (n !== signs[1].typed) { signs[1].typed = n; signs[1].tex.redraw(n); }
      if (n !== paperTex.userData.n) { paperTex.userData.n = n; paperTex.redraw(n); }
      let cx = 0, strike = 0;
      for (let j = 0; j < NL; j++) {
        const tau = t - (T.type0 + j * KD);
        const hit = tau > 0 && tau < 0.09 ? Math.sin(Math.PI * tau / 0.09) : 0;
        setKey(strikeKeys[j], 0.035 * hit);
        strike = Math.max(strike, hit);
        cx -= CS * M.ramp(tau, 0.035, 0.08);
      }
      keyMesh.instanceMatrix.needsUpdate = true;
      typebar.rotation.x = M.lerp(1.25, -0.745, strike);
      cx -= 0.1 * M.easeOut((t - T.ding) / 0.08);                             // the end-of-line shove
      car.position.x = cx;
    });

    // ball C waits on a tee at the end of the carriage's travel
    const cX = TWX - 1.0 - NL * CS - R - 0.012, cY = 0.56, cZ = TWZ + 0.2;
    put(cyl(0.03, 0.045, cY - R, mats.track, 12), cX, (cY - R) / 2, cZ, s2);
    put(cyl(0.075, 0.03, 0.035, mats.track, 16), cX, cY - R - 0.012, cZ, s2);
    const ballC = makeBall('mint');
    T.ballC = T.ding + 0.03;
    const pathC2 = MM.path([
      v3(cX, cY, cZ), v3(cX - 0.15, cY - 0.008, cZ + 0.01), v3(-2.78, 0.47, M.lerp(cZ, D.TD, 0.18)), v3(-2.92, 0.36, M.lerp(cZ, D.TD, 0.5)),
      v3(-2.93, 0.28, M.lerp(cZ, D.TD, 0.78)), v3(-2.93, 0.225, D.TD)
    ], 0.03);
    addTrack(s2, pathC2.filter(p => p.x < cX - 0.14), 0.4);
    const moC = new MM.Motion(W3(2, cX, cY, cZ)).begin(T.ballC);
    const railC2 = MM.rail(toWorld(2, pathC2), 1.3);
    moC.add(railC2);
    T.edge2 = moC.tEnd;

    // =====================================================================================
    // STEP 3: raised tray and ramp, clapperboard, film camera  ->  VIDEOS
    // =====================================================================================
    const s3 = step[3], H3 = 1.26, LANE3 = 1.42;
    const in3 = dropInto(moC, 3, railC2.vEnd, H3);
    T.land3 = in3.t;
    tray(s3, -3.16, -2.52, in3.q.z - 0.58, LANE3 + 0.16, H3, 'right');
    const rampY3 = x => H3 + R - 0.17 * (x + 2.5);
    const pathC3 = MM.path([
      in3.q, v3(in3.q.x + 0.02, H3 + R, in3.q.z + 0.1), v3(in3.q.x + 0.16, H3 + R, LANE3 - 0.1), v3(-2.5, H3 + R, LANE3 - 0.04),
      v3(-2.1, rampY3(-2.1), LANE3), v3(-1.4, rampY3(-1.4), LANE3), v3(-0.56, rampY3(-0.56), LANE3)
    ], 0.03);
    addTrack(s3, pathC3.filter(p => p.x > -2.54), 0.62);
    const railC3 = MM.rail(toWorld(3, pathC3), in3.speed);
    moC.add(railC3);


    // clapperboard: the ball lands on the raised stick and slams it shut
    const CL = { x0: -0.5, x1: 0.45, h: 0.42, len: 0.95, open: 0.28 };
    const HT = { x: CL.x1, y: CL.h + 0.18 };                 // top of the clap stick, at the hinge
    const stripeTex = MM.stripeTexture(getTokens);
    themed.push(stripeTex);
    const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6 });
    put(box(CL.len, CL.h, 0.06, mats.dark), (CL.x0 + CL.x1) / 2, CL.h / 2, LANE3, s3);
    [0.31, 0.21, 0.11].forEach((y, i) => put(box(i ? 0.78 : 0.5, 0.014, 0.01, mats.label), (CL.x0 + CL.x1) / 2 - (i ? 0 : 0.14), y, LANE3 + 0.032, s3));
    put(box(CL.len, 0.09, 0.1, stripeMat), (CL.x0 + CL.x1) / 2, CL.h + 0.045, LANE3, s3);
    [CL.x0 + 0.1, CL.x1 - 0.1].forEach(x => put(box(0.08, 0.04, 0.3, mats.dark), x, 0.02, LANE3, s3));
    const clapStick = put(new THREE.Group(), CL.x1, CL.h + 0.09, LANE3, s3);
    put(box(CL.len, 0.09, 0.1, stripeMat), -CL.len / 2, 0.045, 0, clapStick);

    // a short flight from the end of the ramp onto the raised stick, most of the way out along it
    T.rho0 = 0.8;
    (function () {
      const target = W3(3, HT.x - T.rho0 * Math.cos(CL.open) + R * Math.sin(CL.open), HT.y + T.rho0 * Math.sin(CL.open) + R * Math.cos(CL.open), LANE3);
      hopTo(moC, target, Math.abs(target.x - moC.end.x) / Math.max(1.5, railC3.speedEnd));
      T.clap0 = moC.tEnd;
    })();
    const CLAP = 0.1, VS = 2.0;
    const clapPhi = tau => (tau <= 0 ? CL.open : tau >= CLAP ? 0 : CL.open * (1 - (tau / CLAP) * (tau / CLAP)));
    moC.add(MM.custom((T.rho0 + 0.03) / VS, function (t, out) {
      const rho = T.rho0 - VS * t, ph = clapPhi(t);
      return out.set(HT.x - rho * Math.cos(ph) + R * Math.sin(ph), D.treadY(3) + HT.y + rho * Math.sin(ph) + R * Math.cos(ph), D.treadZ(3) + LANE3);
    }));
    T.clap = T.clap0 + CLAP;
    events.push({ t: T.clap, type: 'clap' });
    signs[2].tFlip = T.clap + 0.03;
    updaters.push(function (t) {
      const tau = t - T.clap0;
      clapStick.rotation.z = -clapPhi(tau) - (tau > CLAP ? 0.05 * Math.exp(-16 * (tau - CLAP)) * Math.abs(Math.sin(40 * (tau - CLAP))) : 0);
    });

    // off the end of the stick, down onto the last stretch of track, round the corner and off the edge
    const LOW = 0.3;
    (function () {
      const f = MM.flight(moC.end, v3(VS, 0, 0), MM.fallTime(moC.end.y, 0, D.treadY(3) + LOW + R));
      moC.add(f);
      events.push({ t: moC.tEnd, type: 'thud' });
      const vb = v3(VS * 0.85, -f.vEnd.y * 0.24, 0);
      moC.add(MM.flight(moC.end, vb, 2 * vb.y / G));
      T.vb3 = vb.x;
    })();
    const q3 = toLocal(3, moC.end);
    const tail3 = [v3(q3.x + 0.25, LOW + R - 0.012, LANE3), v3(1.7, 0.2 + R, LANE3), v3(2.3, 0.115 + R, LANE3 + 0.01),
      v3(2.58, 0.08 + R, LANE3 + 0.09), v3(2.71, 0.062 + R, LANE3 + 0.2), v3(2.74, 0.05 + R, D.TD)];
    const pathC3b = MM.path([q3].concat(tail3), 0.03);
    addTrack(s3, MM.path([v3(CL.x1 + 0.2, LOW + R, LANE3), q3].concat(tail3), 0.03), 0.5);
    const railC3b = MM.rail(toWorld(3, pathC3b), T.vb3);
    moC.add(railC3b);
    T.edge3 = moC.tEnd;

    // film camera on a tripod, pointed at the slate; its reels start turning at the clap
    const reels = [];
    const recMat = new THREE.MeshStandardMaterial({ color: 0x5a1010, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.4 });
    (function () {
      const CX = 2.86, CZ = 0.72;
      const g = put(new THREE.Group(), CX, 0, CZ, s3);
      g.rotation.y = Math.atan2(LANE3 - CZ, CX);
      const apex = v3(0, 0.62, 0);
      [90, 210, 330].forEach(function (deg) {
        const a = deg * Math.PI / 180;
        g.add(rod(apex, v3(0.28 * Math.cos(a), 0, 0.28 * Math.sin(a)), 0.022, mats.dark));
      });
      put(cyl(0.07, 0.07, 0.06, mats.dark, 16), 0, 0.63, 0, g);
      put(box(0.52, 0.34, 0.26, mats.mint), 0, 0.83, 0, g);
      const lens = cyl(0.085, 0.1, 0.2, mats.dark, 20); lens.rotation.z = Math.PI / 2; put(lens, -0.36, 0.83, 0, g);
      const hood = cyl(0.135, 0.1, 0.08, mats.dark, 20); hood.rotation.z = Math.PI / 2; put(hood, -0.49, 0.83, 0, g);
      put(box(0.18, 0.1, 0.07, mats.dark), 0.1, 0.9, 0.165, g);
      put(MM.ball(0.032, recMat), -0.2, 1.0, 0.1, g);
      [-0.11, 0.17].forEach(function (x) {
        const reel = put(new THREE.Group(), x, 1.13, 0, g);
        const disc = cyl(0.15, 0.15, 0.05, mats.dark, 28); disc.rotation.x = Math.PI / 2; reel.add(disc);
        const hub = cyl(0.045, 0.045, 0.065, mats.label, 14); hub.rotation.x = Math.PI / 2; reel.add(hub);
        for (let i = 0; i < 3; i++) {
          const hole = cyl(0.036, 0.036, 0.056, mats.label, 12); hole.rotation.x = Math.PI / 2;
          put(hole, 0.09 * Math.cos(i * 2.094), 0.09 * Math.sin(i * 2.094), 0, reel);
        }
        reels.push(reel);
      });
    })();
    updaters.push(function (t, wall) {
      const on = t > T.clap;
      reels.forEach((r, i) => { r.rotation.z = on ? -(wall * 4.2 + i) : i; });
      recMat.emissiveIntensity = on ? 1.4 + 0.8 * Math.sin(wall * 5) : 0;
    });

    // =====================================================================================
    // STEP 4: funnel, xylophone, jack-in-the-box  ->  ABOUT
    // =====================================================================================
    const s4 = step[4];
    const FUN = { x: 2.5, z: 1.02, rim: 0.56, rimY: 0.86, throat: 0.2, throatY: 0.44 };
    (function () {                 // where the falling ball crosses the height of the funnel's mid-wall
      const p0 = toLocal(4, moC.end), v0 = railC3b.vEnd, tt = MM.fallTime(p0.y, v0.y, 0.86);
      FUN.x = M.clamp(p0.x + v0.x * tt - 0.27, 2.3, 2.58);
      FUN.z = M.clamp(p0.z + v0.z * tt + 0.1, 0.8, 1.2);
    })();
    const FC = (FUN.rimY - FUN.throatY) / (1 / FUN.throat - 1 / FUN.rim);
    const funY = r => FUN.rimY - FC * (1 / r - 1 / FUN.rim);          // height of the funnel wall at radius r
    // where the ball's centre sits while it rides the wall: [radius, height] from the throat outwards
    const ride = [];
    for (let i = 0; i <= 40; i++) {
      const r = M.lerp(FUN.throat, FUN.rim, i / 40), b = Math.atan(FC / (r * r));
      ride.push([r - R * Math.sin(b), funY(r) + R * Math.cos(b)]);
    }
    const rideY = function (rc) {
      if (rc <= ride[0][0]) return ride[0][1];
      for (let i = 1; i < ride.length; i++) if (rc <= ride[i][0]) return M.lerp(ride[i - 1][1], ride[i][1], (rc - ride[i - 1][0]) / (ride[i][0] - ride[i - 1][0]));
      return ride[ride.length - 1][1];
    };
    (function () {
      const pts = [new THREE.Vector2(FUN.throat, FUN.throatY - 0.1)];
      for (let i = 0; i <= 18; i++) { const r = M.lerp(FUN.throat, FUN.rim, Math.pow(i / 18, 1.4)); pts.push(new THREE.Vector2(r, funY(r))); }
      const m = mats.pink.clone(); m.side = THREE.DoubleSide; mats.funnel = m;
      put(mesh(new THREE.LatheGeometry(pts, 48), m), FUN.x, 0, FUN.z, s4);
      const rim = mesh(new THREE.TorusGeometry(FUN.rim, 0.028, 10, 48), mats.pink); rim.rotation.x = Math.PI / 2;
      put(rim, FUN.x, FUN.rimY, FUN.z, s4);
      [55, -55, 125, -125].forEach(function (deg) {
        const a = deg * Math.PI / 180, rr = 0.46, h = funY(rr);
        put(cyl(0.025, 0.025, h, mats.dark, 8), FUN.x + rr * Math.cos(a), h / 2, FUN.z + rr * Math.sin(a), s4);
      });
    })();

    // the ball falls into the funnel and circles down to the throat
    (function () {
      const p0 = toLocal(4, moC.end), v0 = railC3b.vEnd;
      let tIn = 0.3;
      for (let tt = 0.05; tt < 0.9; tt += 0.002) {
        const x = p0.x + v0.x * tt, y = p0.y + v0.y * tt - 0.5 * G * tt * tt, z = p0.z + v0.z * tt;
        const rc = Math.hypot(x - FUN.x, z - FUN.z);
        if (rc < ride[ride.length - 1][0] && y <= rideY(rc)) { tIn = tt; break; }
      }
      moC.add(MM.flight(moC.end, v0, tIn));
      T.funnel = moC.tEnd;
      events.push({ t: T.funnel, type: 'tap' });
      const e = toLocal(4, moC.end);
      const r0 = Math.hypot(e.x - FUN.x, e.z - FUN.z), a0 = Math.atan2(e.z - FUN.z, e.x - FUN.x);
      const SPIN = 1.15, rEnd = ride[0][0] * 0.5, w0 = M.clamp(Math.hypot(v0.x, v0.z) / r0, 6, 10), w1 = 19;
      T.spin = SPIN;
      moC.add(MM.custom(SPIN, function (t, out) {
        const u = t / SPIN, rc = M.lerp(r0, rEnd, Math.pow(u, 1.7));
        const a = a0 + SPIN * (w0 * u + (w1 - w0) * u * u * u / 3);
        return out.set(FUN.x + rc * Math.cos(a), D.treadY(4) + rideY(rc), D.treadZ(4) + FUN.z + rc * Math.sin(a));
      }));
    })();

    // out of the spout, off a deflector, and down the xylophone
    const DEF_Y = 0.2, NB = 7, BSTEP = 0.44;
    const barX = i => FUN.x - 0.62 - i * BSTEP, barY = i => 0.27 - i * 0.03;
    (function () {
      const d = put(box(0.52, 0.03, 0.4, mats.track), FUN.x - 0.06, DEF_Y - 0.03, FUN.z, s4); d.rotation.z = 0.36;
      put(box(0.1, DEF_Y - 0.02, 0.3, mats.model), FUN.x + 0.1, (DEF_Y - 0.02) / 2, FUN.z, s4);
      const pT = moC.end.clone(), cx = FUN.x, cz = D.treadZ(4) + FUN.z;
      const dur = MM.fallTime(pT.y, 0, D.treadY(4) + DEF_Y + R);
      moC.add(MM.custom(dur, (t, out) => out.set(M.lerp(pT.x, cx, t / dur), pT.y - 0.5 * G * t * t, M.lerp(pT.z, cz, t / dur))));
      T.deflect = moC.tEnd;
      events.push({ t: T.deflect, type: 'tap' });
    })();
    T.notes = [];
    hopTo(moC, W3(4, barX(0), barY(0) + R, FUN.z), 0.25);
    for (let i = 0; i < NB; i++) {
      T.notes.push(moC.tEnd);
      events.push({ t: moC.tEnd, type: 'note', i: i });
      if (i < NB - 1) hopTo(moC, W3(4, barX(i + 1), barY(i + 1) + R, FUN.z), 0.2);
    }
    hopTo(moC, W3(4, barX(NB - 1) - 0.42, 0.03 + R, FUN.z), 0.2);
    events.push({ t: moC.tEnd, type: 'tap' });

    const bars = [];
    (function () {
      const tokensOf = ['red', 'yellow', 'mint', 'pink'];
      for (let i = 0; i < NB; i++) {
        const m = mats[tokensOf[i % 4]].clone();
        m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 0;
        mats['bar' + i] = m;
        bars.push({ mesh: put(box(0.25, 0.05, 0.94 - i * 0.055, m), barX(i), barY(i) - 0.025, FUN.z, s4), mat: m, y: barY(i) - 0.025 });
      }
      const len = (NB - 1) * BSTEP + 0.5, tilt = Math.atan2(barY(0) - barY(NB - 1), (NB - 1) * BSTEP);
      [-0.2, 0.2].forEach(function (dz) {
        const rail = put(box(len, 0.035, 0.045, mats.dark), (barX(0) + barX(NB - 1)) / 2, (barY(0) + barY(NB - 1)) / 2 - 0.068, FUN.z + dz, s4);
        rail.rotation.z = tilt;
        put(box(0.06, barY(0) - 0.08, 0.045, mats.dark), barX(0) + 0.12, (barY(0) - 0.08) / 2, FUN.z + dz, s4);
      });
    })();
    updaters.push(function (t) {
      bars.forEach(function (b, i) {
        const tau = t - T.notes[i];
        const k = tau > 0 ? Math.exp(-9 * tau) : 0;
        b.mesh.position.y = b.y - 0.035 * k * Math.cos(tau * 42);
        b.mat.emissiveIntensity = 0.55 * k;
      });
    });

    // jack-in-the-box at the far end: the ball rolls into its button
    const JX = -2.72, JS = 0.7, JZ = FUN.z;
    const btnX = JX + JS / 2 + 0.05;
    (function () {
      const p = toLocal(4, moC.end), end = v3(btnX + R, R, JZ);
      const pts = MM.path([p, v3(p.x - 0.3, R + 0.02, JZ), end], 0.03);
      addTrack(s4, MM.path([v3(p.x + 0.16, p.y, JZ), p, v3(p.x - 0.3, R + 0.02, JZ), v3(end.x + 0.1, R, JZ)], 0.03));
      moC.add(MM.rail(toWorld(4, pts), 2.2, { drag: 0.1 }));
    })();
    T.pop = moC.tEnd;
    events.push({ t: T.pop, type: 'pop' });
    runBall(ballC, moC);
    signs[3].tFlip = T.pop + 0.12;

    const jack = put(new THREE.Group(), JX, 0, JZ, s4);
    put(box(JS, JS, JS, mats.pink), 0, JS / 2, 0, jack);
    put(cyl(0.27, 0.27, 0.012, mats.dark, 28), 0, JS + 0.004, 0, jack);
    const lid = put(new THREE.Group(), 0, JS, -JS / 2, jack);
    put(box(JS + 0.05, 0.05, JS + 0.05, mats.yellow), 0, 0.03, JS / 2, lid);
    const jackBtn = cyl(0.11, 0.11, 0.07, mats.red, 20); jackBtn.rotation.z = Math.PI / 2;
    put(jackBtn, JS / 2 + 0.02, 0.2, 0, jack);
    jack.add(rod(v3(-0.1, 0.36, JS / 2), v3(-0.1, 0.36, JS / 2 + 0.1), 0.02, mats.steel));       // crank
    jack.add(rod(v3(-0.1, 0.36, JS / 2 + 0.09), v3(0.04, 0.46, JS / 2 + 0.09), 0.02, mats.steel));
    put(MM.ball(0.045, mats.red), 0.04, 0.46, JS / 2 + 0.11, jack);

    const figure = put(new THREE.Group(), 0, 0, 0, jack);
    figure.rotation.y = 0.28;
    const rings = [];
    for (let j = 0; j < 6; j++) {
      const ring = mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 20), mats.steel);
      ring.rotation.x = Math.PI / 2;
      figure.add(ring);
      rings.push(ring);
    }
    const head = put(new THREE.Group(), 0, 0.4, 0, figure);
    const arm = put(new THREE.Group(), 0.16, -0.26, 0, head);
    (function () {
      head.add(MM.ball(0.27, mats.yellow));
      put(MM.ball(0.036, mats.ink), -0.095, 0.06, 0.245, head);
      put(MM.ball(0.036, mats.ink), 0.095, 0.06, 0.245, head);
      const arc = Math.PI * 0.86;
      const smile = mesh(new THREE.TorusGeometry(0.115, 0.02, 8, 20, arc), mats.ink);
      smile.rotation.z = Math.PI + (Math.PI - arc) / 2;
      put(smile, 0, -0.005, 0.228, head);
      put(cyl(0.1, 0.2, 0.1, mats.pink, 20), 0, -0.3, 0, head);
      arm.add(rod(v3(0, 0, 0), v3(0.3, 0.26, 0.04), 0.03, mats.pink));
      put(MM.ball(0.085, mats.pink), 0.33, 0.3, 0.04, arm);
    })();

    const NCONF = 80;
    const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.075, 0.12), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), NCONF);
    conf.frustumCulled = false; conf.visible = false;
    root.add(conf);
    const confData = [];
    (function () {
      const rnd = M.rng(7), col = new THREE.Color(), pal = ['red', 'yellow', 'mint', 'pink', 'label'];
      for (let i = 0; i < NCONF; i++) {
        const a = rnd() * 6.283, sp = 0.4 + rnd() * 1.9;
        confData.push({ vx: Math.cos(a) * sp, vz: Math.sin(a) * sp + 0.5, vy: 3.4 + rnd() * 4, rx: rnd() * 6, ry: rnd() * 6, wx: 4 + rnd() * 9, wy: 3 + rnd() * 8, delay: rnd() * 0.1 });
        conf.setColorAt(i, col.set(css()[pal[i % pal.length]]));
      }
      conf.instanceColor.needsUpdate = true;
    })();
    const confOrigin = W3(4, JX, JS + 0.25, JZ);
    updaters.push(function (t, wall) {
      const tau = t - T.pop;
      lid.rotation.x = tau <= 0 ? 0 : -1.95 * M.easeOutBack(tau / 0.24);
      const p = M.spring(tau - 0.05, 17, 5.2), settled = tau > 0.9 ? 1 : 0;
      const hy = M.lerp(0.4, 1.3, p) + settled * 0.02 * Math.sin(wall * 2.3);
      head.position.y = hy;
      head.scale.setScalar(M.lerp(0.78, 1, M.sat(p)));
      head.rotation.z = tau > 0 ? 0.14 * M.wobble(tau, 9, 2.4) : 0;
      rings.forEach(function (ring, j) { ring.visible = tau > 0; ring.position.y = M.lerp(0.55, hy - 0.3, (j + 0.5) / rings.length); });
      arm.scale.setScalar(Math.max(0.001, M.sat(p)));
      arm.rotation.z = tau > 0.3 ? 0.35 * Math.sin(wall * 8) : 0;
      jackBtn.position.x = JS / 2 + 0.02 - (tau > 0 ? 0.035 : 0);

      const c0 = tau - 0.04;
      conf.visible = c0 > 0 && c0 < 2.5;
      if (!conf.visible) return;
      for (let i = 0; i < NCONF; i++) {
        const c = confData[i], u = Math.max(0, c0 - c.delay), k = (1 - Math.exp(-2.2 * u)) / 2.2;
        dummy.position.set(confOrigin.x + c.vx * k, confOrigin.y + (c.vy + 3.2) * k - 3.2 * u, confOrigin.z + c.vz * k);
        dummy.rotation.set(c.rx + c.wx * u, c.ry + c.wy * u, 0);
        dummy.scale.setScalar(u <= 0 ? 0.001 : Math.max(0.001, M.sat((2.4 - c0) / 0.5)));
        dummy.updateMatrix();
        conf.setMatrixAt(i, dummy.matrix);
      }
      conf.instanceMatrix.needsUpdate = true;
    });

    T.finale = T.pop + 0.6;
    T.end = T.finale + 1.95;

    // ---------- commentary ----------
    const captions = [
      { t: 0, text: 'Plunger flicks the marble.' },
      { t: T.dom0, text: 'Marble meets dominoes.' },
      { t: T.bump, text: 'Bumper kicks a ball downstairs.' },
      { t: T.key, text: 'The typewriter takes dictation.' },
      { t: T.ding, text: 'Ding. Off the tee.' },
      { t: T.land3 + 0.3, text: 'Quiet on set...' },
      { t: T.clap, text: 'Action!' },
      { t: T.funnel, text: 'Round and round.' },
      { t: T.deflect, text: 'A little tune.' },
      { t: T.pop, text: 'Hello!' }
    ];

    // ---------- camera focus ----------
    const fk = (t, get) => focusKeys.push({ t: t, get: get });
    fk(-1e9, (t, out) => out.copy(W3(1, -2.0, 0.3, 0.9)));
    fk(T.strike, (t, out) => moA.at(t, out));
    fk(T.dom0, function (t, out) {
      const d = dominoes[Math.round(M.clamp((t - T.dom0) / DT, 0, ND - 1))];
      return out.set(d.pivot.x, D.treadY(1) + 0.3, D.treadZ(1) + d.pivot.z);
    });
    fk(T.ballB, (t, out) => moB.at(t, out));
    fk(T.key + 0.3, (t, out) => out.copy(W3(2, -0.9, 0.45, 1.2)));
    fk(T.ballC, (t, out) => moC.at(t, out));
    fk(T.pop + 0.05, (t, out) => out.copy(W3(4, -1.7, 0.6, 1.0)));

    const fitExtras = [W3(1, -2.7, 1.3, 0.62), W3(4, JX, 1.65, JZ), W3(3, 2.86, 1.32, 0.72), W3(3, -2.85, 1.45, 0.9)];

    function focusAt(t, out) {
      let key = focusKeys[0];
      for (let i = 1; i < focusKeys.length; i++) if (t >= focusKeys[i].t) key = focusKeys[i];
      return key.get(t, out);
    }

    events.push({ t: T.strike, type: 'plunger' });
    events.push({ t: T.funnel, type: 'whirl', dur: T.spin });
    signs.forEach(function (sg) { events.push({ t: sg.tFlip + FLIP, type: 'flap' }); });
    events.sort((a, b) => a.t - b.t);
    return {
      root: root, signs: signs, events: events, captions: captions, fitExtras: fitExtras, T: T, duration: T.end,
      update: function (t, wall) { for (let i = 0; i < updaters.length; i++) updaters[i](t, wall || 0); },
      focusAt: focusAt,
      retheme: function () { themed.forEach(tex => tex.redraw()); signs.forEach(s => s.tex.redraw(s.typed)); },
      marble: ballA
    };
  };
})(window.MM = window.MM || {});
