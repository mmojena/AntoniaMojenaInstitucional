#!/usr/bin/env python3
"""
Converte as malhas STL do córtex humano numa nuvem de pontos compacta para o site.

Fonte: NIH 3D — "Brain - Left/Right Hemisphere" (3DPX-000757 / 3DPX-000758),
autor neuroscapelab (UCSF Neuroscape, projeto Glassbrain).
Licença: CC0 1.0 (domínio público) — uso comercial liberado, sem atribuição
obrigatória. Superfície pial reconstruída a partir de ressonância magnética.

Uso:
    python tools/build-brain.py lh.stl rh.stl

Gera assets/cortex-hi.bin (desktop) e assets/cortex-lo.bin (celular).

Formato do arquivo (little-endian):
    char[4]  'MOJB'
    uint32   quantidade de pontos
    float32  escala (posição real = int16 * escala)
    int16[3] * n   posições quantizadas
    int8[3]  * n   normais quantizadas (-127..127)

Eixos de saída: x = lateral, y = vertical, z = frente(+) / nuca(-).
O STL vem em RAS (x=direita, y=anterior, z=superior), então trocamos Y↔Z.
"""

import struct
import sys
import os
import numpy as np

STL_DTYPE = np.dtype([('n', '<3f4'), ('v', '<3,3f4'), ('attr', '<u2')])

COMPRIMENTO_ALVO = 1.75  # comprimento ântero-posterior no espaço normalizado


def carrega_stl(caminho):
    dados = open(caminho, 'rb').read()
    n_tri = struct.unpack('<I', dados[80:84])[0]
    esperado = 84 + 50 * n_tri
    if len(dados) != esperado:
        raise SystemExit('%s nao parece um STL binario (%d bytes, esperado %d)'
                         % (caminho, len(dados), esperado))
    return np.frombuffer(dados, dtype=STL_DTYPE, count=n_tri, offset=84)


def amostra(tris, n_pontos, rng):
    """Amostra n_pontos na superfície, com probabilidade proporcional à área."""
    v = tris['v'].astype(np.float64)          # (T, 3, 3)
    a, b, c = v[:, 0], v[:, 1], v[:, 2]

    cruz = np.cross(b - a, c - a)
    area2 = np.linalg.norm(cruz, axis=1)
    validos = area2 > 1e-12

    a, b, c, cruz, area2 = a[validos], b[validos], c[validos], cruz[validos], area2[validos]
    normais = cruz / area2[:, None]

    # a normal gravada no STL define o lado de fora: alinhamos a nossa a ela
    nstl = tris['n'].astype(np.float64)[validos]
    nl = np.linalg.norm(nstl, axis=1)
    tem_normal = nl > 1e-6
    concorda = np.einsum('ij,ij->i', normais[tem_normal], nstl[tem_normal] / nl[tem_normal, None])
    sinal = np.ones(len(normais))
    sinal[tem_normal] = np.where(concorda < 0, -1.0, 1.0)
    normais *= sinal[:, None]

    acum = np.cumsum(area2)
    idx = np.searchsorted(acum, rng.random(n_pontos) * acum[-1])
    idx = np.clip(idx, 0, len(a) - 1)

    u = rng.random(n_pontos)
    w = rng.random(n_pontos)
    dobra = (u + w) > 1.0
    u[dobra] = 1.0 - u[dobra]
    w[dobra] = 1.0 - w[dobra]

    p0, p1, p2 = a[idx], b[idx], c[idx]
    pontos = p0 + (p1 - p0) * u[:, None] + (p2 - p0) * w[:, None]
    return pontos, normais[idx]


def escreve(caminho, pos, nrm):
    lim = np.abs(pos).max()
    escala = lim / 32700.0
    q = np.clip(np.round(pos / escala), -32767, 32767).astype('<i2')
    qn = np.clip(np.round(nrm * 127.0), -127, 127).astype('i1')

    with open(caminho, 'wb') as f:
        f.write(b'MOJB')
        f.write(struct.pack('<I', len(pos)))
        f.write(struct.pack('<f', escala))
        f.write(q.tobytes())
        f.write(qn.tobytes())

    print('  %-28s %7d pontos  %6.1f KB' % (os.path.basename(caminho), len(pos),
                                            os.path.getsize(caminho) / 1024))


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)

    tris = np.concatenate([carrega_stl(p) for p in sys.argv[1:3]])
    print('malhas carregadas: %d triangulos' % len(tris))

    rng = np.random.default_rng(20260818)  # determinístico: mesma nuvem a cada build

    saida = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
    os.makedirs(saida, exist_ok=True)

    for nome, n in (('cortex-hi.bin', 78000), ('cortex-lo.bin', 26000)):
        pos, nrm = amostra(tris, n, rng)

        # RAS -> eixos do site, centralizado e normalizado pelo comprimento AP
        centro = (pos.max(0) + pos.min(0)) / 2.0
        pos = pos - centro
        escala = COMPRIMENTO_ALVO / (pos[:, 1].max() - pos[:, 1].min())

        conv = np.empty_like(pos)
        conv[:, 0] = pos[:, 0] * escala          # lateral
        conv[:, 1] = pos[:, 2] * escala          # vertical  (era superior)
        conv[:, 2] = pos[:, 1] * escala          # frente    (era anterior)

        cn = np.empty_like(nrm)
        cn[:, 0], cn[:, 1], cn[:, 2] = nrm[:, 0], nrm[:, 2], nrm[:, 1]
        cn /= np.linalg.norm(cn, axis=1)[:, None]

        escreve(os.path.join(saida, nome), conv, cn)

        if nome.endswith('hi.bin'):
            print('  extensao x/y/z: %s' % np.round(conv.max(0) - conv.min(0), 3))
            print('  limites  y: %.3f .. %.3f' % (conv[:, 1].min(), conv[:, 1].max()))
            print('  limites  z: %.3f .. %.3f' % (conv[:, 2].min(), conv[:, 2].max()))


if __name__ == '__main__':
    main()
