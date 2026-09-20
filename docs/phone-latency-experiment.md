# Phone camera latency experiment

This experiment compares the existing 480×270 JPEG preview (about 6 fps) with a 960×540 WebRTC view targeting 60 or 30 fps. The phone sends the same ARKit poses at up to 30 Hz in both modes. The desktop renders the scene once and copies the shot rectangle for transmission. This isolates the preview transport rather than changing motion sampling between runs.

## Run on a physical iPhone

1. On the Mac, run `npm run dev:phone` and open `http://127.0.0.1:5173/#editor` in Chrome or Edge. Keep this tab visible. Use the same trusted Wi-Fi as the phone.
2. Open `ios/CompositionCamera.xcodeproj`, select your signing team and physical iPhone, then build/run. Approve Camera and Local Network access. ARKit uses camera frames locally; only poses leave the phone.
3. Open **Phone camera → Pair iPhone** in Composition. Enter the Mac address and code in the app. Frame the starting shot and press **Set starting pose**.
4. Move forward/backward, sideways, pan, tilt, and roll. Watch the Mac's response separately from the phone's returned view. Movement sensitivity defaults to 5×; set it to 1× for a metric baseline and keep the same sensitivity between comparison runs. Rotation is unchanged.
5. Enable **three-dot menu → Debug information** on both the phone and the Mac's phone panel. Leave **JPEG baseline** selected. Press **Run 20 latency pulses** in the phone viewfinder. Keep both apps visible and avoid switching modes during the run. On completion choose **Export latency results** on the Mac. Hiding phone debug cancels a running test and clears its marker.
6. Select **WebRTC** on the Mac. Wait for the received frame rate to stabilize. Run and export another 20 pulses at 60 fps, then repeat at 30 fps. Exports contain every successful sample, timeout count, nearest-rank median/p95, capture rate/copy time, receiver stats, and browser details.
7. Record a short camera take, stop/save, and verify replay. Try tracking interruption, backgrounding, disconnect, and fresh pairing. Repeat with the same scene and orientation for useful comparisons.

The receiver page is fetched through a pairing-code-protected `/receiver` endpoint and loaded in a native `WKWebView`. Its SDP/ICE signaling passes through the native socket; it never opens a browser WebSocket to the LAN listener. There is no microphone, camera upload, paid API access, external script, or WebRTC server dependency. Video uses direct host ICE candidates. The Mac's API and editor remain on loopback.

## What the numbers mean

- **Desktop receive → render** uses one desktop clock, measuring the time from a newly received pose to the first completed viewport render applying it. It excludes ARKit sampling, phone-to-Mac transit, and monitor scanout. Superseded poses are not counted as separately rendered poses.
- **Canvas copy** measures synchronous `drawImage` and marker drawing. It is not the whole GPU/encoder cost. Compare overall desktop responsiveness with the phone disconnected, JPEG, and WebRTC enabled.
- **Pulse median / p95** measures a phone-side control message through the native bridge, relay, desktop render/capture, video transport, and returned-pixel detection on the same phone clock. A 16-bit high-contrast marker in the image prevents an earlier frame or signaling acknowledgment from completing a pulse.
- WebRTC detection runs in `requestVideoFrameCallback`; JPEG detection runs after image decode. These are **software control-to-decoded-frame estimates**, not measured photons. JPEG and video have different presentation paths. Neither number includes physical motion sensing or guarantees the frame has reached the display. There is no cross-device timestamp subtraction.
- **RTC RTT** is a WebRTC transport statistic, not video latency. Missing statistics show `—`, not zero. **Dropped** is cumulative receiver-reported dropped frames where available; it excludes frames never captured or sent. The active candidate pair describes the chosen route without claiming that an IP address proves USB transport.
- A pulse times out after two seconds. Report timeouts with percentiles; a run with missing samples is not a passing latency result.

For physical motion-to-screen measurement, use a separate high-frame-rate camera to film the moving phone and the Mac display together. Count frames between a repeatable rotation onset and the corresponding virtual-camera response, and repeat with the phone's screen visible. Record the filming rate and frame-count uncertainty. Do not label pulse results as motion-to-photon latency.

## Targets, not promises

The Wi-Fi trial targets at least 50 received fps in 60 fps mode, pulse median below 100 ms and p95 below 150 ms, and desktop receive-to-render below 30 ms. These are experiment criteria, not measured results. Sustained receiver rates below 40 fps for eight seconds before testing automatically restart WebRTC at 30 fps. A pulse run freezes that decision so its samples remain comparable. The selected target and actual delivered rate are both visible.

There is no application video-frame queue. Canvas frames are requested immediately after rendering; WebRTC still has its own encoder, transport, and jitter buffers, which the app cannot eliminate. No cloud STUN/TURN is used, so isolated Wi-Fi clients, VPNs, firewalls, or unsupported host candidates can prevent video even if the control socket works. **Retry preview** makes a fresh peer connection; JPEG remains available for comparison. Backgrounding the phone ends the session and requires reconnection.

After the Wi-Fi run, USB Personal Hotspot can be tested using the Mac's USB-interface address. Verify the selected route and repeat with Wi-Fi disabled. Merely attaching an Xcode cable does not prove application traffic is wired. No USB-specific routing is claimed by this experiment.

## Verification and results

`npm test`, `npm run build`, and `npm run test:browser -- tests/browser/phone-camera.spec.ts` exercise validation, real signaling, JPEG/WebRTC pixel delivery, 20-pulse detection, recording, preview switching, and cleanup. The browser test substitutes a browser receiver for the native WebKit bridge; it is a transport/integration test, not a physical iPhone benchmark. On macOS browser tests default to installed Chrome; `PLAYWRIGHT_CHANNEL` overrides that choice.

Workspace verification after the light-controls update: 95 unit/server tests passed, the web build passed, and all seven phone browser tests passed in the focused run. These include sensitivity, pause/resume, recording-time exclusion, and hidden-by-default debug controls. The earlier full browser run had 49 passes and five failures: four existing output/AI expectation mismatches and a phone-test timeout that did not recur in the focused run. The full suite was not rerun for this update and is not claimed green; these results do not establish physical-device latency.

Compile the native companion without signing:

```sh
xcodebuild -project ios/CompositionCamera.xcodeproj -scheme CompositionCamera -configuration Debug -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

On 2026-09-19, the companion compiled and signed with Xcode 26.4 and was installed on the paired iPhone 17 Pro Max. After resolving the initial developer-trust prompt, the user reported successful connection and rotation, then changing XYZ values with translation too subtle to interpret. The light-controls update adds 1×–10× movement sensitivity with a 5× default and puts position readouts behind Debug; see [translation diagnosis](phone-camera.md#diagnosing-rotation-without-translation). The updated native build passes. Physical movement acceptance and device latency results remain **pending**; no hardware timing result has been established.

Do not use headless browser timings as device results. Keep both exported JSON files with notes for scene, device, connection, frame-rate target, thermal state, and subjective movement/recording behavior before deciding on the production receiver or splitting repositories.
