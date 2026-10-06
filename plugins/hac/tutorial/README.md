# Tutorial em vídeo do HAC

Duas trilhas de vídeos curtos (1920×1080, narração em português), montadas com
[HyperFrames](https://github.com/heygen-com/hyperframes) a partir de prints da
interface **real** do plugin. Cada trilha usa só prints e regras da sua plataforma.

| Trilha | Vídeos |
|---|---|
| **Web** (`w1`–`w4`) | Primeiros passos · Ordem de Tabulação · Leitor de Tela (4 categorias, H1–H6) · Gerar e finalizar |
| **Mobile** (`m1`–`m5`) | Primeiros passos · Ordem de Tabulação · Ordem de Leitura (Swipe) · Leitor de Tela (3 categorias, "H" único) · Gerar e finalizar |

A trilha web não mostra o canvas: os prints reais do canvas (`../prints`) são de um
projeto mobile e só entram na trilha mobile.

## Como funciona

1. **Prints da interface** — `tools/shoot.cjs` abre `src/plugin/ui.html` num Chrome
   headless e troca o `parent` da página por um "Figma de mentira" que responde às
   mensagens da UI (`init-plugin` com o projeto de exemplo de `tools/sample-project.cjs`).
   Cada cena de `tools/scenes.cjs` chama funções reais da interface (abrir aba, modal,
   onboarding) e sai em duas versões: web (`prints/NN-*.png`) e mobile (`prints/m-NN-*.png`), 480×750 a 2x. As coordenadas dos botões a
   destacar vão para `prints/rects.json`.
2. **Prints do canvas** — a Plugin API não roda fora do Figma, então as cenas que
   mostram o resultado no canvas usam os prints reais de `../prints/Screenshot *.png`
   (feitos à mão em 30/09, projeto mobile).
3. **Roteiros** — `video/roteiro-<id>.json`, todos gerados por `tools/roteiros.py`
   (edite lá e rode de novo). Cada cena tem `fala`, `titulo` e um `print` (UI) ou `real`
   (canvas), com `destaque`/`destaques`/`destaqueManual`.
4. **Narração** — `tools/tts.py <id>` gera um `.wav` por cena com o Kokoro local (voz
   `pf_dora`). Termos em inglês (handoff, plugin...) e "HAC" (lido "hack") seguem
   `video/pronuncia.json`. Só refaz a cena cuja fala mudou.
5. **Composição** — `tools/build-video.cjs NN` monta `video/vNN/index.html` (tempo de
   cada cena = duração da fala + respiro), com Roboto local e cores da marca.
6. **Render** — `npx hyperframes render video/vNN -o renders/....mp4 --workers 2`.

## Refazer depois de mudar a interface

```bash
cd plugins/hac && npm run bundle:ui          # ui.html atualizado
cd tutorial
node tools/shoot.cjs                         # todos os prints (ou: node tools/shoot.cjs 05-aba-tabulacao)
python tools/roteiros.py                     # se mudou algum roteiro
python tools/tts.py w2                       # só refaz as falas alteradas
node tools/build-video.cjs w2                # monta
npx hyperframes render video/vw2 -o renders/hac-web-2-ordem-de-tabulacao.mp4 --workers 2
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
