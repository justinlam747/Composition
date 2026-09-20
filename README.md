# composition

A browser composition editor with one humanoid, multiple box props, independent animation tracks, optional Gemini suggestions, and Seedance video generation through fal. Manual editing works without API credentials. The white interface uses Manrope.

## Run on Windows

Use Node.js 22 or newer:

```powershell
npm install
npm run dev
```

Open http://127.0.0.1:5173 in Chrome or Edge. This runs Vite and the Express API on port 3001. The server binds to loopback and stores files in `data/studio/`. FFmpeg is installed by `ffmpeg-static`; no separate encoder installation is needed on supported platforms.

For live AI, copy `.env.example` to `.env`, fill in `GEMINI_API_KEY` and `FAL_KEY`, then restart. These variables are server-only; never prefix credentials with `VITE_`. Models and the Seedance endpoint are configurable. Access and quota depend on your provider accounts.

```powershell
Copy-Item .env.example .env
# Edit .env locally, then restart npm run dev.
```

`npm run build` checks TypeScript and builds the browser app. `npm start` serves that build and the API on port 3001. This is a single-user local server; public hosting requires authentication and a suitable `APP_ORIGIN`.

## Compose and animate

1. Start with the static mannequin. Use the **Objects**, **Scene**, and **Animate** icons at the top left. Open **Objects** to add boxes or select an object. Maximum: 32 objects and one humanoid.
2. Click an object or body part to open its floating controls. **Move**, **Rotate**, and **Scale** write keys on that object's track at the current time. Joint controls write local rotation keys. New objects have no motion tracks.
3. Open **Object details** to change a name or dimensions, add reference images, save an object to the library, or delete it. Saved objects retain references and size at the playhead and respawn static.
4. Open **Animate**. The timeline overlays the composition without resizing the scene. Drag the timeline's top divider to make it smaller or larger; its down-chevron minimizes it to a playback strip, and the up-chevron restores it. The focused divider also supports Up/Down arrows and Home/End. Its object selector chooses whose position, rotation, scale, and selected joint tracks appear. Drag keys to retime or delete selected keys. Press Space to play.
5. Use Undo / Redo for edits, AI applications, deletion, and retiming. Ctrl+Z / Ctrl+Shift+Z also work. Delete removes a selected key first, otherwise the selected object when no input is focused.
6. **Save project** writes a server project referencing its media. **Open saved project** restores it. **Save scene / Open scene** export and import JSON. The current scene also autosaves in the browser, including on page exit.

Dimensions use meters, Y points up, and object pivots are at their bottom centers. Scale multiplies base dimensions. Editing dimensions changes geometry throughout the timeline. Clearing motion returns objects to their base transforms.

## Animation blocks and the saved AI Spider-Man demo

Open the **Animations folder at the top right → Load Spider-Man demo** to load three saved AI blocks: **Drop to floor**, **Shoot web**, and **Swing and land**. The library opens beside the canvas (as a bottom sheet on mobile) and reveals the timeline. Their body motion was generated through `fal-ai/hunyuan-motion`, retargeted onto the mannequin, and baked to editable keys. The flight path, web effect, ground contact, and short pose transitions are editor-authored adjustments. The mannequin uses a simple red-and-blue appearance. These saved results replay locally without another generation request; loading the demo does not call AI.

- Drag a saved animation card onto the matching object track, or tap its **+** button to append it.
- Drag a block to move it. Drag either edge to make the same motion play faster or slower; this stretches playback rather than trimming the source. Blocks on the same object cannot overlap. Gaps hold the preceding block's end pose.
- Move the playhead inside a selected block and choose **Split**. The two pieces preserve the original motion, including easing and rotation paths.
- Double-click a block, or choose **Edit keyframes**, to see its internal keys. **All blocks** returns to the scene timeline.
- Choose **Value graph** in the timeline mode menu to plot a property's actual value against time. Pick Position, Rotation or Scale and an X/Y/Z axis. Select a key to reveal yellow horizontal Bézier handles, then drag the final key's incoming handle left to lengthen its slowdown into a flat stop. Drag keys to edit time/value, or enter exact values below; arrows adjust keys and handle influence. Outlined handles are available but not yet applied. **Reset value handles** restores that axis's original interpolation. No presets; the curve controls real playback and is saved with the scene and cached animations.
- Choose **Velocity** in the same menu for a single velocity lane. **Add key** (or K) creates an independent speed key at the playhead. Drag it horizontally to retime and vertically to change speed, or select it to enter exact **Time** and **Speed** values. Delete and undo work like ordinary keys. Speeds are relative weights, blended linearly, that redistribute the whole object's or block's motion within its existing duration. Zero-speed sections pause motion; all-zero keys hold the starting pose. Choose **Keyframes** to return to the ordinary lanes.
- **Cache selected animation** saves an independent copy in this browser. **Export animation library** and **Import animation library** provide a portable backup. Scene saves include each block's full animation source, so playback does not depend on a separate cache.
- Accepted AI movement suggestions are cached and added as blocks. Live generation still needs the configured provider; cached playback does not.

