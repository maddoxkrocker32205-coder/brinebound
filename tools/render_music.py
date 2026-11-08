#!/usr/bin/env python3
"""Render the soundtrack in src/music.js to MP3 files (for a native Unity version, or just to listen).

    pip install playwright && playwright install chromium     (once)
    python3 tools/render_music.py                              -> unity/Audio/*.mp3

The tunes are synthesized live in the browser with Web Audio, so this plays each one through an
OfflineAudioContext in a headless Chromium, saves a WAV, and has ffmpeg level it (EBU R128, -16 LUFS)
and encode it as MP3. Needs ffmpeg on the PATH.
"""
import asyncio, os, shutil, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'unity', 'Audio')
ORDER = [('title', '01-brinebound-theme'), ('sea', '02-the-salt-road'), ('port', '03-brine-haven'), ('night', '04-lantern-watch'), ('battle', '05-black-powder')]

PAGE = '''<!doctype html><meta charset="utf-8"><body><script type="module">
import { Music, TRACKS } from '/music.js';
window.renderTune = async (id) => {
  const T = TRACKS[id];
  let bars = 0;
  for (const [part] of T.form) bars += T.parts[part].mel.split('|').length;
  const buf = await Music.render(id, bars, 44100);
  // 16-bit stereo WAV
  const n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1);
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, 44100, true);
  out.setUint32(28, 44100 * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  window.wav = { url: URL.createObjectURL(new Blob([out.buffer], { type: 'audio/wav' })), file: id + '.wav' };
  return { name: T.name, secs: +(n / 44100).toFixed(1) };
};
window.saveWav = () => { const a = document.createElement('a'); a.href = window.wav.url; a.download = window.wav.file; document.body.append(a); a.click(); a.remove(); };
window.ready = true;
</script>'''


async def main():
    from playwright.async_api import async_playwright
    if not shutil.which('ffmpeg'):
        raise SystemExit('ffmpeg is needed on the PATH.')
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(ROOT, 'src', 'music.js'), 'rb') as f:
        music = f.read()
    tmp = tempfile.mkdtemp()
    chrome = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=chrome)
        page = await (await b.new_context(accept_downloads=True)).new_page()
        await page.route('http://music.local/', lambda r: r.fulfill(status=200, body=PAGE, headers={'Content-Type': 'text/html'}))
        await page.route('http://music.local/music.js', lambda r: r.fulfill(status=200, body=music, headers={'Content-Type': 'text/javascript'}))
        await page.goto('http://music.local/')
        await page.wait_for_function('window.ready === true')
        for tid, fname in ORDER:
            info = await page.evaluate('(id) => window.renderTune(id)', tid)
            async with page.expect_download(timeout=120000) as dl:
                await page.evaluate('() => window.saveWav()')
            wav = os.path.join(tmp, tid + '.wav')
            await (await dl.value).save_as(wav)
            mp3 = os.path.join(OUT, fname + '.mp3')
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100',
                            '-codec:a', 'libmp3lame', '-b:a', '160k', '-metadata', f'title={info["name"]}', '-metadata', 'artist=Brinebound',
                            '-metadata', 'album=Brinebound soundtrack', mp3], check=True)
            print(f'{os.path.relpath(mp3, ROOT):40s} {info["name"]:16s} {info["secs"]:6.1f} s  {os.path.getsize(mp3) / 1024:7.1f} KB')
        await b.close()
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    asyncio.run(main())
