# Phone camera capture

The iPhone companion uses ARKit world tracking to send camera position and orientation to the Windows editor. The editor displays a live virtual camera and returns a 480×270 JPEG shot monitor to the phone at up to six frames per second. Phone camera images are never transmitted. The shot monitor shows the virtual scene, not an AR overlay on the room.

## Setup

1. Stop the ordinary development server and run `npm run dev:phone` on Windows. Open `http://127.0.0.1:5173`. The editor and application API stay on loopback; a separate tracking-only listener binds to port 3003 on the local network. `PHONE_PORT` can change that port.
2. On a Mac, open `ios/CompositionCamera.xcodeproj` in Xcode. Select the app target, choose your signing team and a unique bundle identifier, and build and run on a compatible physical iPhone with iOS 17 or later. Enable Developer Mode if Xcode requests it. The simulator cannot validate world tracking.
3. Put the iPhone and Windows computer on the same trusted Wi-Fi network. Allow the Node.js tracking listener on private networks in Windows Firewall if prompted. Do not expose this port to the internet. Networks with client isolation may block the connection.
4. In the editor, open **Phone camera → Pair iPhone**. Enter a listed `address:port` and the eight-digit pairing code in the companion. If several adapters are listed, use the Wi-Fi/LAN address reachable from the phone. Allow Camera and Local Network access on the iPhone.
5. Frame a starting shot in the editor and put the playhead where the take should start. Hold the phone in landscape and choose **Set starting pose**. This maps the phone's current pose onto the saved scene camera without moving the subject. Translation is metric: one physical meter equals one scene meter.
6. Move the phone to compose, then choose **Record move** on the phone or **Record camera move** in the editor. **Stop & save** writes an editable camera animation block. Open **Animate** to replay, retime, split, cache, or edit its keys. Guide export uses that recorded camera motion.

The Mac is needed to build/sign/install the companion and updates. Once installed, the capture connection runs directly between the phone and Windows.

## Recording behavior

- Live framing is temporary. It does not rewrite saved keys or create undo entries for every packet. Setting up the scene camera is separate from saving a take.
- A take starts at the playhead and ends at the next camera block or the scene's existing end (2–10 seconds). Recording inside an existing camera block is refused. Move or delete that block, or choose an empty interval, first.
- Positions and quaternion orientations are resampled to 30 fps, then converted to continuous Euler keys compatible with the editor. The resulting block is one undoable project edit. Existing object motion and camera blocks are preserved.
- Limited tracking, a packet gap above 350 ms, no new data for 500 ms, disconnecting, or hiding the editor stops capture and saves the usable portion. Less than one frame cannot form a take. Re-align after tracking returns; tracking reset is not silently joined into an old recording.
- The editor stays visible during recording. Controls that could alter the scene are unavailable during phone control; **Return to editing** releases them. Closing the phone panel disconnects it.
- Pairing expires after ten minutes unused, or one hour after a sender connects. Pairing again revokes the previous sender and editor stream. There is one sender per session, bounded messages, and connection-rate limiting. The current prototype uses unencrypted local WebSockets and is intended for trusted LANs.

## Transport

`POST /api/phone/session` creates a session from the loopback application API. The native sender connects to `ws://<computer>:3003/phone?code=<code>`. The browser receives session events through same-origin SSE at `/api/phone/<id>/events`. Local preview and status endpoints relay only JPEG bytes and alignment/recording flags back to the phone. `DELETE /api/phone/<id>` disconnects the session.

```json
{"type":"pose","version":1,"seq":42,"time":12.4,"tracking":"normal","position":[0,1.2,2],"quaternion":[0,0,0,1]}
```

Time is the ARFrame monotonic timestamp in seconds; sequence and time must increase within a connection. Positions are in meters. Coordinates are right-handed, Y-up, camera forward is -Z, and quaternion order is x/y/z/w. The companion sends the inverse of `ARCamera.viewMatrix(for: .landscapeRight)`; its interface is locked to that orientation. Pose sending is limited to 30 Hz and one in-flight pose send. Tracking quality is `normal`, `limited`, or `unavailable`.

The native controls send `{"type":"control","action":"align"}`, `record`, or `stop`. The phone receives text connection/state messages and binary JPEG previews. There is no video upload or paid generation request on the tracking listener.

## Verification and remaining device acceptance

Windows tests exercise real WebSocket/SSE transport, alignment math, full-turn recording and retiming, pose validation, code/origin rejection, preview delivery, tracking loss, undo/redo, and saved-project restoration using synthetic phone poses. These do not establish ARKit accuracy or iPhone build success.

The native project has not been compiled or run on a Mac/iPhone in this workspace. On hardware, verify camera/local-network permission prompts, landscape orientation, walking one meter forward/backward, panning and roll, preview latency, interruption/background recovery, and return-to-start drift. Compare the replay with the movement before relying on it in a demonstration.

Apple references: [ARKit world tracking](https://developer.apple.com/documentation/arkit/arworldtrackingconfiguration), [camera transforms](https://developer.apple.com/documentation/arkit/arcamera/transform), [URLSession WebSockets](https://developer.apple.com/documentation/foundation/urlsessionwebsockettask), and [local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).