Portable files are [the scene](public/demos/spider-man.scene.json), [the animation library](public/demos/spider-man.animations.json), [the generation provenance](public/demos/spider-man.provenance.json), and [a rendered guide MP4](public/demos/spider-man-guide.mp4). Use **Open scene** for the scene JSON or the library import button for the animation JSON. With `FAL_KEY` in `.env`, `npx tsx scripts/generate-spider-motion.ts` generates and caches the three original FBX files in `data/spider-man-hunyuan`; reruns resume saved requests and reuse completed results. `npx tsx scripts/retarget-spider-motion.ts` prepares candidate JSON for review; add `--publish` after reviewing to replace the bundled demo. Export a fresh guide in the app after changing motion. The demo takes nine seconds with a final one-second hold inside the ten-second scene limit. The old `scripts/export-spider-demo.ts` produces the authored fallback samples and should not be used to publish the AI demo.

## Camera and AR

**Phone camera** connects an ARKit iPhone companion to the Windows editor for live position/orientation control, a returned virtual-shot preview, and editable recorded camera blocks. Run `npm run dev:phone`, then open the phone icon to pair. The companion Xcode project is in `ios/CompositionCamera.xcodeproj`; building/installing it requires a Mac. See [setup, controls and device acceptance](docs/phone-camera.md). The desktop transport is tested with synthetic poses; the native app still needs an Xcode build and physical iPhone testing.

**Camera view** adds a scene camera and looks through its fixed 16:9 frame. Drag in the frame to aim, use WASD to move, and Q/E to move down/up (Shift moves faster). These edits save position and rotation keys at the current playhead; choose another time in **Animate** to build a camera move. **Key camera** keys both channels. Drag timeline keys to retime the move, or use the **Velocity** lane to adjust its speed. No lens settings are needed.

The camera also appears in **Objects**. Select it to use Move/Rotate handles or numeric values, or choose **Set camera from this view** to align it to the editor view. **Orbit** navigates the editor without changing the saved camera. Camera poses and keys survive autosave, project save, JSON export/import, and undo/redo. When a scene camera exists, guide export renders through it and replays its keys regardless of the current editor view. Older scenes without a camera retain export from the current view.

Open **AR** beside Orbit and Handheld. **Start camera** overlays the current 3D scene on a live local video feed; drag to orbit and scroll to frame the objects. Choose another camera or enable **Mirror camera** in the controls. This mode does not track the room: moving the webcam does not keep objects fixed to real surfaces. Handheld remains a virtual camera controlled by mouse and keyboard.

**Place in room** uses WebXR on compatible AR hardware. The session requires surface hit testing and DOM overlay controls. Aim at a floor or table until the placement ring appears, then tap or choose **Place here**. The whole scene is placed in meters, preserving object offsets and animation keys. Use **Play animation**, **Place again**, or **Exit AR**. Placement is temporary and is not saved in scene JSON. Depth occlusion, persistent anchors, and camera recording are not implemented.

Camera access needs HTTPS or a loopback address. A phone needs the app served from a trusted HTTPS origin or a USB localhost forwarding setup; opening a PC's plain HTTP LAN address is insufficient. The default development server remains local to this computer. Runtime capability detection controls availability; a desktop webcam alone does not provide room tracking. See [WebXR hit testing](https://immersive-web.github.io/hit-test/) and [camera secure-context requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

The feature requests video only. Camera frames remain in the browser and never enter guide export or AI requests. Stop camera / AR before exporting a guide. Stop, switching to Orbit, Handheld or Camera view, leaving the page, and hiding an ordinary camera tab release the webcam. Closing the AR controls leaves a visible stop-camera badge.

The real Microsoft LifeCam overlay was checked locally. Automated tests cover camera cancellation/errors/cleanup, desktop/mobile controls, room placement transforms, and session failure recovery. Physical room tracking, walking around objects, and orientation changes during a real AR session still require acceptance on compatible hardware.

