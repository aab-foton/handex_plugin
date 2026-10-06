"""Gera a narração de cada cena com o Kokoro local (mesmo modelo do `hyperframes tts`).

Pronúncia mista: a fala é fonetizada em pt-br, mas os termos de video/pronuncia.json
("handoff", "plugin"...) são fonetizados em inglês, e "HAC" sai como "hack". Os
fonemas são juntados e sintetizados de uma vez (is_phonemes=True).

Uso: python tools/tts.py 01 02 ...   — refaz só a cena cuja fala, voz ou pronúncia mudou.
"""
import hashlib, json, os, re, sys
import soundfile as sf
from kokoro_onnx import Kokoro

T = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.chdir(T)
CACHE = os.path.expanduser('~/.cache/hyperframes/tts/')
model = Kokoro(CACHE + 'models/kokoro-v1.0.onnx', CACHE + 'voices/voices-v1.0.bin')
tok = model.tokenizer
pron = json.load(open('video/pronuncia.json', encoding='utf-8'))
en = {w.lower() for w in pron['termos_em_ingles']}
fixos = pron['fonemas_fixos']
pron_sig = json.dumps(pron, sort_keys=True)

WORD = re.compile(r"[A-Za-zÀ-ÿ0-9]+")


def phonemes(text):
    """pt-br por trechos; termo em inglês ou fixo vira fonema próprio."""
    out, buf, last = [], [], 0
    for m in WORD.finditer(text):
        w = m.group(0)
        special = w in fixos or w.upper() in fixos or w.lower() in en
        if not special:
            continue
        buf.append(text[last:m.start()])
        chunk = ''.join(buf).strip()
        if chunk:
            # Trecho que termina antes de um termo especial: fonetiza com uma
            # palavra de apoio ("lá") no lugar do termo e tira os fonemas dela —
            # senão um artigo solto ("o") vira tônico ("ó").
            ph = tok.phonemize(chunk + ' lá', 'pt-br').rstrip()
            ph = re.sub(r'\s*lˈa$', '', ph) if re.search(r'lˈa$', ph) else tok.phonemize(chunk, 'pt-br')
            out.append(ph)
        buf = []
        out.append(fixos.get(w) or fixos.get(w.upper()) or tok.phonemize(w, 'en-us'))
        last = m.end()
    rest = text[last:].strip()
    if rest:
        out.append(tok.phonemize(rest, 'pt-br'))
    return ' '.join(p.strip() for p in out if p.strip())


if sys.argv[1:2] == ['--show']:  # python tools/tts.py --show "frase" -> imprime a fonética
    for s in sys.argv[2:]:
        print(s, '\n   ', phonemes(s))
    sys.exit(0)

os.makedirs('video/audio', exist_ok=True)
for nn in sys.argv[1:]:
    r = json.load(open(f'video/roteiro-{nn}.json', encoding='utf-8'))
    for c in r['cenas']:
        out = f"video/audio/{nn}-{c['id']}.wav"
        stamp = out + '.txt'
        h = hashlib.sha1((r['voz'] + c['fala'] + pron_sig + 'v2').encode()).hexdigest()
        if os.path.exists(out) and os.path.exists(stamp) and open(stamp).read() == h:
            continue
        ph = phonemes(c['fala'])
        samples, rate = model.create(ph, voice=r['voz'], speed=1.0, lang='pt-br', is_phonemes=True)
        sf.write(out, samples, rate)
        open(stamp, 'w').write(h)
        print(nn, c['id'], 'ok')
