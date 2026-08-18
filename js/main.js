/* =========================================================
   ANTÔNIA MOJENA — orquestração de cenas, HUD e revelações
   ========================================================= */
(function () {
  'use strict';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp  = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (t) { return t * t * (3 - 2 * t); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Em abas em segundo plano innerWidth/innerHeight podem valer 0 no carregamento:
     sem estes fallbacks o site ficaria preso no layout móvel. */
  function vw() { return window.innerWidth || document.documentElement.clientWidth || (window.screen && screen.width) || 1280; }
  function vh() { return window.innerHeight || document.documentElement.clientHeight || (window.screen && screen.height) || 800; }
  function small() { return vw() < 900; }

  /* =======================================================
     1. CÉREBRO
     ======================================================= */
  var canvas = $('#brain');
  var isSmall = small();
  var brain = null;

  try {
    brain = new window.NeuroBrain(canvas, {
      colA: [0.30, 0.74, 0.45],
      colB: [0.98, 0.86, 0.58],
      // celular tem menos partículas: cada uma brilha mais para o corpo ficar igual
      gain: isSmall ? 2.0 : 0.85,
      maxDPR: isSmall ? 1.6 : 2
    });
  } catch (e) { brain = null; }

  var hasBrain = brain && brain.ok;
  if (!hasBrain && canvas) canvas.style.display = 'none';

  /* Malha anatômica real (CC0/NIH 3D). Celular recebe a nuvem reduzida —
     229 KB em vez de 686 KB — e cai no procedural se o arquivo faltar. */
  var geoPronta = hasBrain
    ? window.NeuroBrain.carregar(isSmall ? 'assets/cortex-lo.bin' : 'assets/cortex-hi.bin',
                                 isSmall ? 34000 : 86000)
    : Promise.resolve(null);

  // o canvas pode ser medido antes do layout (aba em segundo plano, fontes, etc.)
  if (hasBrain && 'ResizeObserver' in window) {
    new ResizeObserver(function () { brain.resize(); }).observe(canvas);
  }

  /* Estados por cena. offX/offY em coordenadas de tela (-1 a 1). */
  var SCENES = [
    // 01 — início: três-quartos (perfil do lobo frontal + temporal + cerebelo)
    { rotX: 0.12, rotY: 1.15, scale: 1.00, offX: 0.42, offY: 0.02, disperse: 0.00, opacity: 1.00, size: 2.50, focus: 0.00, veil: 0.00 },
    // 02 — indicação: gira para o outro lado, à esquerda da tela
    { rotX: 0.16, rotY: -0.55, scale: 1.20, offX: -0.44, offY: 0.00, disperse: 0.05, opacity: 0.95, size: 2.40, focus: 0.10, veil: 0.05 },
    // 03 — cuidado: explode ao fundo dos cards
    { rotX: -0.04, rotY: 2.05, scale: 1.85, offX: 0.00, offY: 0.00, disperse: 0.55, opacity: 0.55, size: 2.00, focus: 0.22, veil: 0.42 },
    // 04 — protocolo: recompõe à direita, perfil puro
    { rotX: -0.10, rotY: 1.57, scale: 1.05, offX: 0.44, offY: 0.02, disperse: 0.00, opacity: 0.95, size: 2.45, focus: 0.16, veil: 0.10 },
    // 05 — sobre: recua e vira fundo ambiente
    { rotX: 0.14, rotY: 2.60, scale: 0.62, offX: 0.05, offY: 0.05, disperse: 0.08, opacity: 0.48, size: 2.20, focus: 0.05, veil: 0.46 },
    // 06 — contato: halo central, visto de frente e simétrico
    { rotX: 0.04, rotY: 3.28, scale: 1.55, offX: 0.00, offY: 0.00, disperse: 0.22, opacity: 0.78, size: 2.35, focus: 0.35, veil: 0.30 }
  ];

  /* Em telas pequenas o cérebro fica centralizado e mais discreto, para o texto
     continuar legível. Reavaliado a cada resize — nunca congelado no carregamento. */
  var KEYS = Object.keys(SCENES[0]);

  // celular deitado: a tela volta a ter duas colunas, então o cérebro volta para o lado
  function deitado() { return vw() > vh() * 1.5 && vh() < 560; }

  function sceneParams(i) {
    var s = SCENES[i];
    if (!small()) return s;
    var lado = deitado();
    return {
      rotX: s.rotX, rotY: s.rotY, focus: s.focus, disperse: s.disperse, size: s.size,
      offX: lado ? s.offX : 0,
      offY: lado ? s.offY : 0.06,
      scale: s.scale * (lado ? 0.68 : 0.82),
      opacity: s.opacity * 0.85,
      veil: Math.min(0.52, s.veil + (lado ? 0.04 : 0.12))
    };
  }

  /* =======================================================
     2. SCROLL → CENA
     ======================================================= */
  var sections = $$('main .scene');
  var dots = $$('#sceneDots li');
  var navLinks = $$('.nav__links a');
  var progEl = $('#sceneProg');
  var veilEl = $('.veil');
  var waFloat = $('.wa-float');
  var focusEl = $('#hudFocus');
  var bounds = [];
  var current = -1; // força a primeira aplicação de dot/menu/foco

  function measure() {
    bounds = sections.map(function (el) {
      var r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, h: el.offsetHeight };
    });
  }

  /* Qual link do menu representa cada seção (Atendimento cobre cuidado + protocolo) */
  var NAV_FOR = {
    inicio: '#inicio', indicacao: '#indicacao', cuidado: '#cuidado',
    protocolo: '#cuidado', sobre: '#sobre', contato: '#contato'
  };

  function sceneAt() {
    var mid = window.scrollY + vh() * 0.5;
    var i = 0;
    for (var k = 0; k < bounds.length; k++) {
      if (mid >= bounds[k].top) i = k;
    }
    var b = bounds[i];
    var t = clamp((mid - b.top) / Math.max(b.h, 1), 0, 1);
    // permanece na cena durante os primeiros 45%, depois transiciona
    var f = i + smooth(clamp((t - 0.45) / 0.55, 0, 1));
    return { index: i, f: Math.min(f, SCENES.length - 1.0001), t: t };
  }

  var target = Object.assign({}, SCENES[0]);

  function applyScroll() {
    var s = sceneAt();
    var a = sceneParams(Math.floor(s.f));
    var b = sceneParams(Math.min(Math.floor(s.f) + 1, SCENES.length - 1));
    var k = s.f - Math.floor(s.f);

    for (var ki = 0; ki < KEYS.length; ki++) {
      var key = KEYS[ki];
      target[key] = lerp(a[key], b[key], k);
    }
    if (hasBrain) brain.set(target);
    if (veilEl) veilEl.style.setProperty('--veil', target.veil.toFixed(3));

    // halo atmosférico acompanha o cérebro
    var rootStyle = document.documentElement.style;
    rootStyle.setProperty('--gx', (target.offX * 50).toFixed(2) + '%');
    rootStyle.setProperty('--gy', (target.offY * 50).toFixed(2) + '%');

    // progresso global
    var doc = document.documentElement;
    var pr = clamp(window.scrollY / Math.max(doc.scrollHeight - window.innerHeight, 1), 0, 1);
    if (progEl) progEl.style.height = (pr * 100).toFixed(2) + '%';

    if (s.index !== current) {
      current = s.index;
      var id = sections[current].id;
      dots.forEach(function (d, i) { d.classList.toggle('is-active', i === current); });
      navLinks.forEach(function (l) {
        l.classList.toggle('is-active', l.getAttribute('href') === NAV_FOR[id]);
      });
      var f = sections[current].getAttribute('data-focus');
      if (f && focusEl) focusEl.textContent = f;
    }

    if (waFloat) waFloat.classList.toggle('is-on', window.scrollY > vh() * 0.55);
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { applyScroll(); ticking = false; });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () {
    measure();
    if (hasBrain) brain.resize();
    applyScroll();
  });

  /* =======================================================
     3. REVELAÇÕES
     ======================================================= */
  var revs = $$('.rv');
  revs.forEach(function (el) {
    var d = parseFloat(el.getAttribute('data-d') || 0);
    el.style.transitionDelay = (d * 85) + 'ms';
  });

  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revs.forEach(function (el) { io.observe(el); });
  } else {
    revs.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* =======================================================
     3b. MENU MOBILE
     ======================================================= */
  var burger = $('#burger');
  var menu = $('#menuMobile');

  function fechaMenu() {
    document.body.classList.remove('is-menu');
    if (burger) burger.setAttribute('aria-expanded', 'false');
  }

  if (burger && menu) {
    burger.addEventListener('click', function () {
      var abrindo = !document.body.classList.contains('is-menu');
      document.body.classList.toggle('is-menu', abrindo);
      burger.setAttribute('aria-expanded', abrindo ? 'true' : 'false');
      burger.setAttribute('aria-label', abrindo ? 'Fechar menu' : 'Abrir menu');
    });

    // qualquer link fecha o menu antes de rolar até a seção
    $$('a', menu).forEach(function (a) { a.addEventListener('click', fechaMenu); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') fechaMenu();
    });

    // ao voltar para desktop o menu não pode continuar travando a página
    window.addEventListener('resize', function () { if (!small()) fechaMenu(); });
  }

  /* =======================================================
     4. PARALLAX DO CURSOR
     ======================================================= */
  if (hasBrain && !reduced) {
    window.addEventListener('mousemove', function (e) {
      brain.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      brain.pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }

  /* =======================================================
     5. HUD — leituras vivas
     ======================================================= */
  var partsEl = $('#hudParts');
  var fireEl = $('#hudFire');

  function contaParticulas(nParts) {
    if (!partsEl) return;
    var t0 = null;
    (function count(ts) {
      if (!t0) t0 = ts || 0;
      var p = clamp(((ts || 0) - t0) / 1400, 0, 1);
      partsEl.textContent = Math.round(nParts * (1 - Math.pow(1 - p, 3))).toLocaleString('pt-BR');
      if (p < 1) requestAnimationFrame(count);
    })();
  }

  var fireVal = 4.2;
  setInterval(function () {
    fireVal = clamp(fireVal + (Math.random() - 0.5) * 0.6, 3.1, 6.4);
    if (fireEl) fireEl.textContent = fireVal.toFixed(2).replace('.', ',') + ' M/S';
  }, 900);

  /* onda tipo EEG */
  var wave = $('#wave');
  if (wave) {
    var wctx = wave.getContext('2d');
    var W = wave.width, H = wave.height, ph = 0;
    (function drawWave() {
      ph += 0.045;
      wctx.clearRect(0, 0, W, H);
      wctx.beginPath();
      for (var x = 0; x <= W; x += 2) {
        var n = Math.sin(x * 0.07 + ph) * 0.35 +
                Math.sin(x * 0.19 - ph * 1.7) * 0.22 +
                Math.sin(x * 0.41 + ph * 2.3) * 0.14;
        var spike = Math.exp(-Math.pow(((x / W + ph * 0.06) % 1 - 0.5) * 14, 2)) * 0.75;
        var y = H / 2 - (n + spike) * H * 0.42;
        x === 0 ? wctx.moveTo(x, y) : wctx.lineTo(x, y);
      }
      wctx.strokeStyle = 'rgba(143,178,124,.85)';
      wctx.lineWidth = 1;
      wctx.stroke();
      requestAnimationFrame(drawWave);
    })();
  }

  /* =======================================================
     6. BOOT
     ======================================================= */
  var boot = $('#boot');
  var bootBar = $('#bootBar');
  var bootPct = $('#bootPct');
  var bootMsg = $('#bootMsg');
  var MSGS = [
    'INICIANDO MONITOR NEURAL',
    'CARREGANDO MALHA CORTICAL',
    'CALIBRANDO SINAPSES',
    'ACOLHIMENTO E PROPÓSITO'
  ];

  /* A barra sobe sozinha até 88% e só completa quando a malha chega:
     nunca some antes do cérebro existir, nem trava se o download demorar. */
  function runBoot(malhaPronta, done) {
    if (reduced) { malhaPronta.then(done); return; }
    var p = 0, msg = 0, liberado = false;
    malhaPronta.then(function () { liberado = true; });
    var iv = setInterval(function () {
      var teto = liberado ? 100 : 88;
      p = Math.min(teto, p + 3 + Math.random() * 9);
      if (bootBar) bootBar.style.right = (100 - p) + '%';
      if (bootPct) bootPct.textContent = Math.floor(p) + '%';
      var m = Math.min(MSGS.length - 1, Math.floor(p / 27));
      if (m !== msg && bootMsg) { msg = m; bootMsg.textContent = MSGS[m]; }
      if (p >= 100) { clearInterval(iv); setTimeout(done, 420); }
    }, 90);
  }

  function start() {
    document.body.classList.add('is-booted');
    if (boot) boot.classList.add('is-done');
    if (canvas) canvas.classList.add('is-live');
    setTimeout(function () { if (boot && boot.parentNode) boot.parentNode.removeChild(boot); }, 1400);
  }

  /* =======================================================
     7. LOOP
     ======================================================= */
  var last = performance.now();
  var running = true;

  function loop(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (hasBrain && running) brain.frame(dt);
    requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange', function () { running = !document.hidden; last = performance.now(); });

  /* =======================================================
     8. INÍCIO
     ======================================================= */
  var yr = $('#yr');
  if (yr) yr.textContent = new Date().getFullYear();

  measure();
  applyScroll();
  requestAnimationFrame(loop);
  window.addEventListener('load', function () { measure(); applyScroll(); });

  var malhaPronta = geoPronta.then(function (geo) {
    if (geo && hasBrain) {
      brain.build(geo);
      brain.resize();
      applyScroll();
      contaParticulas(brain.count);
    }
  }).catch(function (e) { console.warn('cerebro indisponivel:', e); });

  runBoot(malhaPronta, start);
})();