Three.js is pinned to 0.183.2 with a small `patch-package` patch for sessions ended during asynchronous XR initialization. `npm install` applies it automatically; do not skip install scripts. The patch covers the ESM/CommonJS runtime and source modules. Before upgrading Three, run the actual WebXRManager interruption regressions in `tests/ar.test.ts` and check whether upstream has incorporated the fix.

## Optional AI

Open the sparkle button. The panel sits beside the canvas on desktop and opens as a bottom sheet on mobile.

- **Object:** request a reference image and dimensions. Preview the box proxy, edit values, then **Spawn**, or **Save object** for later. A humanoid concept uses the existing rig; no new rig or mesh is generated.
- **Composition:** suggest placement for existing objects. Placement shifts their existing animation paths with them.
- **Movement:** suggest editable paths and simple humanoid gestures. Listed tracks replace only those tracks; other objects and channels retain their keys.

Suggestions have an editable JSON view and **Preview in scene**. Preview never enters saved scene state. Apply is enabled after validation and creates one undoable change. Unknown IDs, unsupported tracks, invalid dimensions/times, duplicates, and stale proposals are rejected before mutation.

**Demo mode** in the scene menu loads prepared idle keys. The AI panel separately offers **Demo · prepared samples**, using fixed local suggestions regardless of prompt. Applying these marks the scene as Demo. Turning Demo off keeps its objects and keys. Live failures never return demo content. No prepared Seedance output is bundled.

## Guide and output video

1. Frame and optionally animate the scene camera, then click the visible **Output** button. This opens a separate output page; **Back to editor** restores the scene and framing. Scenes without a camera use the current Orbit or Handheld view.
2. **Preview composition:** choose **Create preview** to record the animation through the scene camera, replaying its keys, with editor helpers removed. Keep the tab visible. The server converts the recording to an H.264 MP4. Play the preview, check **I've reviewed this composition**, then continue. You can download this composition MP4 without calling fal. After editing the scene, create a new preview.
3. **Direction:** enter instructions and review the optional appearance references. Generate images with **Gemini** here, download them, and check **Use for video** to send selected images to Seedance. Images are generated from their own text prompt; the scene is not modified. Each project stores up to 24 generated images, and video requests accept nine unique references including object references. Instructions and images remain saved when you return to editing or reload. Image requests use saved IDs, so checking status or recovering a lost response does not submit another paid request.
4. **Generate & download:** review the settings, resolve any listed prerequisites, and choose **Generate with Seedance**. This uploads the guide and references to fal and starts a paid request using your account. Demo mode can be turned off here without changing the animation.
5. The output page shows preparation, queue, generation, completion, and failures. You can return to editing and reopen Output to resume checking a saved request. Success provides playback and **Download video**. Output bytes are saved locally, so projects do not depend on expiring provider URLs.

Defaults: five seconds, 720p, 16:9, generated audio off. The guide preserves viewport framing inside a 1280×720 frame with margins as needed. Editing timelines remain 2–10 seconds; Seedance output requires a whole duration of 4–10 seconds. Up to nine unique reference images are submitted. Limits: 50 MB guides, 30 MB per reference, 100 MB outputs.

Job IDs are saved in the browser and server project before submission; repeating the same ID/input does not create another paid request. Reloading, undoing edits, or switching projects preserves access to the request. Queued jobs resume status checks after server restart. Interruption before a provider request ID was saved is reported explicitly; ambiguous paid requests are never automatically resubmitted. Recorded phone camera blocks use the same guide-export path as manually authored camera keys.

## Shared structure

`src/core/project.ts` defines Project v2; `src/core/proposals.ts` defines pure validation/application; `src/core/api.ts` defines HTTP contracts. `server/` owns files, providers, and jobs. Saved JSON contains no renderer instances. Math helpers use Three.js quaternions; Swift can implement the same sampling rules.

Legacy v1 JSON and the `take-one-scene-v1` local-storage key are supported. Migration adds humanoid ownership to tracks while retaining key values, easing, IDs, and complete rotation paths. Previously removed v1 humanoids stay hidden with their tracks intact until added again.

See [docs/api.md](docs/api.md) for contracts and live acceptance steps. JSON exports reference asset IDs rather than embedding media. Back up the whole `data/studio` folder with your projects.

