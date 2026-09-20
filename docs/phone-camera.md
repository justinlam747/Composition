# Phone camera capture

The iPhone companion uses ARKit world tracking to send camera position and orientation to the Mac or Windows editor. The editor displays a live virtual camera and returns either the 480×270 JPEG baseline (up to six frames per second) or an experimental 960×540 WebRTC view targeting 60/30 fps. Phone camera images are never transmitted. The shot monitor shows the virtual scene, not an AR overlay on the room. See the [latency experiment](phone-latency-experiment.md) for comparison steps and measurement limits.

## Setup

1. Stop the ordinary development server and run `npm run dev:phone` on Mac or Windows. Open `http://127.0.0.1:5173`. The editor and application API stay on loopback; a separate tracking-only listener binds to port 3003 on the local network. `PHONE_PORT` can change that port.
2. On a Mac, open `ios/CompositionCamera.xcodeproj` in Xcode. Select the app target, choose your signing team and a unique bundle identifier, and build and run on a compatible physical iPhone with iOS 17 or later. Enable Developer Mode if Xcode requests it. The simulator cannot validate world tracking.
3. Put the iPhone and computer on the same trusted Wi-Fi network. Allow the Node.js tracking listener on private networks in Windows Firewall if prompted. Do not expose this port to the internet. Networks with client isolation may block the connection.
4. In the editor, open **Phone camera → Pair iPhone**. Enter a listed `address:port` and the eight-digit pairing code in the companion. If several adapters are listed, use the Wi-Fi/LAN address reachable from the phone. Allow Camera and Local Network access on the iPhone.
5. Frame a starting shot in the editor and put the playhead where the take should start. Hold the phone in landscape and choose **Set starting pose**. This maps the phone's current pose onto the saved scene camera without moving the subject. Use **Movement** on the phone or **Movement sensitivity** in the editor to scale translation from 1× to 10× in 0.5× steps. The default is 5×: 20 cm of phone movement becomes one scene meter. At 1×, physical and scene distances match. Rotation is unchanged.
6. Move the phone to compose, then choose the red **Record** button on the phone or **Record camera move** in the editor. **Pause** holds the virtual camera while you reposition the phone; **Resume** continues from that view without jumping. **Stop & save** writes an editable camera animation block. Open **Animate** to replay, retime, split, cache, or edit its keys. Guide export uses that recorded camera motion.

The Mac is needed to build/sign/install the companion and updates. Once installed, the capture connection runs directly between the phone and the Mac or Windows editor. The companion uses Composition's light palette. Tracking and latency statistics are hidden by default; open the **three-dot menu → Debug information** on the phone or editor to reveal them.

## Recording behavior

- Live framing is temporary. It does not rewrite saved keys or create undo entries for every packet. Setting up the scene camera is separate from saving a take.
- Changing movement sensitivity preserves the current shot. Sensitivity is locked during recording. Pause holds both position and rotation and excludes paused time from the saved take; resume rebases at the held view. Tracking must remain healthy while paused, and the normal interruption rules still apply.
- A take starts at the playhead and ends at the next camera block or the scene's existing end (2–10 seconds). Recording inside an existing camera block is refused. Move or delete that block, or choose an empty interval, first.
- Positions and quaternion orientations are resampled to 30 fps, then converted to continuous Euler keys compatible with the editor. The resulting block is one undoable project edit. Existing object motion and camera blocks are preserved.
- Limited tracking, a packet gap above 350 ms, no new data for 500 ms, disconnecting, or hiding the editor stops capture and saves the usable portion. Less than one frame cannot form a take. Re-align after tracking returns; tracking reset is not silently joined into an old recording.
- The editor stays visible during recording. Controls that could alter the scene are unavailable during phone control; **Return to editing** releases them. Closing the phone panel disconnects it.
- Pairing expires after ten minutes unused, or one hour after a sender connects. Pairing again revokes the previous sender and editor stream. There is one sender per session, bounded messages, and connection-rate limiting. The current prototype uses unencrypted local WebSockets and is intended for trusted LANs.

## Transport

`POST /api/phone/session` creates a session from the loopback application API. The native sender connects to `ws://<computer>:3003/phone?code=<code>`. The browser receives session events through same-origin SSE at `/api/phone/<id>/events`. Local preview and status endpoints relay JPEG bytes and alignment, recording, pause, and movement-sensitivity state back to the phone. `DELETE /api/phone/<id>` disconnects the session.

