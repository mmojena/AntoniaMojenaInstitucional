# Antônia Mojena — Landing Page "Monitor Neural"

Landing page de página única inspirada no layer *neural-monitor* do getlayers.ai:
cérebro em partículas renderizado em **WebGL puro**, cenas encadeadas pelo scroll
e CTA de WhatsApp em todas as etapas.

**Zero dependências** — sem React, sem three.js, sem build. É só abrir o `index.html`.

---

## Estrutura

```
index.html            markup + conteúdo (todos os textos ficam aqui)
css/styles.css        design system: paleta, tipografia, componentes, responsivo
js/brain.js           carregador da malha + renderer WebGL (+ cérebro procedural de reserva)
js/main.js            orquestração das cenas, HUD, menu mobile, revelações, boot
assets/cortex-hi.bin  nuvem de pontos do córtex real — desktop (686 KB)
assets/cortex-lo.bin  a mesma, reduzida — celular (229 KB)
tools/build-brain.py  gera os .bin a partir dos STL originais
tools/calib.html      banco de calibração: varre o ganho do cérebro e mede o resultado
tools/contraste.html  mede o contraste WCAG do texto sobre o cérebro, por tema
tools/preview-sobre.html  prévia isolada do retrato nos dois temas
tools/preview-topo.html   prévia do cabeçalho no estado rolado (lê o markup do index.html)
tools/preview-menu.html   prévia do menu mobile aberto, nos dois temas
tools/audit-mobile.html   auditoria de responsividade em 6 tamanhos de tela
originais/            arquivos originais das imagens (não são servidos)
```

## Como ver

Basta abrir `index.html` no navegador. Para servir localmente:

```bash
python3 -m http.server 5510
```

---

## O cérebro

O córtex **não é uma aproximação matemática** — é uma malha anatômica real:
superfície pial reconstruída por ressonância magnética, publicada pelo
NIH 3D Print Exchange.

| | |
|---|---|
| Modelo | *Brain — Left/Right Hemisphere* (3DPX-000757 / 3DPX-000758) |
| Autor | neuroscapelab — UCSF Neuroscape, projeto Glassbrain |
| Licença | **CC0 1.0 (domínio público)** — uso comercial livre, atribuição não obrigatória |
| Original | 554 mil triângulos nos dois hemisférios |

`tools/build-brain.py` amostra a malha com probabilidade proporcional à área de
cada triângulo, converte de RAS para os eixos do site, quantiza as posições em
int16 e as normais em int8, e grava os dois `.bin`. Para regenerar:

```bash
python tools/build-brain.py lh.stl rh.stl
```

Cerebelo, tronco encefálico, volume interno e poeira ambiente são gerados em
tempo de execução por cima do córtex real (a malha do NIH é só o córtex).

**Se os `.bin` não carregarem**, `js/brain.js` cai automaticamente para um
cérebro procedural — união de elipsoides com giros e fissura. O site nunca fica
sem cérebro, só com um menos detalhado.

---

## Os dois temas

A identidade é **roxo (ametista) + dourado**. O site tem dois temas, trocados
pelo botão redondo no topo (no celular, pela linha no fim do menu):

| | Fundo | O cérebro |
|---|---|---|
| **luz** (padrão) | quase branco | **tinta**: mistura normal, roxo profundo sobre claro |
| **noite** | tinta profunda | **luz**: mistura aditiva, partícula luminosa |

Os dois modos não são a mesma coisa com as cores invertidas. No fundo branco a
mistura aditiva simplesmente **desaparece** — somar luz ao branco continua branco.
Por isso `NeuroBrain.prototype.tema()` troca também o `blendFunc` e o ganho por
partícula, calibrados separadamente (`tools/calib.html`).

A escolha fica salva em `localStorage` (`am-tema`) e é aplicada por um script
inline no `<head>`, **antes** do CSS pintar — sem piscar o tema errado ao carregar.

**Trocar o padrão para o escuro:** em `index.html`, no script do `<head>`, mude
`if (t !== 'noite' && t !== 'luz') t = 'luz';` para `t = 'noite';`, e o
`data-theme="luz"` da tag `<html>`.

