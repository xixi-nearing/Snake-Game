from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / 'neon-snake' / 'index.html'
JS_PATH = ROOT / 'neon-snake' / 'js' / 'game.js'

errors = []

try:
    html = HTML_PATH.read_text(encoding='utf-8')
except Exception as exc:
    errors.append(f'Failed to read index.html: {exc}')
    html = ''

try:
    js = JS_PATH.read_text(encoding='utf-8')
except Exception as exc:
    errors.append(f'Failed to read main.js: {exc}')
    js = ''

required_html = [
    'data-page-target="upgrades"',
    'data-page-target="tips"',
    'data-page-target="contracts"',
    'id="touchControls"',
    'name="inputMode"',
    'data-page="upgrades"',
    'data-page="tips"',
    'data-page="contracts"',
]

required_js = [
    'createInputController',
    'createNavigation',
    'applyDirection',
    'togglePause',
    'renderUpgrades',
]

for snippet in required_html:
    if snippet not in html:
        errors.append(f'Missing HTML snippet: {snippet}')

for snippet in required_js:
    if snippet not in js:
        errors.append(f'Missing JS snippet: {snippet}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Smoke check passed.')