```json
{"type":"pose","version":1,"seq":42,"time":12.4,"tracking":"normal","position":[0,1.2,2],"quaternion":[0,0,0,1]}
```

Time is the ARFrame monotonic timestamp in seconds; sequence and time must increase within a connection. Positions are in meters. Coordinates are right-handed, Y-up, camera forward is -Z, and quaternion order is x/y/z/w. The companion sends the inverse of `ARCamera.viewMatrix(for: .landscapeRight)`; its interface is locked to that orientation. Pose sending is limited to 30 Hz and one in-flight pose send. Tracking quality is `normal`, `limited`, or `unavailable`.

The native controls send `{"type":"control","action":"align"}`, `record`, `stop`, `pause`, or `resume`. Sensitivity uses `{"type":"settings","translationScale":5}` with a finite value between 1 and 10. State acknowledgments include `aligned`, `recording`, `paused`, and `translationScale`; the last two are optional for older clients. The phone receives text connection/state messages and binary JPEG previews. The updated companion also loads the paired `/receiver?code=<code>` page into WebKit. Version-1 `preview-config`, `signal`, `pulse`, `diagnostics`, and `render-stats` messages drive the experiment. Pulse ID zero clears the test marker; it is not drawn during ordinary framing. Desktop signaling uses `POST /api/phone/:id/signal`; answers and ICE candidates return through the native socket/SSE path. Each preview restart has a UUID stream ID to reject stale signaling. SDP is bounded to 64 KB, candidates to 2 KB, and WebSocket messages to 70 KB; non-signaling phone messages remain bounded to 4 KB. There is no video upload or paid generation request on the tracking listener.

## Verification and remaining device acceptance

### Diagnosing rotation without translation

Recording is not required. Enable **three-dot menu → Debug information** on both devices. The companion shows **AR XYZ** directly from `ARCamera.transform`, **Outgoing XYZ** from the existing landscape-pose packet, and a frame timestamp. These refresh four times per second independently of socket backpressure. The tracking label distinguishes initialization, insufficient features, excessive motion, and relocalization. These readouts do not change the tracking configuration or motion mapping.

On the Mac, **Position tracking** shows the received phone coordinates and mapped virtual-camera coordinates in meters. Mapped coordinates appear after alignment; both clear if poses are stale for over half a second. The scene inspector displays saved keyframes, not the transient phone-controlled camera, so use these live readouts for this test.

Move the phone without turning and compare the values. If AR XYZ stays fixed while the frame time advances, inspect native tracking first. If AR XYZ changes but outgoing/received values do not, investigate pose extraction or delivery. If received and mapped positions change but the movement looks too small, increase **Movement**; use 1× for a metric baseline. Check these stages before treating a tracking hypothesis as a confirmed cause. Scaling changes motion magnitude, not tracking quality or latency.

Automated tests exercise real WebSocket/SSE transport, alignment and scaled-translation math, pause/resume rebasing, paused recording time, full-turn recording and retiming, pose validation, code/origin rejection, preview delivery, tracking loss, undo/redo, and saved-project restoration using synthetic phone poses. These do not establish ARKit accuracy or iPhone build success.

The native project has compiled, signed, and installed on the paired iPhone in this workspace. After trusting the developer profile, the user reported successful connection and rotation, then changing XYZ values with translation too subtle to interpret. The light-controls update adds adjustable movement sensitivity, pause/resume, and opt-in debug information. All 95 unit/server tests, seven focused phone browser tests, and the web/native builds passed for this update. These tests use synthetic motion, not a physical translation benchmark. On hardware, verify forward/backward and sideways movement at 1× and 5×, panning and roll, pause/reposition/resume, preview latency, interruption/background recovery, and return-to-start drift. Compare the replay with the movement before relying on it in a demonstration.

Apple references: [ARKit world tracking](https://developer.apple.com/documentation/arkit/arworldtrackingconfiguration), [camera transforms](https://developer.apple.com/documentation/arkit/arcamera/transform), [URLSession WebSockets](https://developer.apple.com/documentation/foundation/urlsessionwebsockettask), and [local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).