**Mexer nas cores:** tudo vive nos dois blocos de variáveis no topo de
`css/styles.css` — `:root` (tema claro) e `[data-theme="noite"]`. Nenhuma cor
literal aparece no resto do arquivo; mudar a identidade é mexer nesses dois blocos.

---

## O que você precisa colocar em `assets/`

| Arquivo | Uso | Se faltar |
|---|---|---|
| `assets/logo.png` | Logo original (assinatura + cérebro colorido) no topo | Cai para a assinatura em fonte script |
| `assets/antonia.jpg` | Retrato da seção "Sobre mim" | Mostra uma moldura com aviso |

O retrato já está no lugar: 880×1322, JPG qualidade 78, 197 KB. A moldura tem no
máximo 400 px de largura, então 880 px cobre telas de alta densidade com folga. O
arquivo original (PNG de 1,8 MB) ficou em `originais/antonia-original.png` — se
precisar de outro recorte, é dele que se parte:

```bash
sips -s format jpeg -s formatOptions 78 --resampleWidth 880 \
  originais/antonia-original.png --out assets/antonia.jpg
```

É só soltar os arquivos com esses nomes — o site detecta sozinho, sem editar código.

---

## Onde editar as informações

**WhatsApp** — o número aparece em 5 links (`wa.me/5566992007061`) e mais uma vez
na barra do topo (`tel:+5566992007061`). Para trocar, substitua o número no
`index.html` — formato: 55 + DDD + número, sem espaços ou traços.

Cada botão abre a conversa com uma **mensagem diferente**, escrita para o momento
em que a pessoa clicou:

| Onde | O que já vem escrito |
|---|---|
| Primeira dobra | fala que se identificou com o atendimento e pede horários |
| "Como funciona" | diz que estava lendo essa parte e ficou com uma dúvida |
| Fim da página | diz que leu o site inteiro e quer dar o próximo passo |
| Botão flutuante e menu | versão curta e direta, só pedindo horários |

A mensagem vem depois de `?text=` e precisa estar **codificada para URL** (espaço
vira `%20`, acento vira `%C3%A1` e assim por diante). Para gerar uma nova sem
errar a codificação, no terminal:

```bash
python3 -c "from urllib.parse import quote; print('https://wa.me/5566992007061?text='+quote(input('mensagem: ')))"
```

**Abertura** — a tela de carregamento é o `#boot` no `index.html`; as frases que
passam nela ficam no array `MSGS` em `js/main.js`. A saída é coreografada em duas
etapas: o bloco central sobe e desfoca, a cortina se dissolve logo atrás, e os
textos da primeira dobra só então começam a subir — por isso as revelações ficam
travadas (`revelando`) até o boot terminar.

**Cabeçalho ao rolar** — passando de 24px de scroll, o `body` ganha `is-scrolled`
e a faixa do topo fica opaca com desfoque. Sem isso a assinatura flutua por cima
do conteúdo que passa por baixo e parece defeito.

**Barra do topo** — o `<header class="hud">` no `index.html`. Hoje mostra agenda,
tipo de atendimento, público, cidade e telefone. Cada `<span class="hud__cell">`
some sozinho conforme a tela aperta; o telefone é o último a sair.

**Telefone exibido / cidade / horário** — seção `id="contato"` e o rodapé do menu mobile.

**Textos** — todos no `index.html`, dentro das seções marcadas com
`<!-- ==== NN — NOME ==== -->`.

> **Ao editar CSS ou JS, suba o número da versão** nos links do `<head>`
> (`styles.css?v=17` → `?v=18`). É o que faz o navegador do visitante pegar a
> versão nova em vez da guardada em cache.

---

## Celular

O site é pensado para o tráfego vindo do WhatsApp, que é majoritariamente móvel:

- **Menu próprio** — hambúrguer com painel em tela cheia, seis seções e CTA.
- **Nuvem reduzida** (229 KB em vez de 686 KB) e resolução limitada a 1.6× —
  metade do custo de preenchimento numa GPU de celular.
