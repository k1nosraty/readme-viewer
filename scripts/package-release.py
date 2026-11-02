"""Build the portable package and check every locally referenced runtime asset."""
import hashlib
import json
from pathlib import Path
import re
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
names = ['index.html', 'app.js', 'styles.css', 'Launch-README-Viewer.bat', 'README.md', 'CHANGELOG.md', 'Launch-README-Viewer.sh']
files = [root / name for name in names]
for directory in ['src', 'vendor']:
    files.extend(sorted((root / directory).rglob('*')))
files = [p for p in files if p.is_file()]
for ref in re.findall(r'(?:src|href)="([^"#]+)"', (root / 'index.html').read_text()):
    if ':' not in ref and not (root / ref).is_file():
        raise SystemExit('Missing runtime asset: ' + ref)
output = root / 'dist'
output.mkdir(exist_ok=True)
archive = output / f'README-Viewer-{version}-Portable.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
    for file in files:
        target = 'README-Viewer/' + file.relative_to(root).as_posix()
        if file.name == 'index.html':
            html = re.sub(r'(<meta name="application-version" content=")[^"]+', r'\g<1>' + version, file.read_text())
            bundle.writestr(target, html)
        else:
            bundle.write(file, target)
with zipfile.ZipFile(archive) as bundle:
    if bundle.testzip():
        raise SystemExit('ZIP validation failed')
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / (archive.name + '.sha256')).write_text(digest + '  ' + archive.name + '\n')
print(f'Created {archive.name}: {len(files)} files, {archive.stat().st_size} bytes')
