/* =========================================================
   MONITOR NEURAL — nuvem de partículas do cérebro (WebGL puro)
   Sem dependências externas.

   O córtex vem de uma malha ANATÔMICA REAL: superfície pial reconstruída
   por ressonância magnética (NIH 3D 3DPX-000757/758, neuroscapelab/UCSF
   Glassbrain, licença CC0), convertida em nuvem de pontos por
   tools/build-brain.py. Cerebelo, tronco encefálico, volume interno e
   poeira ambiente são gerados aqui em cima dela.

   Se o arquivo da malha não carregar, cai para o cérebro procedural
   (união de elipsoides) definido em buildBrain() — o site nunca fica sem.
   ========================================================= */
(function (global) {
  'use strict';

  /* ---------- utilidades ---------- */
  var rnd = Math.random;

  function fold(x, y, z) {
    return Math.sin(x * 6.1) * Math.sin(y * 5.3) * Math.sin(z * 4.7) +
           0.55 * Math.sin(x * 11.7 + 1.7) * Math.sin(y * 9.9 + 0.4) * Math.sin(z * 10.6 + 2.2) +
           0.28 * Math.sin(x * 21.3 + 0.9) * Math.sin(y * 19.1 + 2.8) * Math.sin(z * 18.4 + 1.1);
  }

  function dir() { // ponto uniforme na esfera unitária
    var u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    return [s * Math.cos(t), u, s * Math.sin(t)];
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mix(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  /* ---------- anatomia ----------
     O encéfalo é montado como união de elipsoides (lobos), amostrada na
     superfície: cada candidato nasce na casca de um lobo e é descartado se
     cair dentro de outro. As emendas viram sulcos — é o que dá a silhueta
     de cérebro em vez de bolha.
     Eixos: x = lateral, y = vertical, z = frente(+) / nuca(−).           */
  var LOBOS = [
    { c: [ 0.00,  0.06, -0.02], r: [0.58, 0.50, 0.76], w: 1.00, tag: 'cere' }, // massa central
    { c: [ 0.00,  0.02,  0.48], r: [0.44, 0.42, 0.36], w: 0.46, tag: 'cere' }, // frontal
    { c: [ 0.00,  0.22, -0.12], r: [0.50, 0.42, 0.56], w: 0.56, tag: 'cere' }, // parietal
    { c: [ 0.00,  0.00, -0.60], r: [0.40, 0.36, 0.30], w: 0.34, tag: 'cere' }, // occipital
    { c: [-0.44, -0.26,  0.10], r: [0.20, 0.23, 0.44], w: 0.23, tag: 'temp' }, // temporal esq.
    { c: [ 0.44, -0.26,  0.10], r: [0.20, 0.23, 0.44], w: 0.23, tag: 'temp' }, // temporal dir.
    { c: [ 0.00, -0.47, -0.56], r: [0.40, 0.21, 0.30], w: 0.28, tag: 'cbl'  }  // cerebelo
  ];

  /* tronco encefálico: cápsula cônica descendo da base */
  var TRONCO = { y0: -0.18, y1: -0.94, z0: -0.24, z1: -0.20, r0: 0.135, r1: 0.062 };

  var Y_SHIFT = 0.08; // recentraliza a massa visual na tela

  function dentroLobo(x, y, z, e, k) {
    var dx = (x - e.c[0]) / (e.r[0] * k),
        dy = (y - e.c[1]) / (e.r[1] * k),
        dz = (z - e.c[2]) / (e.r[2] * k);
    return dx * dx + dy * dy + dz * dz < 1;
  }

  function dentroDeOutro(x, y, z, exceto, k) {
    for (var j = 0; j < LOBOS.length; j++) {
      if (j === exceto) continue;
      if (dentroLobo(x, y, z, LOBOS[j], k)) return true;
    }
    return false;
  }

  function dentroTronco(x, y, z, k) {
    if (y > TRONCO.y0 || y < TRONCO.y1) return false;
    var t = (y - TRONCO.y0) / (TRONCO.y1 - TRONCO.y0);
    var zc = mix(TRONCO.z0, TRONCO.z1, t), rr = mix(TRONCO.r0, TRONCO.r1, t) * k;
    var dx = x, dz = z - zc;
    return dx * dx + dz * dz < rr * rr;
  }

  /* giros e sulcos: faixas onduladas sobre a superfície + ruído */
  function giros(x, y, z) {
    var len = Math.sqrt(x * x + y * y + z * z) || 1;
    var u = Math.atan2(z, x), v = Math.asin(clamp(y / len, -1, 1));
    var faixa = Math.sin(u * 12.5 + 1.9 * Math.sin(v * 6.2)) * Math.sin(v * 8.5 + 1.3 * Math.sin(u * 4.7));
    return 0.026 * faixa + 0.014 * fold(x * 2.6, y * 2.6, z * 2.6);
  }

  /* relevo total da superfície num ponto (giros + fissura, ou fólias do cerebelo) */
  function relevo(tag, x, y, z) {
    if (tag === 'cbl') {
      return 0.017 * Math.sin(y * 62 + z * 6) + 0.006 * fold(x * 6, y * 6, z * 6);
    }
    var fis = Math.exp(-Math.pow(x / 0.085, 2)) * sstep(-0.02, 0.34, y);
    return giros(x, y, z) - 0.090 * fis;
  }

  /* ---------- geometria ---------- */
  function buildBrain(total) {
    var stride = 8;
    var data = new Float32Array(total * stride);
    var i = 0, n = 0;

    var nSup   = Math.round(total * 0.66); // superfície do encéfalo
    var nInner = Math.round(total * 0.19); // volume interno (profundidade)
    var nStem  = Math.round(total * 0.045);
    var nDust  = total - nSup - nInner - nStem;

    function push(x, y, z, nx, ny, nz, seed, dim) {
      if (n >= total) return;
      data[i++] = x; data[i++] = y + Y_SHIFT; data[i++] = z;
      data[i++] = nx; data[i++] = ny; data[i++] = nz;
      data[i++] = seed; data[i++] = dim;
      n++;
    }

    // roleta ponderada pela "área" de cada lobo
    var acum = [], soma = 0;
    for (var w = 0; w < LOBOS.length; w++) { soma += LOBOS[w].w; acum.push(soma); }
    function sorteiaLobo() {
      var v = rnd() * soma;
      for (var j = 0; j < acum.length; j++) if (v <= acum[j]) return j;
      return acum.length - 1;
    }

    /* --- superfície --- */
    var tentativas = 0, limite = nSup * 12;
    while (n < nSup && tentativas++ < limite) {
      var li = sorteiaLobo(), e = LOBOS[li], d = dir();
      var x = e.c[0] + d[0] * e.r[0], y = e.c[1] + d[1] * e.r[1], z = e.c[2] + d[2] * e.r[2];

      // base achatada: a face inferior do cérebro não é uma esfera
      if (e.tag === 'cere' && y < -0.30) continue;
      // descarta o que está enterrado em outro lobo → cria os sulcos das emendas
      if (dentroDeOutro(x, y, z, li, 0.995)) continue;

      // normal do elipsoide
      var nx = d[0] / e.r[0], ny = d[1] / e.r[1], nz = d[2] / e.r[2];
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;

      // fissura inter-hemisférica: além de afundar, rarefaz a linha média
      if (e.tag !== 'cbl') {
        var fis = Math.exp(-Math.pow(x / 0.085, 2)) * sstep(-0.02, 0.34, y);
        if (fis > 0.02 && rnd() < fis * 0.55) continue;
      }

      var desl = relevo(e.tag, x, y, z);

      /* Perturba a normal pelo gradiente do relevo (bump mapping). Sem isto os
         giros só mudam a posição e a luz difusa não enxerga dobra nenhuma. */
      var t1x, t1y = 0, t1z, tl;
      if (Math.abs(ny) < 0.94) { t1x = -nz; t1z = nx; }
      else { t1x = 1; t1z = 0; }
      tl = Math.sqrt(t1x * t1x + t1z * t1z) || 1;
      t1x /= tl; t1z /= tl;
      var t2x = ny * t1z - nz * t1y, t2y = nz * t1x - nx * t1z, t2z = nx * t1y - ny * t1x;

      var eps = 0.035;
      var g1 = (relevo(e.tag, x + t1x * eps, y + t1y * eps, z + t1z * eps) - desl) / eps;
      var g2 = (relevo(e.tag, x + t2x * eps, y + t2y * eps, z + t2z * eps) - desl) / eps;

      var bx = nx - (t1x * g1 + t2x * g2) * 0.9,
          by = ny - (t1y * g1 + t2y * g2) * 0.9,
          bz = nz - (t1z * g1 + t2z * g2) * 0.9;
      var bl = Math.sqrt(bx * bx + by * by + bz * bz) || 1;

      x += nx * desl; y += ny * desl; z += nz * desl;
      push(x, y, z, bx / bl, by / bl, bz / bl, rnd(), 0.74 + rnd() * 0.26);
    }

    /* --- volume interno: dá corpo, evita o aspecto de casca vazia --- */
    var alvoInner = n + nInner, guarda = 0;
    while (n < alvoInner && guarda++ < nInner * 25) {
      var px = (rnd() * 2 - 1) * 0.70,
          py = mix(-0.70, 0.72, rnd()),
          pz = (rnd() * 2 - 1) * 0.92;
      var ok = false;
      for (var k2 = 0; k2 < LOBOS.length; k2++) {
        if (dentroLobo(px, py, pz, LOBOS[k2], 0.92)) { ok = true; break; }
      }
      if (!ok) continue;
      var ml = Math.sqrt(px * px + py * py + pz * pz) || 1;
      push(px, py, pz, px / ml, py / ml, pz / ml, rnd(), 0.13 + rnd() * 0.20);
    }

    /* --- tronco encefálico (cápsula preenchida, não um tubo oco) --- */
    var alvoStem = n + nStem, g2 = 0;
    while (n < alvoStem && g2++ < nStem * 8) {
      var t = rnd();
      var ang = rnd() * Math.PI * 2;
      var casca = rnd() < 0.72;
      var raio = mix(TRONCO.r0, TRONCO.r1, t) * (casca ? (0.94 + rnd() * 0.06) : Math.sqrt(rnd()) * 0.9);
      var sy = mix(TRONCO.y0, TRONCO.y1, t);
      var sz = mix(TRONCO.z0, TRONCO.z1, t) + Math.sin(ang) * raio;
      var sx = Math.cos(ang) * raio;
      if (dentroDeOutro(sx, sy, sz, -1, 0.985)) continue; // esconde o que entra no encéfalo
      push(sx, sy, sz, Math.cos(ang), 0.22, Math.sin(ang), rnd(), casca ? 0.62 + rnd() * 0.24 : 0.20 + rnd() * 0.18);
    }

    /* --- poeira ambiente --- */
    for (var du = 0; du < nDust; du++) {
      var d3 = dir();
      var R = 1.40 + Math.pow(rnd(), 0.6) * 2.6;
      push(d3[0] * R, d3[1] * R * 0.7, d3[2] * R, d3[0], d3[1], d3[2], rnd(), 0.09 + rnd() * 0.14);
    }

    return { data: data, count: n, stride: stride };
  }

  /* ---------- peças montadas em volta do córtex real ----------
     A malha do NIH é só a superfície pial (córtex). Cerebelo, tronco,
     volume interno e poeira entram aqui, dimensionados para encaixar nela. */
  var CEREBELO = { c: [0, -0.47, -0.50], r: [0.41, 0.195, 0.29] };
  var TRONCO2  = { y0: -0.30, y1: -1.02, z0: -0.26, z1: -0.20, r0: 0.135, r1: 0.055 };

  function montaExtras(escreve, nCbl, nStem, nDust) {
    // cerebelo com fólias horizontais apertadas
    for (var i = 0; i < nCbl; i++) {
      var d = dir();
      var casca = rnd() < 0.82;
      var k = casca ? (0.965 + rnd() * 0.035) : Math.pow(rnd(), 0.4) * 0.92;
      var folia = 1 + 0.055 * Math.sin(d[1] * 34 + d[2] * 5);
      var x = CEREBELO.c[0] + d[0] * CEREBELO.r[0] * k * folia;
      var y = CEREBELO.c[1] + d[1] * CEREBELO.r[1] * k * folia;
      var z = CEREBELO.c[2] + d[2] * CEREBELO.r[2] * k * folia;
      // a face superior encosta no córtex: some com ela para não empastar a junção
      if (y > -0.40 && rnd() < 0.55) continue;
      var nx = d[0] / CEREBELO.r[0], ny = d[1] / CEREBELO.r[1], nz = d[2] / CEREBELO.r[2];
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      escreve(x, y, z, nx / nl, ny / nl, nz / nl, rnd(), casca ? 0.72 + rnd() * 0.24 : 0.20 + rnd() * 0.18);
    }

    // tronco encefálico: cápsula cônica preenchida
    for (var s = 0; s < nStem; s++) {
      var t = rnd(), ang = rnd() * Math.PI * 2, sup = rnd() < 0.74;
      var raio = mix(TRONCO2.r0, TRONCO2.r1, t) * (sup ? (0.94 + rnd() * 0.06) : Math.sqrt(rnd()) * 0.9);
      escreve(Math.cos(ang) * raio,
              mix(TRONCO2.y0, TRONCO2.y1, t),
              mix(TRONCO2.z0, TRONCO2.z1, t) + Math.sin(ang) * raio,
              Math.cos(ang), 0.22, Math.sin(ang),
              rnd(), sup ? 0.60 + rnd() * 0.22 : 0.18 + rnd() * 0.16);
    }

    // poeira ambiente
    for (var u = 0; u < nDust; u++) {
      var d3 = dir();
      var R = 1.40 + Math.pow(rnd(), 0.6) * 2.6;
      escreve(d3[0] * R, d3[1] * R * 0.7, d3[2] * R, d3[0], d3[1], d3[2], rnd(), 0.09 + rnd() * 0.14);
    }
  }

  /* ---------- carrega a nuvem do córtex real (.bin) ---------- */
  function carregaCortex(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      var cab = new DataView(buf);
      if (cab.getUint32(0, false) !== 0x4d4f4a42) throw new Error('assinatura invalida'); // 'MOJB'
      var nCortex = cab.getUint32(4, true);
      var escala = cab.getFloat32(8, true);
      var qp = new Int16Array(buf, 12, nCortex * 3);
      var qn = new Int8Array(buf, 12 + nCortex * 6, nCortex * 3);

      /* O cerebelo é pequeno em volume mas fica na base, onde a luz principal
         quase não bate: precisa de mais partículas por área para ler com o mesmo
         peso do córtex. Idem o tronco. */
      var nInner = Math.round(nCortex * 0.18);
      var nCbl   = Math.round(nCortex * 0.20);
      var nStem  = Math.round(nCortex * 0.06);
      var nDust  = Math.round(nCortex * 0.04);
      var total  = nCortex + nInner + nCbl + nStem + nDust;

      var stride = 8;
      var data = new Float32Array(total * stride);
      var i = 0, n = 0;
      function escreve(x, y, z, nx, ny, nz, seed, dim) {
        data[i++] = x; data[i++] = y; data[i++] = z;
        data[i++] = nx; data[i++] = ny; data[i++] = nz;
        data[i++] = seed; data[i++] = dim;
        n++;
      }

      // superfície cortical real
      for (var c = 0; c < nCortex; c++) {
        var j = c * 3;
        escreve(qp[j] * escala, qp[j + 1] * escala, qp[j + 2] * escala,
                qn[j] / 127, qn[j + 1] / 127, qn[j + 2] / 127,
                rnd(), 0.74 + rnd() * 0.26);
      }

      // volume interno: pontos do córtex empurrados para dentro pela normal
      for (var v = 0; v < nInner; v++) {
        var k = (Math.random() * nCortex) | 0, m = k * 3;
        var fundo = 0.05 + Math.pow(rnd(), 0.7) * 0.42;
        var nx = qn[m] / 127, ny = qn[m + 1] / 127, nz = qn[m + 2] / 127;
        escreve(qp[m] * escala - nx * fundo, qp[m + 1] * escala - ny * fundo, qp[m + 2] * escala - nz * fundo,
                nx, ny, nz, rnd(), 0.12 + rnd() * 0.20);
      }

      montaExtras(escreve, nCbl, nStem, nDust);
      return { data: data, count: n, stride: stride, fonte: 'malha-real' };
    });
  }

  /* ---------- shaders ---------- */
  var VS = [
    'attribute vec3 aPos;',
    'attribute vec3 aNorm;',
    'attribute vec2 aSeed;',
    'uniform mat3 uRot;',
    'uniform float uTime, uScale, uAspect, uSize, uDisperse, uDPR, uCamZ, uFocusMix, uGain;',
    'uniform vec2 uOffset;',
    'uniform vec3 uColA, uColB, uFlash;',
    'varying vec4 vCol;',
    'void main(){',
    '  vec3 p = aPos;',
    '  float breathe = sin(uTime*0.65 + aSeed.x*6.283)*0.010;',
    '  p += aNorm * breathe;',
    '  p *= 1.0 + uDisperse * (0.10 + aSeed.y*0.85);',
    '  vec3 rp = uRot * p;',
    '  vec3 rn = uRot * aNorm;',
    '  float z = rp.z + uCamZ;',
    '  float persp = 2.35 / max(z, 0.25);',
    '  vec2 xy = rp.xy * persp * uScale;',
    '  gl_Position = vec4(xy.x / uAspect + uOffset.x, xy.y + uOffset.y, 0.0, 1.0);',
    // disparo sináptico ocasional
    '  float ph = fract(uTime*0.21 + aSeed.x*17.13);',
    '  float fire = exp(-ph*7.0);',
    '  float rim = 1.0 - abs(rn.z);',
    '  float depth = smoothstep(uCamZ+1.6, uCamZ-1.1, z);',
    /* Luz principal de cima/esquerda/frente — é ela que revela os giros. Meia-Lambert
       (0.5+0.5*dot) em vez de Lambert puro: com o corte em zero, tudo que olha para
       baixo — lobo temporal, base e cerebelo — apagava e a metade inferior do cérebro
       parecia rarefeita, quando na verdade é a parte mais densa da nuvem. */
    '  float ndl = dot(rn, normalize(vec3(-0.42, 0.52, 0.74)));',
    '  float dif = pow(ndl*0.5 + 0.5, 1.55);',
    // preenchimento fraco por baixo/atrás: separa o cerebelo da sombra do occipital
    '  float fill = max(0.0, dot(rn, normalize(vec3(0.30, -0.72, -0.36)))) * 0.30;',
    '  gl_PointSize = uSize * persp * uDPR * (0.55 + aSeed.y*0.75) * (1.0 + fire*1.3);',
    // superfície inteira visível (antes só a silhueta acendia — virava bolha oca).
    // A borda já fica naturalmente mais densa pelo acúmulo tangente: não a reforçamos.
    '  float a = aSeed.y * (0.11 + dif*0.66 + fill + rim*0.26) * (0.30 + depth*0.85) * uGain;',
    '  a *= 1.0 + fire*1.5;',
    // segunda cor nas bordas da silhueta; o corpo permanece na cor principal
    '  float mixv = clamp(pow(rim, 2.2)*0.72 + aSeed.x*0.08 + uFocusMix, 0.0, 0.88);',
    '  vec3 col = mix(uColA, uColB, mixv);',
    '  col = mix(col, uFlash, fire*0.35);',
    '  vCol = vec4(col, clamp(a, 0.0, 1.0));',
    '}'
  ].join('\n');

  var FS = [
    'precision mediump float;',
    'uniform float uOpacity;',
    'varying vec4 vCol;',
    'void main(){',
    '  vec2 d = gl_PointCoord - 0.5;',
    '  float r2 = dot(d,d);',
    '  float a = exp(-r2*10.5) - 0.02;',
    '  if(a <= 0.0) discard;',
    '  gl_FragColor = vec4(vCol.rgb, a * vCol.a * uOpacity);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  /* ---------- classe principal ---------- */
  function NeuroBrain(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ok = false;

    var gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false }) ||
             canvas.getContext('experimental-webgl');
    if (!gl) return;
    this.gl = gl;

    var vs = compile(gl, gl.VERTEX_SHADER, VS);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    this.prog = prog;

    this.count = 0;
    this.buf = gl.createBuffer();
    this.attrs = ['aPos', 'aNorm', 'aSeed'].map(function (name) {
      return gl.getAttribLocation(prog, name);
    });

    this.u = {};
    ['uRot','uTime','uScale','uAspect','uSize','uDisperse','uDPR','uCamZ','uOffset','uColA','uColB','uFlash','uOpacity','uFocusMix','uGain']
      .forEach(function (k) { this.u[k] = gl.getUniformLocation(prog, k); }, this);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.clearColor(0, 0, 0, 0);

    // estado animado (alvo vs. atual — interpolado suavemente)
    this.p = { rotX: 0.02, rotY: 0, rotZ: 0, scale: 1, offX: 0, offY: 0, disperse: 0, opacity: 1, size: 2.1, focus: 0 };
    this.t = Object.assign({}, this.p);
    this.dpr = 1;
    this.time = 0;
    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    this.gain = opts.gain || 1.0;   // brilho por partícula (compensa densidade)
    this.maxDPR = opts.maxDPR || 2;  // teto de resolução (fill-rate no celular)
    this.colA = opts.colA || [0.55, 0.36, 0.86];  // roxo
    this.colB = opts.colB || [0.94, 0.83, 0.55];  // dourado
    this.flash = opts.flash || [1.0, 0.96, 0.90]; // cor do disparo sináptico
    this.ok = true;
    this.resize();
  }

  /* Troca de tema em tempo real.
     'luz'  — tinta escura sobre fundo claro: mistura NORMAL (o aditivo some no branco).
     'noite'— partícula luminosa sobre tinta escura: mistura ADITIVA. */
  NeuroBrain.prototype.tema = function (t) {
    if (!this.ok) return;
    var gl = this.gl;
    this.colA = t.colA; this.colB = t.colB; this.flash = t.flash;
    if (typeof t.gain === 'number') this.gain = t.gain;
    if (t.modo === 'luz') gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    this.modo = t.modo;
  };

  /* Sobe uma nuvem de pontos para a GPU. Pode ser chamado depois do primeiro
     desenho — é assim que a malha real substitui o fallback procedural. */
  NeuroBrain.prototype.build = function (geo) {
    if (!this.ok || !geo || !geo.count) return;
    var gl = this.gl, S = geo.stride * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, geo.data, gl.STATIC_DRAW);
    var deslocs = [0, 12, 24], tams = [3, 3, 2];
    for (var k = 0; k < 3; k++) {
      if (this.attrs[k] < 0) continue;
      gl.enableVertexAttribArray(this.attrs[k]);
      gl.vertexAttribPointer(this.attrs[k], tams[k], gl.FLOAT, false, S, deslocs[k]);
    }
    this.count = geo.count;
    this.fonte = geo.fonte || 'procedural';
  };

  NeuroBrain.prototype.resize = function () {
    if (!this.ok) return;
    var dpr = Math.min(global.devicePixelRatio || 1, this.maxDPR);
    var w = this.canvas.clientWidth || global.innerWidth;
    var h = this.canvas.clientHeight || global.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.dpr = dpr;
    this.aspect = w / h;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  };

  NeuroBrain.prototype.set = function (target) {
    for (var k in target) if (k in this.t) this.t[k] = target[k];
  };

  NeuroBrain.prototype.frame = function (dt) {
    if (!this.ok || !this.count) return;
    var gl = this.gl, p = this.p, t = this.t;
    this.time += dt;

    // suavização exponencial
    var k = 1 - Math.pow(0.0016, dt);
    for (var key in p) p[key] += (t[key] - p[key]) * k;

    // parallax do cursor
    this.pointer.x += (this.pointer.tx - this.pointer.x) * (1 - Math.pow(0.002, dt));
    this.pointer.y += (this.pointer.ty - this.pointer.y) * (1 - Math.pow(0.002, dt));

    var rx = p.rotX + this.pointer.y * 0.16;
    var ry = p.rotY + this.time * 0.020 + this.pointer.x * 0.28;

    var cy = Math.cos(ry), sy = Math.sin(ry);
    var cx = Math.cos(rx), sx = Math.sin(rx);
    // R = Rx * Ry  (column-major para o WebGL)
    var m = new Float32Array([
      cy,        0,    -sy,
      sx * sy,   cx,   sx * cy,
      cx * sy,  -sx,   cx * cy
    ]);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix3fv(this.u.uRot, false, m);
    gl.uniform1f(this.u.uTime, this.time);
    gl.uniform1f(this.u.uScale, p.scale);
    gl.uniform1f(this.u.uAspect, this.aspect);
    gl.uniform1f(this.u.uSize, p.size);
    gl.uniform1f(this.u.uDisperse, p.disperse);
    gl.uniform1f(this.u.uDPR, this.dpr);
    gl.uniform1f(this.u.uCamZ, 3.0);
    gl.uniform1f(this.u.uOpacity, p.opacity);
    gl.uniform1f(this.u.uFocusMix, p.focus);
    gl.uniform1f(this.u.uGain, this.gain);
    gl.uniform2f(this.u.uOffset, p.offX, p.offY);
    gl.uniform3fv(this.u.uColA, this.colA);
    gl.uniform3fv(this.u.uColB, this.colB);
    gl.uniform3fv(this.u.uFlash, this.flash);
    gl.drawArrays(gl.POINTS, 0, this.count);
  };

  /* Nuvem definitiva: tenta a malha real e cai no procedural se falhar. */
  NeuroBrain.carregar = function (url, totalProcedural) {
    return carregaCortex(url).catch(function (e) {
      console.warn('malha real indisponivel (' + e.message + '), usando cerebro procedural');
      return buildBrain(totalProcedural || 90000);
    });
  };

  NeuroBrain.procedural = buildBrain;
  global.NeuroBrain = NeuroBrain;
})(window);
