# Brinebound in Unity

Brinebound is a web game: JavaScript and three.js in one HTML file. Unity runs C#, so it can't open, import or convert this code. There are two ways to get the game into Unity:

- **Route A: run Brinebound inside a Unity app (an hour or so).** A Unity scene shows the game full screen in the phone's own web view. Everything works as it does in a browser: saves, music, touch controls. You keep building the game as a web game, with Claude or another AI, and drop each new build into Unity. Use this to ship Brinebound as an Android or iPhone app through Unity, or to wrap it in Unity menus and scenes.
- **Route B: rebuild Brinebound in Unity (a big project).** Port it system by system into C# with an AI's help. The kit gives you a head start: the soundtrack as audio files, and the full source and design for the AI to port from.

## What's in the Unity kit (`brinebound-<version>-unity-kit.zip`)

| File | What it is |
| --- | --- |
| `Assets/StreamingAssets/brinebound.html` | The whole game in one file, with three.js built in so it runs with no internet. |
| `Assets/Scripts/BrineboundWebView.cs` | Opens that file full screen in a web view. |
| `Assets/Audio/*.mp3` | The five soundtrack tunes (title, sailing, port, night, battle), for a native Unity version. |
| `UNITY.md` | This guide. |

## Route A, step by step

1. **Install the tools.** Install Unity Hub, then the latest Unity 6 LTS from the Hub's Installs tab. Tick the **Android Build Support** module (with OpenJDK and the Android SDK and NDK), and **iOS Build Support** if you have a Mac. Also install **Git** (git-scm.com), which Unity's Package Manager needs to fetch the web view plugin. On Windows, let the Git installer add it to your PATH, then restart Unity Hub.
2. **Create a project.** In Unity Hub, click New project, pick the **Universal 3D** template, name it Brinebound, and click Create.
3. **Add the web view plugin.** In Unity, open Window > Package Manager, click **+** (top left), choose **Install package from git URL** (in older versions, "Add package from git URL"), paste the URL below, and click Install. It's the free unity-webview plugin (zlib licence), and it runs on Android, iOS and macOS.

   ```
   https://github.com/gree/unity-webview.git?path=/dist/package
   ```

4. **Copy in the kit.** Unzip the Unity kit. Drag its `StreamingAssets`, `Scripts` and `Audio` folders into the Project window's `Assets` folder. Keep the name `StreamingAssets` exactly: Unity copies that folder into the app as it is.
5. **Add the script to the scene.** In the open scene (`SampleScene`), choose GameObject > Create Empty, rename it `Brinebound`, and click **Add Component** in the Inspector. Search for **Brinebound Web View** and add it. Save the scene with Ctrl+S (Cmd+S on a Mac).
6. **Set up the phone build.** Open File > Build Profiles (File > Build Settings in older versions). Choose **Android** and click **Switch Platform**. In Player Settings, set Company Name and Product Name. Under Resolution and Presentation, leave only the landscape orientations ticked.
7. **Run it on your phone.** On an Android phone, turn on Developer options and USB debugging, plug the phone in, and click **Build And Run**. The game opens on the title screen. For an iPhone, you need a Mac with Xcode: switch the platform to iOS, click Build, open the Xcode project it makes, choose your iPhone and your Apple ID team, and press Run.
8. **Update it later.** When there's a new Brinebound version, replace `Assets/StreamingAssets/brinebound.html` with the new kit's file and build again. Saves stay on the phone between updates.

Good to know:

- **The Windows editor can't show the game.** The plugin has no Windows support, so Play mode stays blank there; test on a phone. On a Mac, Play mode shows the game in the editor.
- **Saves live inside the app.** They are separate from your browser saves. To move a voyage between them, use Menu > Save > Download save file (or copy the save text), then Load > Paste save text in the app.
- **Paid alternative.** If you need the game inside the Windows editor, or drawn on a 3D surface in a Unity scene, look at Vuplex 3D WebView on the Unity Asset Store (paid).
- **A Unity WebGL build won't help.** WebGL builds turn Unity games into web pages, which is the opposite direction.

## Route B: a native Unity version

This is a rewrite, not an import. There are about 14,700 lines of JavaScript, so expect weeks of work even with an AI doing most of the typing. Port one system at a time, and keep the web version as the reference to compare against. To start each step, give the AI `HANDOFF.md` plus the JavaScript file named in the step, and ask for a C# port of just that system for Unity 6 with URP.

1. **Blocks and items.** Port `config.js`: block and item tables become C# classes or ScriptableObjects, with the same IDs, names and recipes.
2. **The world.** Port `noise.js` and the generation parts of `world.js`. Keep the same seed and maths, so the same 23 islands come out. Check it by comparing a few column heights against the web version (`__brinebound.world.get(x, y, z)` in the browser console).
3. **Terrain meshes.** Port `surface.js` (smooth Surface Nets meshing) to C#. Unity's Jobs and Burst make it fast. Build meshes per 16 x 16 chunk, as the web version does.
4. **The player.** Use a CharacterController with the speeds and sizes from `player.js` (walk 4.5 and sprint 6.3 blocks a second; the body is 0.6 wide and 1.75 tall; a block is 1 m). Then add crouching, sliding, climbing and swimming.
5. **Sea and sky.** Port the wave function in `water.js` so ships float the same, and remake the shader in Shader Graph. `sky.js` has the day and night colours.
6. **Ships.** Port the sailing model and deck layout in `ship.js`, then `fleet.js` (other ships) and `crews.js` (their sailors). The deck plan there is drawn for a ship of size 1 and every ship is built at `SCALE` (2), about 24 m long; the hull's collision circles (`HULL_CIRCLES`) map well onto a few capsule or sphere colliders.
7. **Everything else.** Port in this order: combat (`guns.js`, `enemies.js`, `kraken.js`), building (`build.js`, `pieces.js`), wildlife (`fauna.js`), the story (`quests.js`) and the UI (`ui.js`, `sheets.js`, remade in UI Toolkit).
8. **Sound.** Use the kit's MP3s as AudioClips and follow the rules in `musicMood()` in `game.js`: battle when a fight is near, else night after dark, else sea while sailing, else port.
9. **Saves.** Write the same save JSON to `Application.persistentDataPath`, so old saves can be read.
