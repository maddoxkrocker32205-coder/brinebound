#!/usr/bin/env python3
"""Make the hand-off files, so the project can move to another AI assistant or computer at any time.

    python3 tools/export.py

writes, for the version in src/config.js:
  exports/brinebound-<version>.html             the playable game, one file
  exports/brinebound-<version>-project.zip      the whole project: source, builds, tools, tests, HANDOFF.md, UNITY.md
  exports/brinebound-<version>-source.md        HANDOFF.md plus every source file, in one Markdown file
  exports/brinebound-<version>-unity-kit.zip    for Unity: the offline build, a C# loader, the soundtrack as MP3s
It rebuilds dist/ first if any file in src/ is newer than the builds.
"""
import argparse, glob, os, re, shutil, subprocess, sys, time, zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
TOP = ['README.md', 'SETUP.md', 'HANDOFF.md', 'UNITY.md', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.gitignore', '.gitattributes',
       'package.json', 'package-lock.json', 'build.mjs']
# folders copied whole (files only, dotfiles included), as (folder, allowed extensions or None for all)
DIRS = [('tools', ('.py', '.mjs')), ('unity', ('.cs',)), ('web', ('.png',)), ('.vscode', ('.json',)), ('.github', ('.md',)),
        ('docs', None), ('src', None)]
TEXT_IN_SOURCE_MD = ('.js', '.mjs', '.py', '.html', '.json', '.md', '.cs')
LANG = {'.js': 'js', '.mjs': 'js', '.html': 'html', '.json': 'json', '.py': 'python', '.md': 'markdown', '.sh': 'bash', '.cs': 'csharp'}


def version():
    with open(os.path.join(ROOT, 'src', 'config.js'), encoding='utf-8') as f:
        m = re.search(r"export const VERSION = '([^']+)'", f.read())
    if not m:
        raise SystemExit('VERSION not found in src/config.js')
    return m.group(1)


