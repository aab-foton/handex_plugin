"""Gera a narração de cada cena de um roteiro com `hyperframes tts` (Kokoro local).
Uso: python tools/tts.py 02 [03 ...]   — pula cenas cujo .wav já existe e cuja fala não mudou."""
import json, os, subprocess, sys, hashlib
os.chdir(os.path.join(os.path.dirname(__file__), '..'))
env = dict(os.environ)
env['PATH'] = os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WinGet\Links') + os.pathsep + env['PATH']
env['HYPERFRAMES_PYTHON'] = sys.executable
os.makedirs('video/audio', exist_ok=True)
for nn in sys.argv[1:]:
    r = json.load(open(f'video/roteiro-{nn}.json', encoding='utf-8'))
    for c in r['cenas']:
        out = f"video/audio/{nn}-{c['id']}.wav"
        stamp = out + '.txt'
        h = hashlib.sha1((r['voz'] + c['fala']).encode()).hexdigest()
        if os.path.exists(out) and os.path.exists(stamp) and open(stamp).read() == h:
            continue
        subprocess.run(['npx.cmd', 'hyperframes', 'tts', c['fala'], '--voice', r['voz'], '--output', out],
                       capture_output=True, env=env, check=False)
        if not os.path.exists(out):
            print('FALHOU', out); continue
        open(stamp, 'w').write(h)
        print(nn, c['id'], 'ok')
