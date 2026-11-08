// Brinebound inside a Unity app: shows the game (Assets/StreamingAssets/brinebound.html, the offline build with
// three.js built in) full screen in the phone's own web view. Saves, music and touch controls work as in a browser.
//
// Needs the free unity-webview plugin (zlib licence): Window > Package Manager > + > Install package from git URL:
//   https://github.com/gree/unity-webview.git?path=/dist/package
// It runs on Android, iOS and macOS. The Windows editor can't show web views, so on Windows test on a phone.
//
// Use: put this component on any GameObject in your first scene, then build to your phone.
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.Networking;

public class BrineboundWebView : MonoBehaviour
{
    [Tooltip("The game file inside Assets/StreamingAssets")]
    public string fileName = "brinebound.html";

    [Tooltip("Keep the phone in landscape, which suits the game's touch controls")]
    public bool landscapeOnly = true;

    WebViewObject webView;

    IEnumerator Start()
    {
        Screen.sleepTimeout = SleepTimeout.NeverSleep;   // a long voyage shouldn't dim the screen
        if (landscapeOnly)
        {
            Screen.autorotateToPortrait = false;
            Screen.autorotateToPortraitUpsideDown = false;
            Screen.autorotateToLandscapeLeft = true;
            Screen.autorotateToLandscapeRight = true;
            Screen.orientation = ScreenOrientation.AutoRotation;
        }
#if UNITY_EDITOR_WIN || UNITY_STANDALONE_WIN
        Debug.LogWarning("Brinebound: unity-webview can't show web pages on Windows. Build to an Android or iOS phone (or use a Mac) to play.");
#endif

        webView = new GameObject("Brinebound web view").AddComponent<WebViewObject>();
        webView.Init(
            cb: (msg) => Debug.Log("Brinebound: " + msg),
            err: (msg) => Debug.LogError("Brinebound web view error: " + msg),
            ld: (msg) => Debug.Log("Brinebound loaded " + msg),
            enableWKWebView: true);   // iOS: the modern web view, which has WebGL 2
        webView.SetMargins(0, 0, 0, 0);
        webView.SetVisibility(true);

        // StreamingAssets sits inside the app package; copy the game out to a normal file the web view can open
        string src = Path.Combine(Application.streamingAssetsPath, fileName);
        string dst = Path.Combine(Application.temporaryCachePath, fileName);   // as the plugin's own sample does
        byte[] data;
        if (src.Contains("://"))   // Android: StreamingAssets is inside the APK, so read it with a web request
        {
            using (var req = UnityWebRequest.Get(src))
            {
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogError("Brinebound: could not read " + src + ": " + req.error);
                    yield break;
                }
                data = req.downloadHandler.data;
            }
        }
        else
        {
            if (!File.Exists(src))
            {
                Debug.LogError("Brinebound: put brinebound.html in Assets/StreamingAssets (looked for " + src + ")");
                yield break;
            }
            data = File.ReadAllBytes(src);
        }
        File.WriteAllBytes(dst, data);
        webView.LoadURL("file://" + dst.Replace(" ", "%20"));
    }

    void OnDestroy()
    {
        if (webView != null) Destroy(webView.gameObject);
    }
}
