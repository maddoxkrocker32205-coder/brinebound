# Brinebound: build and play on Windows and iPhone

## The pick: keep three.js, work in VS Code

Keep three.js, the engine Brinebound is already built on, and edit it in VS Code on your PC. Every change you save shows up on your iPhone in Safari within seconds, and nothing has to be rewritten.

| Engine | Moving Brinebound there | Playing on your iPhone from a Windows PC |
| --- | --- | --- |
| three.js (today) | Nothing: open the folder and carry on | Safari over your Wi-Fi now, a web link anywhere, an icon on your home screen |
| Unity | Rewrite all 14,700 lines in C# | Needs a Mac, or a cloud build service and a paid Apple developer account |
| Godot | Rewrite in GDScript | Needs a Mac with Xcode |
| Unreal | Rewrite in C++ or Blueprints | Needs a Mac with Xcode |

Every AI assistant writes good JavaScript and three.js, and the project carries notes they read on their own (`HANDOFF.md`). An App Store release can come later by wrapping the web game as an app; nothing here closes that door.

## One-time setup on your PC

Install four free programs, keeping each installer's default options, then restart your PC so they can find each other.

1. **VS Code** from https://code.visualstudio.com: the editor you work in.
2. **Node.js**, the LTS version, from https://nodejs.org: runs the build and the live preview.
3. **Git** from https://git-scm.com: keeps every version of your game.
4. **GitHub Desktop** from https://desktop.github.com, plus a free account at https://github.com: backs the project up and puts the game online for your iPhone.

## Load the game into VS Code

Unzip the project, open the folder, install once, then press Ctrl+Shift+B to play.

1. On your PC, download **brinebound-0.6.1-project.zip** from the Claude chat. Right-click it, choose **Extract All**, and extract it to Documents. You get a folder called `brinebound`.
2. In VS Code, choose **File > Open Folder** and pick that `brinebound` folder. If VS Code asks whether you trust the authors, click **Yes**.
3. Choose **Terminal > Run Task > Brinebound: install (first time)**. It downloads the build tools once, in about a minute.
4. Press **Ctrl+Shift+B** (the task **Brinebound: play**). The game opens in your browser at `http://localhost:8080`, and the panel at the bottom shows a QR code for your iPhone.

Leave that panel running while you work. Each time you save a file in `src`, the game rebuilds in under a second and the page reloads straight back into your voyage.

When Claude sends you a newer project zip, extract it over your `brinebound` folder and choose **Replace the files**. If `package.json` changed, run the install task again.

## Play on your iPhone while you work

Your iPhone can play the game straight from your PC over Wi-Fi, and it reloads on its own whenever you save.

1. Connect the iPhone to the same Wi-Fi network as the PC.
2. Point the iPhone's Camera at the QR code in VS Code's terminal panel and tap the link. Or type the "On your iPhone" address into Safari: it looks like `http://192.168.1.23:8080`.
3. The first time, Windows asks whether Node.js may use the network. Tick **Private networks** and click **Allow**.

The iPhone keeps its own saves, separate from your PC's browser. To see errors on the phone, which has no developer tools, add `?debug` to the end of the address.

## Make changes with AI

Start with Claude Code, since you already use Claude. When your usage runs out, switch to Copilot or Codex: all three read the project's notes (`CLAUDE.md`, `.github/copilot-instructions.md`, `AGENTS.md`), which point them to `HANDOFF.md`, the full map of the game.

| Assistant | Install in VS Code | Paid through |
| --- | --- | --- |
| Claude Code | Extensions panel (Ctrl+Shift+X), search "Claude Code" | Your Claude plan |
| GitHub Copilot | Click the Copilot icon at the top of VS Code and sign in with GitHub | A free monthly allowance, then a GitHub plan |
| Codex | Extensions panel, search "Codex" (by OpenAI) | Your ChatGPT plan |

How to ask, so each change lands cleanly:

- Ask for one change at a time, in plain words: "Make the sloop about 20% faster under full sail."
- End each request with: "Bump the version and update the NEW IN line."
- Check it on the PC and the iPhone before asking for the next change. If a red error box appears, copy its text into the chat.

Where things live, if you want to look yourself:

| You want to change | File in `src` |
| --- | --- |
| Items, blocks, recipes, prices | `config.js`, `shop.js` |
| Islands and the world | `world.js` |
| Ships and sailing | `ship.js`, `fleet.js`, `crews.js` |
| Walking, jumping, swimming | `player.js` |
| Guns, enemies, the kraken | `guns.js`, `enemies.js`, `kraken.js` |
| Story and quests | `quests.js` |
| Menus and the HUD | `sheets.js`, `ui.js`, `template.html` |
| Music and sound | `music.js`, `audio.js` |

## Put it on your iPhone for good

Publish the game to a free GitHub Pages site, then add it to your home screen, where it opens full screen with its own icon.

1. Open GitHub Desktop and sign in. Choose **File > Add local repository** and pick your `brinebound` folder. It says the folder isn't a repository yet: click **create a repository**, then **Create repository**.
2. Click **Publish repository**. Untick **Keep this code private**, because free GitHub Pages needs a public repository, then click **Publish repository**.
3. On github.com, open the repository and go to **Settings > Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick the branch **main** and the folder **/docs**, and click **Save**.
4. After a minute or two, the game is at `https://YOUR-NAME.github.io/brinebound/`, with your GitHub user name. Open it in Safari on your iPhone, tap **Share**, then **Add to Home Screen**.

The project already holds a published copy of 0.6.1 in `docs/`, so your first push puts the game online.

## Your everyday loop

1. Open VS Code, which reopens your `brinebound` folder, and press **Ctrl+Shift+B**.
2. Ask your AI for one change, or edit a file yourself, and save.
3. Try it on the PC and the iPhone; both reload by themselves.
4. When you're happy, run **Terminal > Run Task > Brinebound: publish to docs/ (for your iPhone)**.
5. In GitHub Desktop, type a summary such as "Faster sloop", click **Commit to main**, then **Push origin**. The game on your home screen updates within a couple of minutes.

GitHub Desktop keeps every earlier version. If a change goes wrong, right-click it in the **History** tab and choose **Revert changes in commit**.

## When something goes wrong

| What you see | What to do |
| --- | --- |
| A red box saying "Build failed" | The game keeps running the last build that worked. The box names the file and line: undo your last edit (Ctrl+Z) and save, or paste the box into your AI. |
| A red box saying "Error" during play | Copy its text to your AI. On the iPhone, add `?debug` to the address for a full console. |
| "Running scripts is disabled on this system" in a terminal | Use **Terminal > Run Task** instead of typing commands, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once in PowerShell and answer Y. |
| The iPhone can't open the address | Check both are on the same Wi-Fi. In Windows Settings > Network & internet > Wi-Fi, set your network to **Private**, and allow Node.js through Windows Firewall. |
| A blank page | The game loads three.js from the internet. With no connection, use `dist/brinebound-offline.html` (run **Brinebound: build both files** first). |
| A voyage on one device but not the other | Each browser keeps its own saves. On one, use **Menu > Save > Download save file**; on the other, **Load > Load a save file**. |
| No Continue voyage after updating to 0.6 | 0.6 has a new world, ten times the area, so voyages from earlier versions can't continue in it. Start a new voyage. |
| The HUD covers the game on the iPhone | Update to 0.6.1 or later, which has a compact phone HUD. Turn the phone sideways for the widest view, and play from the home-screen icon, which has no Safari bars. |
| A "Sign in to see this artifact's data" strip at the bottom of the Claude link | The strip is claude.ai's, not the game's: it shows when Safari isn't signed in to claude.ai. Sign in at claude.ai in Safari, or open the link in the Claude app, and it goes away and cloud saves work. The home-screen copy from GitHub Pages never shows it. |