def fresh_build():
    """Rebuild dist/brinebound.html (and the offline build, when Node and esbuild are here) if src/ changed."""
    newest = max(os.path.getmtime(p) for p in glob.glob(os.path.join(ROOT, 'src', '*')))
    node = os.path.isdir(os.path.join(ROOT, 'node_modules', 'esbuild')) and shutil.which('node')
    for name, flags in (('brinebound.html', []), ('brinebound-offline.html', ['--offline'])):
        dist = os.path.join(ROOT, 'dist', name)
        if os.path.exists(dist) and os.path.getmtime(dist) >= newest:
            continue
        if node:
            cmd = ['node', 'build.mjs'] + flags
        elif not flags:
            cmd = [sys.executable, 'tools/build.py']
        else:
            print('No Node packages here, so the offline build (three.js built in) is skipped: run npm install, then node build.mjs --offline.')
            continue
        print('src/ changed since the last build: running', ' '.join(cmd))
        subprocess.run(cmd, cwd=ROOT, check=True)
    docs = os.path.join(ROOT, 'docs', 'index.html')
    if node and (not os.path.exists(docs) or os.path.getmtime(docs) < newest):
        print('src/ changed since the last publish: running node tools/publish.mjs')
        subprocess.run(['node', 'tools/publish.mjs'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    return os.path.join(ROOT, 'dist', 'brinebound.html')


def unity_kit(path):
    """The Unity kit: Assets/ folders to drop into a Unity project, plus UNITY.md."""
    offline = os.path.join(ROOT, 'dist', 'brinebound-offline.html')
    if not os.path.exists(offline):
        print('No offline build: the Unity kit is skipped.')
        return None
    items = [(offline, 'Assets/StreamingAssets/brinebound.html'),
             (os.path.join(ROOT, 'unity', 'BrineboundWebView.cs'), 'Assets/Scripts/BrineboundWebView.cs'),
             (os.path.join(ROOT, 'UNITY.md'), 'UNITY.md')]
    items += [(p, 'Assets/Audio/' + os.path.basename(p)) for p in sorted(glob.glob(os.path.join(ROOT, 'unity', 'Audio', '*.mp3')))]
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for src, rel in items:
            if os.path.exists(src):
                info = zipfile.ZipInfo(f'brinebound-unity-kit/{rel}', time.localtime(os.path.getmtime(src))[:6])
                info.compress_type = zipfile.ZIP_STORED if rel.endswith('.mp3') else zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                with open(src, 'rb') as f:
                    z.writestr(info, f.read())
    return path


def tests_dir(arg):
    for d in ([arg] if arg else []) + [os.path.join(ROOT, 'tests'), os.path.join(ROOT, '..', 'tests')]:
        if d and os.path.isfile(os.path.join(d, 'harness.py')):
            return os.path.abspath(d)
    return None


def project_files(tests):
    files = [(os.path.join(ROOT, p), p) for p in TOP if os.path.exists(os.path.join(ROOT, p))]
    for d, exts in DIRS:
        for p in sorted(glob.glob(os.path.join(ROOT, d, '*')) + glob.glob(os.path.join(ROOT, d, '.*'))):
            if os.path.isfile(p) and (exts is None or p.endswith(exts)):
                files.append((p, d + '/' + os.path.basename(p)))
    for name in ('brinebound.html', 'brinebound-offline.html'):
        if os.path.exists(os.path.join(ROOT, 'dist', name)):
            files.append((os.path.join(ROOT, 'dist', name), 'dist/' + name))
    if tests:
        for p in sorted(glob.glob(os.path.join(tests, '*'))):
            if os.path.isfile(p) and os.path.splitext(p)[1] in ('.py', '.sh', '.js') and not os.path.basename(p).startswith('logs_'):
                files.append((p, 'tests/' + os.path.basename(p)))
    return files


def fence(text):
    run = max([len(m) for m in re.findall(r'`{3,}', text)] + [2])
    return '`' * (run + 1)


def source_md(ver, files):
    with open(os.path.join(ROOT, 'HANDOFF.md'), encoding='utf-8') as f:
        out = [f.read().rstrip(), '', '---', '', f'# Source files (version {ver})', '',
               'Every file needed to build the game follows, each under its path. The tests and the built page are in the project zip, not here.', '']
    for src, rel in files:
        if rel.split('/')[0] in ('tests', 'dist', 'docs', 'web', '.vscode', '.github') or not rel.endswith(TEXT_IN_SOURCE_MD) \
                or rel in ('HANDOFF.md', 'package-lock.json', 'CLAUDE.md', 'GEMINI.md'):
            continue
        with open(src, encoding='utf-8') as f:
            text = f.read()
        fe = fence(text)
        out += [f'## {rel}', '', fe + LANG.get(os.path.splitext(rel)[1], ''), text.rstrip('\n'), fe, '']
    return '\n'.join(out) + '\n'


def main():
    ap = argparse.ArgumentParser(description='Write the hand-off files to exports/.')
    ap.add_argument('--tests', help='folder with the Playwright tests (default: tests/ in the project, or ../tests)')
    a = ap.parse_args()
    ver = version()
    dist = fresh_build()
    out = os.path.join(ROOT, 'exports')
    os.makedirs(out, exist_ok=True)
    tests = tests_dir(a.tests)
    files = project_files(tests)
    html = os.path.join(out, f'brinebound-{ver}.html')
    shutil.copyfile(dist, html)
    zpath = os.path.join(out, f'brinebound-{ver}-project.zip')
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for src, rel in files:
            info = zipfile.ZipInfo(f'brinebound/{rel}', time.localtime(os.path.getmtime(src))[:6])
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o755 if rel.endswith(('.py', '.sh')) else 0o644) << 16
            with open(src, 'rb') as f:
                z.writestr(info, f.read())
    mpath = os.path.join(out, f'brinebound-{ver}-source.md')
    with open(mpath, 'w', encoding='utf-8') as f:
        f.write(source_md(ver, files))
    kit = unity_kit(os.path.join(out, f'brinebound-{ver}-unity-kit.zip'))
    for p in (html, zpath, mpath, kit):
        if not p:
            continue
        print(f'{os.path.relpath(p, ROOT):46s} {os.path.getsize(p) / 1024:8.1f} KB')
    print(f'{len(files)} files in the zip' + ('' if tests else ' (no tests folder found)'))


if __name__ == '__main__':
    main()