- **Cérebro atrás do texto, sem atrapalhar a leitura**: em vez de apagá-lo, cada
  bloco de texto ganha um véu local em degradê. Medido com `tools/contraste.html`
  na primeira dobra em 390×780: **17:1 em média**, e no pior pixel **9,8:1 no tema
  claro** e **8,0:1 no escuro** — bem acima do mínimo WCAG AA de 4,5:1. O véu é
  diferente em cada tema porque o risco é oposto: no escuro é uma sinapse
  estourando em branco atrás da letra; no claro é tinta escura sob texto escuro.
- **Deitado**, a tela volta a ter duas colunas e o cérebro sai de trás do texto.
- Áreas de toque de 44px+, `env(safe-area-inset-*)` para o notch, e os efeitos de
  *hover* desligados onde não existe cursor (no toque eles ficariam grudados).

Ajuste fino do cérebro no celular: `gain` e `maxDPR` na criação do `NeuroBrain`,
e a função `sceneParams()` — ambos em `js/main.js`.

### Auditoria

`tools/audit-mobile.html` carrega o site em iframes de tamanho fixo e verifica,
em cada tela: rolagem lateral, elementos passando da borda, alvos de toque de
44px, tamanho do texto corrido, se o botão de WhatsApp aparece sem rolar, altura
do cabeçalho, abertura e fechamento do menu, o alternador de tema dentro dele,
presença dos links de contato, resolução do canvas e carregamento do retrato.

Última execução — **sem falhas e sem avisos** em 320×568, 360×740, 390×844,
414×896, 768×1024 e 740×360 (deitado).

> O harness desliga as transições CSS dentro dos iframes antes de medir. Sem
> isso, um navegador que não esteja compondo quadros (aba em segundo plano)
> devolve sempre a opacidade inicial e a auditoria acusa falhas que não existem.

---

## Ajustando as cenas

Toda a coreografia vive no array `SCENES` em `js/main.js` — uma linha por seção:

| Campo | O que faz |
|---|---|
| `rotX` / `rotY` | rotação (radianos) — `rotY: 1.57` é o perfil puro |
| `scale` | zoom |
| `offX` / `offY` | posição na tela (−1 = esquerda, +1 = direita) |
| `disperse` | explode as partículas para fora (0 = coeso) |
| `opacity` | brilho geral |
| `size` | tamanho das partículas |
| `focus` | desloca a cor para o dourado |
| `veil` | escurece o fundo — **suba se algum texto ficar difícil de ler** |

Os valores são interpolados suavemente entre cenas: cada seção "segura" seu
estado nos primeiros 45% e faz a transição no restante do scroll.

**Cor das partículas:** o objeto `PALETA` em `js/main.js`, uma entrada por tema —
`colA` (corpo), `colB` (bordas), `flash` (o disparo sináptico) e `gain` (brilho
por partícula, com valor próprio para celular, onde a nuvem é menor). Valores RGB
de 0 a 1. Ao mexer neles, confira o resultado em `tools/calib.html`.

---

## Acessibilidade e fallbacks

- Sem WebGL → o cérebro some, o restante do site funciona normalmente.
- Sem JavaScript → `<noscript>` revela todo o conteúdo já visível.
- `prefers-reduced-motion` → animações e boot desligados.
- Trava de 6s garante que a tela de abertura nunca prenda a página.

---

## Publicar

O site é estático — sobe em qualquer lugar:

- **Netlify Drop** (`app.netlify.com/drop`): arraste a pasta inteira.
- **Vercel / GitHub Pages / Cloudflare Pages**: apontar para a pasta, sem build.
- **Hospedagem tradicional**: subir os arquivos por FTP na raiz do domínio.

Confirme que o servidor entrega `.bin` com `Content-Type` binário e, de
preferência, com gzip — os dois arquivos do córtex são o grosso do peso da página.

Antes de publicar, revise `<meta name="description">` e as tags `og:` no `<head>`
— são elas que aparecem quando o link é compartilhado no WhatsApp.
