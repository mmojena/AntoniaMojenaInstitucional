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
  var corDaOnda = null;   // cor da onda do HUD; zerada quando o tema muda

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

  /* Paletas do cérebro, uma por tema.
     noite — partícula LUMINOSA sobre tinta escura, mistura aditiva: o corpo é
             roxo e a silhueta puxa para o dourado.
     luz   — o aditivo desaparece no branco, então a partícula vira TINTA:
             mistura normal, roxo profundo, e cada partícula precisa de muito
             menos opacidade porque agora elas se somam por cobertura. */
  var PALETA = {
    noite: {
      modo: 'aditivo',
      // verde baixo de propósito: no aditivo o canal que satura primeiro define a
      // cor do estouro, e com verde alto o corpo lavava para branco
      colA:  [0.50, 0.24, 0.95],
      colB:  [0.98, 0.84, 0.56],
      flash: [1.00, 0.95, 0.88],
      gain:  isSmall ? 2.20 : 0.75
    },
    luz: {
      modo: 'luz',
      colA:  [0.29, 0.11, 0.56],
      colB:  [0.46, 0.30, 0.12],
      flash: [0.62, 0.20, 0.86],
      gain:  isSmall ? 2.60 : 1.90
    }
  };

  var temaAtual = document.documentElement.getAttribute('data-theme') === 'noite' ? 'noite' : 'luz';

  try {
    brain = new window.NeuroBrain(canvas, {
      colA: PALETA[temaAtual].colA,
      colB: PALETA[temaAtual].colB,
      flash: PALETA[temaAtual].flash,
      // celular tem menos partículas: cada uma brilha mais para o corpo ficar igual
      gain: PALETA[temaAtual].gain,
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
  /* O canvas ocupa a viewport inteira, então observá-lo cobre também os casos em
     que o 'resize' da janela não dispara: aba aberta em segundo plano, painel de
     preview oculto, restauração de sessão. Sem refazer as cenas aqui, a página
     que nasce com largura 0 fica presa no layout móvel mesmo depois de aparecer. */
  if (hasBrain && 'ResizeObserver' in window) {
    new ResizeObserver(function () {
      brain.resize();
      measure();
      applyScroll();
      garanteVisiveis();
    }).observe(canvas);
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
    if (!bounds.length) measure();
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
    }

    if (waFloat) waFloat.classList.toggle('is-on', window.scrollY > vh() * 0.55);
    document.body.classList.toggle('is-scrolled', window.scrollY > 24);
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
    garanteVisiveis();
  });

  /* =======================================================
     3. REVELAÇÕES
     ======================================================= */
  var revs = $$('.rv');
  revs.forEach(function (el) {
    var d = parseFloat(el.getAttribute('data-d') || 0);
    el.style.transitionDelay = (d * 85) + 'ms';
  });

  var io = null;

  /* Rede de segurança do IntersectionObserver: ele só avisa quando há interseção,
     e se a página nasce com viewport de tamanho zero — aba restaurada em segundo
     plano, webview embutida (o navegador do WhatsApp, que é de onde vem a maior
     parte do tráfego), painel de preview oculto — nada intersecta e o texto fica
     invisível para sempre. Aqui revelamos à força tudo que já está na tela. */
  var revelando = false;   // só depois que a abertura sai

  function garanteVisiveis() {
    if (!revs || !revelando) return;   // observadores podem chamar antes da hora
    var limite = vh() * 1.15;
    revs.forEach(function (el) {
      if (el.classList.contains('is-in')) return;
      var r = el.getBoundingClientRect();
      if (r.top < limite) {
        el.classList.add('is-in');
        if (io) io.unobserve(el);
      }
    });
  }

  /* As revelações só começam quando a abertura sai. Se o observador entrasse em
     ação durante o carregamento, o texto da primeira dobra já estaria posto
     atrás da cortina e a entrada aconteceria sem ninguém ver. */
  function iniciaRevelacoes() {
    revelando = true;
    if ('IntersectionObserver' in window && !reduced) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      revs.forEach(function (el) { io.observe(el); });
    } else {
      revs.forEach(function (el) { el.classList.add('is-in'); });
    }
    garanteVisiveis();
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
     3c. TEMA (claro / escuro)
     O tema inicial já foi aplicado por um script inline no <head> — aqui só
     tratamos a troca: atributo, preferência salva, cor da barra do navegador,
     paleta do cérebro e cor da onda do HUD.
     ======================================================= */
  var temaBtns = [$('#temaBtn'), $('#temaBtnMob')].filter(Boolean);
  var metaCor = $('meta[name="theme-color"]');
  var COR_BARRA = { luz: '#FBF8FE', noite: '#08060F' };

  function aplicaTema(t, comBrilho) {
    temaAtual = (t === 'noite') ? 'noite' : 'luz';
    document.documentElement.setAttribute('data-theme', temaAtual);
    if (metaCor) metaCor.setAttribute('content', COR_BARRA[temaAtual]);
    try { localStorage.setItem('am-tema', temaAtual); } catch (e) {}

    if (hasBrain) brain.tema(PALETA[temaAtual]);
    corDaOnda = null; // recalculada no próximo quadro a partir do CSS

    var rotulo = temaAtual === 'noite' ? 'Tema claro' : 'Tema escuro';
    temaBtns.forEach(function (b) {
      var txt = $('.temaLinha__txt', b);
      if (txt) txt.textContent = rotulo;
      b.setAttribute('title', rotulo);
      if (b.id === 'temaBtn') b.setAttribute('aria-label', rotulo);
    });
    if (comBrilho && hasBrain) {
      // um pulso curto ao trocar: o cérebro "respira" para marcar a transição
      brain.p.disperse = Math.min(0.5, brain.p.disperse + 0.12);
    }
  }

  temaBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      aplicaTema(temaAtual === 'noite' ? 'luz' : 'noite', true);
    });
  });

  aplicaTema(temaAtual, false);

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
     5. ONDA DO CABEÇALHO
     ======================================================= */

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
      if (!corDaOnda) {
        corDaOnda = getComputedStyle(document.documentElement)
          .getPropertyValue('--brand').trim() || '#6A34B4';
      }
      wctx.strokeStyle = corDaOnda;
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
    'PREPARANDO O ESPAÇO',
    'CADA HISTÓRIA É ÚNICA',
    'ESCUTA SEM JULGAMENTOS',
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
    // o texto sobe enquanto a cortina se dissolve, não depois dela
    setTimeout(iniciaRevelacoes, reduced ? 0 : 220);
    setTimeout(function () { if (boot && boot.parentNode) boot.parentNode.removeChild(boot); }, 1800);
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

  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    last = performance.now();
    if (running) { if (hasBrain) brain.resize(); measure(); applyScroll(); garanteVisiveis(); }
  });

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
    }
  }).catch(function (e) { console.warn('cerebro indisponivel:', e); });

  runBoot(malhaPronta, start);
})();
