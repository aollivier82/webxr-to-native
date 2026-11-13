/* The apartment the machine stands in: a corner with painted walls and baseboards, a plank floor,
   a rug under the staircase, a window, a framed print, a floor lamp and a plant.
   Everything takes its colours from the CSS tokens, so it follows light and dark (day and evening). */
(function (MM) {
  'use strict';

  MM.buildRoom = function (ctx) {
    const mats = ctx.mats, getTokens = ctx.getTokens, css = () => getTokens().css;
    const put = MM.put, box = MM.box, cyl = MM.cyl;
    const PI = Math.PI;
    const g = new THREE.Group();
    const themed = [];
    let n = 0;
    function mat(token, o) {
      const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9 }, o || {}));
      m.userData.token = token;
      mats['room' + (n++)] = m;
      return m;
    }
    function plane(w, h, m) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.receiveShadow = true; return p; }

    const BACK = -2.2, LEFT = -9.5;

    // ---------- floor and rug ----------
    const planks = MM.plankTexture();
    planks.repeat.set(200 / 6, 200 / 6);
    const floor = plane(200, 200, mat('floor', { map: planks, roughness: 0.55 }));
    floor.rotation.x = -PI / 2;
    g.add(floor);

    const rugTex = MM.canvasTexture(1024, 1024, function (c, w, h) {
      const k = css(), r = MM.math.rng(5);
      c.fillStyle = k['rug-2']; c.fillRect(0, 0, w, h);
      c.fillStyle = k.rug; c.fillRect(34, 34, w - 68, h - 68);
      c.strokeStyle = k['rug-3']; c.lineWidth = 10; c.strokeRect(70, 70, w - 140, h - 140);
      c.strokeStyle = k['rug-2']; c.lineWidth = 4; c.strokeRect(92, 92, w - 184, h - 184);
      // a field of small diamonds
      for (let y = 150; y < h - 120; y += 72) for (let x = 150 + ((y / 72) % 2) * 36; x < w - 120; x += 72) {
        c.fillStyle = (x + y) % 3 ? k['rug-3'] : k['rug-2'];
        c.globalAlpha = 0.55;
        c.beginPath(); c.moveTo(x, y - 14); c.lineTo(x + 14, y); c.lineTo(x, y + 14); c.lineTo(x - 14, y); c.closePath(); c.fill();
      }
      c.globalAlpha = 1;
      // woven speckle
      for (let i = 0; i < 9000; i++) {
        c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)';
        c.fillRect(r() * w, r() * h, 2, 2);
      }
    });
    themed.push(rugTex);
    const rug = plane(13.5, 11.6, new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
    rug.rotation.x = -PI / 2;
    rug.position.set(0, 0.012, 4.2);
    g.add(rug);

    // ---------- walls ----------
    const wall = mat('paper', { roughness: 0.96 });
    const back = put(plane(140, 34, wall), LEFT + 70, 17, BACK, g);
    const left = put(plane(140, 34, wall), LEFT, 17, BACK + 70, g);
    left.rotation.y = PI / 2;
    back.castShadow = left.castShadow = false;
    const trim = mat('trim', { roughness: 0.5 });
    put(box(140, 0.6, 0.12, trim), LEFT + 70, 0.3, BACK + 0.06, g);
    put(box(0.12, 0.6, 140, trim), LEFT + 0.06, 0.3, BACK + 70, g);

    // ---------- window ----------
    const WX = 7.2, WY = 7.4, WW = 4.6, WH = 6.6;
    const skyTex = MM.canvasTexture(256, 384, function (c, w, h) {
      const k = css(), dark = getTokens().dark;
      const gr = c.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, k.sky); gr.addColorStop(1, dark ? '#2b3c66' : '#f4f1e6');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      // distant rooftops
      c.fillStyle = dark ? 'rgba(10,16,30,0.85)' : 'rgba(120,130,150,0.35)';
      [[0, 300, 70], [60, 270, 50], [105, 320, 80], [180, 285, 76]].forEach(function (b) { c.fillRect(b[0], b[1], b[2], h - b[1]); });
      if (dark) {
        c.fillStyle = '#f6efd9'; c.beginPath(); c.arc(190, 80, 22, 0, 7); c.fill();
        c.fillStyle = 'rgba(255,220,150,0.9)';
        [[20, 320], [40, 340], [125, 340], [150, 360], [200, 300], [220, 330]].forEach(function (p) { c.fillRect(p[0], p[1], 8, 10); });
      }
    });
    themed.push(skyTex);
    put(new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.MeshBasicMaterial({ map: skyTex })), WX, WY, BACK + 0.02, g);
    const F = 0.3;
    put(box(WW + 2 * F, F, 0.22, trim), WX, WY + WH / 2 + F / 2, BACK + 0.1, g);
    put(box(WW + 2 * F, F, 0.22, trim), WX, WY - WH / 2 - F / 2, BACK + 0.1, g);
    put(box(F, WH, 0.22, trim), WX - WW / 2 - F / 2, WY, BACK + 0.1, g);
    put(box(F, WH, 0.22, trim), WX + WW / 2 + F / 2, WY, BACK + 0.1, g);
    put(box(0.12, WH, 0.12, trim), WX, WY, BACK + 0.08, g);
    put(box(WW, 0.12, 0.12, trim), WX, WY + 0.9, BACK + 0.08, g);
    put(box(WW + 1, 0.2, 0.55, trim), WX, WY - WH / 2 - F - 0.1, BACK + 0.27, g);

    // ---------- framed print ----------
    const artTex = MM.canvasTexture(320, 400, function (c, w, h) {
      const k = css();
      c.fillStyle = '#f3ecdf'; c.fillRect(0, 0, w, h);
      c.fillStyle = k.yellow; c.beginPath(); c.arc(w * 0.62, h * 0.32, w * 0.2, 0, 7); c.fill();
      c.fillStyle = k.red; c.fillRect(w * 0.16, h * 0.5, w * 0.44, h * 0.3);
      c.fillStyle = k.mint; c.beginPath(); c.moveTo(w * 0.5, h * 0.82); c.lineTo(w * 0.86, h * 0.82); c.lineTo(w * 0.68, h * 0.46); c.closePath(); c.fill();
      c.strokeStyle = k['sign-ink']; c.lineWidth = 5; c.beginPath(); c.moveTo(w * 0.12, h * 0.86); c.lineTo(w * 0.88, h * 0.86); c.stroke();
    });
    themed.push(artTex);
    const AX = -5.4, AY = 7.2;
    put(box(2.7, 3.3, 0.12, mats.ink), AX, AY, BACK + 0.06, g);
    put(new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.9), new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.8 })), AX, AY, BACK + 0.125, g);

    // ---------- floor lamp ----------
    const LX = -8.3, LZ = -1.1;
    put(cyl(0.6, 0.72, 0.12, mats.brass, 32), LX, 0.06, LZ, g);
    put(cyl(0.055, 0.055, 7.2, mats.brass, 12), LX, 3.7, LZ, g);
    const shadeMat = mat('lampshade', { roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color(0xffc777), emissiveIntensity: 0.25 });
    const shade = put(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.3, 1.5, 36, 1, true), shadeMat), LX, 7.5, LZ, g);
    shade.castShadow = true;
    const bulb = put(new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10), new THREE.MeshBasicMaterial({ color: 0xfff1cf })), LX, 7.25, LZ, g);
    const lamp = new THREE.PointLight(0xffcf8f, 30, 0, 2);
    lamp.position.set(LX, 7.2, LZ);
    g.add(lamp);

    // ---------- plant ----------
    const PX = 5.5, PZ = 0.5;
    put(cyl(0.72, 0.56, 1.5, mat('pot', { roughness: 0.75 }), 32), PX, 0.75, PZ, g);
    put(cyl(0.66, 0.66, 0.04, mats.dark, 24), PX, 1.46, PZ, g);
    const leafMat = mat('leaf', { roughness: 0.55, side: THREE.DoubleSide });
    const rnd = MM.math.rng(3);
    for (let i = 0; i < 13; i++) {
      const a = i * 2.4 + rnd() * 0.5, tilt = 0.35 + rnd() * 0.55, len = 1.5 + rnd() * 1.1;
      const stem = new THREE.Group();
      stem.position.set(PX, 1.45, PZ);
      stem.rotation.set(0, a, tilt);
      const leaf = MM.mesh(new THREE.SphereGeometry(1, 16, 10), leafMat);
      leaf.scale.set(0.3, len / 2, 0.06);
      leaf.position.y = len / 2;
      stem.add(leaf);
      g.add(stem);
    }

    return {
      group: g,
      retheme: function (dark) {
        themed.forEach(t => t.redraw());
        lamp.intensity = dark ? 110 : 6;
        shadeMat.emissiveIntensity = dark ? 0.85 : 0.08;
        bulb.visible = true;
      }
    };
  };
})(window.MM = window.MM || {});
