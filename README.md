# Antônia Mojena — Landing Page "Monitor Neural"

Landing page de página única inspirada no layer *neural-monitor* do getlayers.ai:
cérebro em partículas renderizado em **WebGL puro**, HUD de telemetria, cenas
encadeadas pelo scroll e CTA de WhatsApp em todas as etapas.

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
```

## Como ver

Basta abrir `index.html` no navegador. Para servir localmente:

```bash
python -m http.server 5510
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

## O que você precisa colocar em `assets/`

| Arquivo | Uso | Se faltar |
|---|---|---|
| `assets/logo.png` | Logo original (assinatura + cérebro colorido) no topo | Cai para a assinatura em fonte script |
| `assets/antonia.jpg` | Retrato da seção "Sobre mim" (vertical, ~800×1000) | Mostra uma moldura com aviso |

É só soltar os arquivos com esses nomes — o site detecta sozinho, sem editar código.

---

## Onde editar as informações

**WhatsApp** — o número aparece em 5 links. Para trocar, substitua `5566992007061`
no `index.html` (formato: 55 + DDD + número, sem espaços ou traços). A mensagem
pré-preenchida vem depois de `?text=` e precisa estar codificada para URL.

**Telefone exibido / cidade / horário** — seção `id="contato"` e o rodapé do menu mobile.

**Textos** — todos no `index.html`, dentro das seções marcadas com
`<!-- ==== NN — NOME ==== -->`.

> **Ao editar CSS ou JS, suba o número da versão** nos links do `<head>`
> (`styles.css?v=6` → `?v=7`). É o que faz o navegador do visitante pegar a
> versão nova em vez da guardada em cache.

---

## Celular

O site é pensado para o tráfego vindo do WhatsApp, que é majoritariamente móvel:

- **Menu próprio** — hambúrguer com painel em tela cheia, seis seções e CTA.
- **Nuvem reduzida** (229 KB em vez de 686 KB) e resolução limitada a 1.6× —
  metade do custo de preenchimento numa GPU de celular.
- **Cérebro atrás do texto, sem atrapalhar a leitura**: em vez de apagá-lo, cada
  bloco de texto ganha um véu local em degradê. Contraste medido no título da
  primeira dobra: 16:1 em média, 4,8:1 no pixel mais claro (acima do mínimo
  WCAG AA) — mesmo quando uma sinapse estoura em branco bem atrás de uma letra.
- **Deitado**, a tela volta a ter duas colunas e o cérebro sai de trás do texto.
- Áreas de toque de 44px+, `env(safe-area-inset-*)` para o notch, e os efeitos de
  *hover* desligados onde não existe cursor (no toque eles ficariam grudados).

Ajuste fino do cérebro no celular: `gain` e `maxDPR` na criação do `NeuroBrain`,
e a função `sceneParams()` — ambos em `js/main.js`.

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

**Cor das partículas:** `colA` (corpo, sálvia) e `colB` (bordas, dourado) —
valores RGB de 0 a 1, em `js/main.js`.

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
