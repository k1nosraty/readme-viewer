"""Create a portable Linux tarball and an architecture-independent Debian package."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
output = root / 'dist'
output.mkdir(exist_ok=True)
names = ['index.html', 'app.js', 'styles.css', 'src', 'vendor', 'README.md', 'CHANGELOG.md', 'Launch-README-Viewer.sh']
with tempfile.TemporaryDirectory() as temporary:
    stage = Path(temporary)
    app = stage / 'opt/readme-viewer'
    app.mkdir(parents=True)
    for name in names:
        source = root / name
        if source.is_dir(): shutil.copytree(source, app / name)
        else: shutil.copy2(source, app / name)
    (app / 'Launch-README-Viewer.sh').chmod(0o755)
    archive = output / f'README-Viewer-{version}-Linux-Portable.tar.gz'
    with tarfile.open(archive, 'w:gz') as bundle:
        bundle.add(app, arcname='README-Viewer')
    control = stage / 'DEBIAN'
    control.mkdir()
    (control / 'control').write_text(f'''Package: readme-viewer
Version: {version}
Section: editors
Priority: optional
Architecture: all
Depends: xdg-utils
Maintainer: k1nosraty <19625646+k1nosraty@users.noreply.github.com>
Description: Offline Markdown viewer with editable task lists
 View Markdown files in your default browser without a local server.
''')
    bin_dir = stage / 'usr/bin'
    bin_dir.mkdir(parents=True)
    launcher = bin_dir / 'readme-viewer'
    launcher.write_text('#!/bin/sh\nexec /opt/readme-viewer/Launch-README-Viewer.sh "$@"\n')
    launcher.chmod(0o755)
    desktop_dir = stage / 'usr/share/applications'
    desktop_dir.mkdir(parents=True)
    (desktop_dir / 'readme-viewer.desktop').write_text('''[Desktop Entry]
Type=Application
Name=README Viewer
Comment=Offline Markdown viewer
Exec=readme-viewer
Icon=readme-viewer
Terminal=false
Categories=Office;Utility;
''')
    icons = stage / 'usr/share/icons/hicolor/scalable/apps'
    icons.mkdir(parents=True)
    shutil.copy2(root / 'packaging/icon.svg', icons / 'readme-viewer.svg')
    deb = output / f'README-Viewer-{version}-Linux-all.deb'
    subprocess.run(['dpkg-deb', '--root-owner-group', '--build', str(stage), str(deb)], check=True)
for file in [archive, deb]:
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    (output / (file.name + '.sha256')).write_text(digest + '  ' + file.name + '\n')
    print('Created ' + file.name)
