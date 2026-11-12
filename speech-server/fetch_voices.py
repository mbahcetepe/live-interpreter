"""Downloads Piper voices and writes voices.json, for the Windows and macOS installers.

  python fetch_voices.py --dir VOICES [--langs "en tr de"]

One or two medium-quality voices for every language of the extension that Piper has
(the same list as install-ubuntu.sh). Greek, Indonesian, Japanese and Korean have no
Piper voice: those languages get subtitles but no local speech. Voices already there are
not downloaded again.
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import urllib.request
from pathlib import Path

PIPER_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0'

VOICES = {
    'en': ['en/en_US/lessac/medium/en_US-lessac-medium', 'en/en_US/ryan/medium/en_US-ryan-medium'],
    'tr': ['tr/tr_TR/dfki/medium/tr_TR-dfki-medium', 'tr/tr_TR/fahrettin/medium/tr_TR-fahrettin-medium'],
    'de': ['de/de_DE/thorsten/medium/de_DE-thorsten-medium'],
    'fr': ['fr/fr_FR/siwis/medium/fr_FR-siwis-medium', 'fr/fr_FR/tom/medium/fr_FR-tom-medium'],
    'es': ['es/es_ES/davefx/medium/es_ES-davefx-medium', 'es/es_MX/ald/medium/es_MX-ald-medium'],
    'it': ['it/it_IT/paola/medium/it_IT-paola-medium'],
    'pt': ['pt/pt_BR/faber/medium/pt_BR-faber-medium', 'pt/pt_BR/cadu/medium/pt_BR-cadu-medium'],
    'nl': ['nl/nl_BE/nathalie/medium/nl_BE-nathalie-medium', 'nl/nl_BE/rdh/medium/nl_BE-rdh-medium'],
    'pl': ['pl/pl_PL/gosia/medium/pl_PL-gosia-medium', 'pl/pl_PL/darkman/medium/pl_PL-darkman-medium'],
    'ru': ['ru/ru_RU/irina/medium/ru_RU-irina-medium', 'ru/ru_RU/denis/medium/ru_RU-denis-medium'],
    'uk': ['uk/uk_UA/ukrainian_tts/medium/uk_UA-ukrainian_tts-medium'],
    'ar': ['ar/ar_JO/kareem/medium/ar_JO-kareem-medium'],
    'ro': ['ro/ro_RO/mihai/medium/ro_RO-mihai-medium'],
    'sv': ['sv/sv_SE/lisa/medium/sv_SE-lisa-medium', 'sv/sv_SE/nst/medium/sv_SE-nst-medium'],
    'hi': ['hi/hi_IN/priyamvada/medium/hi_IN-priyamvada-medium', 'hi/hi_IN/pratham/medium/hi_IN-pratham-medium'],
    'zh': ['zh/zh_CN/huayan/medium/zh_CN-huayan-medium'],
}


def tls_context():
    # Some Python builds do not find the system's certificates; certifi comes with the
    # server's packages.
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def download(url: str, target: Path, context) -> None:
    part = target.with_name(target.name + '.part')
    with urllib.request.urlopen(url, context=context, timeout=60) as response, open(part, 'wb') as out:
        while chunk := response.read(1 << 20):
            out.write(chunk)
    part.replace(target)


def main() -> int:
    parser = argparse.ArgumentParser(description='Download Piper voices for the speech server')
    parser.add_argument('--dir', required=True)
    parser.add_argument('--langs', default=' '.join(VOICES))
    args = parser.parse_args()
    folder = Path(args.dir)
    folder.mkdir(parents=True, exist_ok=True)
    context = tls_context()
    config: dict[str, list] = {}
    for lang in args.langs.replace(',', ' ').split():
        if lang not in VOICES:
            print(f'  {lang}: no Piper voice, skipped')
            continue
        for rel in VOICES[lang]:
            name = rel.rsplit('/', 1)[-1]
            ok = True
            for ext in ('onnx', 'onnx.json'):
                target = folder / f'{name}.{ext}'
                if target.exists() and target.stat().st_size > 0:
                    continue
                try:
                    download(f'{PIPER_BASE}/{rel}.{ext}', target, context)
                except Exception as err:  # noqa: BLE001 - one voice missing is not fatal
                    print(f'  could not download {name}.{ext}: {err}', file=sys.stderr)
                    ok = False
            if ok:
                config.setdefault(lang, []).append({'name': name, 'path': f'{name}.onnx'})
        if lang in config:
            print(f"  {lang}: {' '.join(v['name'] for v in config[lang])}")
    if not config:
        print('no voice could be downloaded', file=sys.stderr)
        return 1
    (folder / 'voices.json').write_text(json.dumps(config, indent=2), encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main())
