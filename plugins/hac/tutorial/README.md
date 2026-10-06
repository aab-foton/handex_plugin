# Tutorial em vídeo do HAC

Série de 5 vídeos curtos (1920×1080, narração em português), montada com
[HyperFrames](https://github.com/heygen-com/hyperframes) a partir de prints da
interface **real** do plugin.

| # | Vídeo | Duração |
|---|---|---|
| 1 | Primeiros passos | ~1min28 |
| 2 | Ordem de Tabulação | ~1min09 |
| 3 | Leitor de Tela | ~1min19 |
| 4 | Ordem de Leitura (mobile) | ~51s |
| 5 | Gerar e finalizar o handoff | ~59s |

## Como funciona

1. **Prints da interface** — `tools/shoot.cjs` abre `src/plugin/ui.html` num Chrome
   headless e troca o `parent` da página por um "Figma de mentira" que responde às
   mensagens da UI (`init-plugin` com o projeto de exemplo de `tools/sample-project.cjs`).
   Cada cena de `tools/scenes.cjs` chama funções reais da interface (abrir aba, modal,
   onboarding) e gera `prints/NN-*.png` (480×750 a 2x). As coordenadas dos botões a
   destacar vão para `prints/rects.json`.
2. **Prints do canvas** — a Plugin API não roda fora do Figma, então as cenas que
   mostram o resultado no canvas usam os prints reais de `../prints/Screenshot *.png`
   (feitos à mão em 30/09, projeto mobile).
3. **Roteiros** — `video/roteiro-NN.json` (o 1 é editado à mão; 2 a 5 vêm de
   `tools/roteiros.py`). Cada cena tem `fala`, `titulo` e um `print` (UI) ou `real`
   (canvas), com `destaque`/`destaques`/`destaqueManual`.
4. **Narração** — `tools/tts.py NN` gera um `.wav` por cena com `hyperframes tts`
   (Kokoro local, voz `pf_dora`). Só refaz a cena cuja fala mudou.
5. **Composição** — `tools/build-video.cjs NN` monta `video/vNN/index.html` (tempo de
   cada cena = duração da fala + respiro), com Roboto local e cores da marca.
6. **Render** — `npx hyperframes render video/vNN -o renders/....mp4 --workers 2`.

## Refazer depois de mudar a interface

```bash
cd plugins/hac && npm run bundle:ui          # ui.html atualizado
cd tutorial
node tools/shoot.cjs                         # todos os prints (ou: node tools/shoot.cjs 05-aba-tabulacao)
python tools/tts.py 01 02 03 04 05           # só se alguma fala mudou
node tools/build-video.cjs 02                # monta
npx hyperframes render video/v02 -o renders/hac-02-ordem-de-tabulacao.mp4 --workers 2
```

Requisitos já instalados nesta máquina: Node 22+, Chrome, FFmpeg (winget
`Gyan.FFmpeg`), Python com `kokoro-onnx soundfile` (`HYPERFRAMES_PYTHON` aponta para
ele em `tools/tts.py`).

## Trocar a voz

A voz local (Kokoro) é boa para rascunho. Para a versão oficial: voz HeyGen ou
ElevenLabs (pagas, ver `skills/media-use/audio/references/tts.md` do HyperFrames), ou
gravar a própria voz por cena em `video/audio/NN-<id>.wav` e rodar só o passo 5.

## O que não vai para o git

`node_modules/`, `renders/` (MP4), `video/audio/` e `video/v*/` (gerados). Os prints,
roteiros e scripts vão.