The bundled [Quaternius Universal Animation Library humanoid](https://quaternius.com/packs/universalanimationlibrary.html) is CC0; source/license details are in `public/models/`. Its 17 controls and rest-pose adapter retain legacy compatibility. New rig generation and automatic collision avoidance are excluded. The Swift companion is limited to camera tracking and a virtual-shot monitor.

## Verification

```powershell
npm test
npm run build
npm run test:browser
```

Tests cover migration/full-turn paths, independent tracks, atomic proposals, file/project/library persistence, real FFmpeg conversion, idempotent jobs, restart recovery, provider request contracts, and failures. Browser tests use installed Edge and isolated servers on ports 5174/3002. Only those test servers inject mocked providers; production has no mock fallback switch.

The browser suite exercises prompt → spawn → animate → actual browser guide export → mocked Seedance → MP4 download, plus save/reopen, undo, key deletion, saved scale, and mobile layout. Paid Gemini/Seedance end-to-end acceptance is **pending**, as requested; no live success is claimed.

Provider contracts checked against [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [Gemini image generation](https://ai.google.dev/gemini-api/docs/generate-content/image-generation), [Seedance reference-to-video](https://fal.ai/models/bytedance/seedance-2.0/reference-to-video/api), and [fal queue APIs](https://fal.ai/docs/documentation/model-apis/inference/queue).

## Project home and saving

The app opens to **Projects**, with a sidebar for all projects, the six most recent projects, and animated scenes. Create a named project, search, or sort by last edit or name. Cards show an actual first-frame preview, duration, object count, and last edit date. Previews use the saved camera when available; otherwise they frame the scene's visible objects. Title-only links in the sidebar quickly open projects; the current browser draft appears first. The three-dot menu on each card opens that project directly in **Output** or deletes it after confirmation. The sidebar becomes a compact icon rail on mobile. Hover lift, preview zoom, and staggered entrances respect reduced-motion preferences.

In the editor, use the **Save current project** icon, **Ctrl+S / Cmd+S**, or **Scene menu ? Save project**. Click **composition** or **Scene menu ? All projects** to save and return home. **Rename project** is in the scene menu. Switching saved projects, creating another project, and importing scene JSON save the current draft before replacing it. A failed save keeps the current project available for retry. Opening a different project starts a fresh undo history.

Projects and media are stored in `data/studio/` on the local server; this is not cloud storage. The browser also keeps a recovery draft. Refreshing `#editor` stays in the editor; opening the app's root URL opens the project home.

## Director: chat, voice, props and motion

The microphone button at the top right opens **Director**. Type a direction, or press **Talk to Director** to start a continuous Gemini Live conversation. You can interrupt spoken replies, minimize the panel while editing, and stop the microphone from the floating voice control. Closing Director, changing project, leaving the editor, or hiding the tab releases the microphone. Typed chat remains available if voice is unavailable or microphone permission is denied.

For “add a desk here,” press **Pick placement point**, click the scene floor, then describe the desk. Gemini receives the scene's objects, selection, playhead and camera context plus a virtual-scene snapshot. Physical camera and phone feeds are not sent. It asks for missing details and summarizes its proposed change. Review **Preview**, **Revise**, **Cancel**, or **Apply**; a clear spoken or typed “yes” also approves the current proposal. Changes are atomic and undoable. Props are built from editable composite geometry: a desk has a top and legs, while its overall position, dimensions and animation remain ordinary editor controls.

Director can create/edit/delete props, set a static camera, create or replace camera/prop animation blocks, retime blocks, and request humanoid performances from **Hunyuan Motion 1B**. Hunyuan starts only after approval and returns editable blocks. Keep editing while it runs. If the scene changed, refresh and approve the updated proposal before applying; already generated motion is retained. Existing unblocked keyframes must be saved as an animation block before adding a director animation to that target. Scene limits remain one humanoid and ten seconds.

Set server-only `GEMINI_API_KEY` and `FAL_KEY` using `.env.example`. `GEMINI_DIRECTOR_MODEL` overrides the structured planner (otherwise `GEMINI_TEXT_MODEL`, default `gemini-2.5-flash`); `GEMINI_LIVE_MODEL` defaults to `gemini-3.8-live`. Model access and quota depend on your account. Restart the server after configuration changes. Voice requires localhost or HTTPS and a browser with microphone and AudioWorklet support; Chrome and Edge are the primary targets.

Conversation history stays in the current browser session. Execution records are persisted separately from the project. Recovery always requires review and never silently replays a scene edit. A cancelled remote generation may finish at the provider, but its result cannot apply automatically.

Director verification includes mocked API/voice/browser tests and live checks of Gemini desk planning, Gemini Live session setup, and a two-second Hunyuan performance retargeted to 19 editor tracks. Full spoken live acceptance still needs a person speaking into a microphone. Tests never use production keys. For concurrent browser runs, override `TEST_WEB_PORT`, `TEST_API_PORT`, and `TEST_PHONE_PORT`; the defaults remain 5174, 3002 and 3004.
