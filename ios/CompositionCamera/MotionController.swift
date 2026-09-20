import ARKit
import AVFoundation
import Combine
import UIKit
import simd
import WebKit

// ARSession delegates run on the main queue; network completions return there explicitly.
final class MotionController: NSObject, ObservableObject, ARSessionDelegate, WKNavigationDelegate {
    @Published private(set) var active = false
    @Published private(set) var tracking = "Waiting for tracking"
    @Published private(set) var trackingReady = false
    @Published private(set) var aligned = false
    @Published private(set) var recording = false
    @Published private(set) var message = "Open Phone camera in the desktop editor and choose Pair iPhone."
    @Published private(set) var receiverVisible = false
    private var receiverLoaded = false
    private var paired = false
    private var receiverDownload: URLSessionDataTask?
    lazy var webView: WKWebView = {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(ReceiverBridge(self), name: "receiver")
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = self
        view.isOpaque = false; view.backgroundColor = .black
        view.scrollView.isScrollEnabled = false
        return view
    }()

    private let session = ARSession()
    private var socket: URLSessionWebSocketTask?
    private var sequence = 0
    private var lastSent: TimeInterval = -1
    private var sending = false
    private var generation = 0

    override init() {
        super.init()
        session.delegate = self
        session.delegateQueue = .main
    }

    func connect(address: String, code: String) {
        disconnect()
        guard ARWorldTrackingConfiguration.isSupported else {
            message = "This device does not support ARKit world tracking. Use a compatible physical iPhone."
            return
        }
        let host = address.trimmingCharacters(in: .whitespacesAndNewlines)
        let pairing = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard pairing.count == 8, pairing.allSatisfy(\.isNumber),
              var url = URLComponents(string: "ws://\(host)/phone"), url.host != nil,
              url.user == nil, url.password == nil, url.path == "/phone" else {
            message = "Enter the computer address and 8-digit code shown by the editor."
            return
        }
        url.queryItems = [URLQueryItem(name: "code", value: pairing)]
        guard let endpoint = url.url else { return }
        let attempt = generation
        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
            DispatchQueue.main.async {
                guard let self, self.generation == attempt else { return }
                guard granted else {
                    self.message = "Allow camera access in iPhone Settings to track movement."
                    return
                }
                self.loadReceiver(endpoint)
            }
        }
    }

    private func loadReceiver(_ endpoint: URL) {
        var url = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)!
        url.scheme = "http"; url.path = "/receiver"
        let attempt = generation
        message = "Loading the latency receiver…"
        receiverDownload = URLSession.shared.dataTask(with: URLRequest(url: url.url!, timeoutInterval: 8)) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self, self.generation == attempt else { return }
                guard error == nil, (response as? HTTPURLResponse)?.statusCode == 200,
                      let data, data.count < 200_000, let html = String(data: data, encoding: .utf8) else {
                    self.message = "Could not load the receiver. Check the address, code, and Wi-Fi; update and restart the desktop bridge."
                    return
                }
                // All signaling uses the native paired socket. The document has no
                // external resources; a secure origin enables the WebRTC APIs.
                self.webView.loadHTMLString(html, baseURL: URL(string: "https://composition.invalid"))
                self.receiverVisible = true
                self.open(endpoint)
            }
        }
        receiverDownload?.resume()
    }

    fileprivate func receiverMessage(_ body: Any) {
        guard let value = body as? [String: Any], let type = value["type"] as? String else { return }
        if type == "receiver-ready" {
            receiverLoaded = true
            if paired, let task = socket { send(["type": "preview-ready", "version": 1], through: task) }
        } else if ["signal", "pulse", "diagnostics"].contains(type), paired, let task = socket {
            send(value, through: task)
        }
    }

    private func deliver(_ value: [String: Any]) {
        guard receiverLoaded else { return }
        webView.callAsyncJavaScript("return window.receiver.accept(message)", arguments: ["message": value], in: nil, in: .page) { [weak self] result in
            if case .failure = result { self?.message = "The preview receiver stopped. Reconnect to reload it." }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        decisionHandler(url?.scheme == "about" || url?.host == "composition.invalid" ? .allow : .cancel)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        disconnect(message: "The video receiver was interrupted. Reconnect to reload it.")
    }

    private func open(_ endpoint: URL) {
        let request = URLRequest(url: endpoint, timeoutInterval: 8)
        let task = URLSession.shared.webSocketTask(with: request)
        task.maximumMessageSize = 300_000
        socket = task
        active = true
        message = "Connecting over Wi-Fi…"
        task.resume()
        receive(task)
    }

    private func receive(_ task: URLSessionWebSocketTask) {
        task.receive { [weak self, weak task] result in
            DispatchQueue.main.async {
                guard let self, let task, self.socket === task else { return }
                switch result {
                case .failure:
                    self.disconnect(message: "Connection ended. Check Wi-Fi, the pairing code, and the computer's private-network firewall access.")
                    return
                case .success(.data(let data)):
                    self.deliver(["type": "jpeg", "data": data.base64EncodedString()])
                case .success(.string(let text)):
                    if let data = text.data(using: .utf8),
                       let event = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
                        if event["type"] as? String == "connected" {
                            self.paired = true
                            if self.receiverLoaded { self.send(["type": "preview-ready", "version": 1], through: task) }
                            self.sequence = 0; self.lastSent = -1
                            let configuration = ARWorldTrackingConfiguration()
                            configuration.worldAlignment = .gravity
                            self.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
                            UIApplication.shared.isIdleTimerDisabled = true
                            self.message = "Move slowly to find room features, then set your starting pose."
                        } else if ["preview-config", "signal", "render-stats"].contains(event["type"] as? String ?? "") {
                            self.deliver(event)
                        } else if event["type"] as? String == "state" {
                            self.aligned = event["aligned"] as? Bool ?? false
                            self.recording = event["recording"] as? Bool ?? false
                            self.message = self.recording ? "Recording movement. Stop to save it." : self.aligned ? "Ready to record." : "Set the starting pose before the next take."
                        }
                    }
                @unknown default: break
                }
                self.receive(task)
            }
        }
    }

    func control(_ action: String) {
        guard let task = socket else { return }
        send(["type": "control", "action": action], through: task)
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard let task = socket, !sending, frame.timestamp - lastSent >= 1.0 / 30.0 else { return }
        let quality: String
        switch frame.camera.trackingState {
        case .normal: quality = "normal"
        case .limited: quality = "limited"
        case .notAvailable: quality = "unavailable"
        }
        let ready = quality == "normal"
        if trackingReady != ready { trackingReady = ready }
        let label = ready ? "Tracking ready" : "Move slowly · finding room features"
        if tracking != label { tracking = label }
        // Invert the landscape view matrix to get camera-to-world. Y is up, meters,
        // camera looks along -Z, quaternion order is x/y/z/w (matching Three.js).
        let pose = frame.camera.viewMatrix(for: .landscapeRight).inverse
        let position = pose.columns.3
        let q = simd_normalize(simd_quatf(pose)).vector
        sequence += 1; lastSent = frame.timestamp; sending = true
        send(["type": "pose", "version": 1, "seq": sequence, "time": frame.timestamp,
              "tracking": quality, "position": [position.x, position.y, position.z],
              "quaternion": [q.x, q.y, q.z, q.w]], through: task, pose: true)
    }

    private func send(_ object: [String: Any], through task: URLSessionWebSocketTask, pose: Bool = false) {
        guard let data = try? JSONSerialization.data(withJSONObject: object), let text = String(data: data, encoding: .utf8) else {
            if pose { sending = false }; return
        }
        task.send(.string(text)) { [weak self, weak task] error in
            DispatchQueue.main.async {
                guard let self, let task, self.socket === task else { return }
                if pose { self.sending = false }
                if error != nil { self.disconnect(message: "Connection lost. Reconnect and set the starting pose again.") }
            }
        }
    }

    func sessionWasInterrupted(_ session: ARSession) {
        disconnect(message: "Tracking was interrupted. Reconnect and set the starting pose again.")
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        disconnect(message: "Tracking stopped: \(error.localizedDescription)")
    }

    func disconnect(message: String = "Disconnected. Pair again when ready.") {
        generation += 1
        receiverDownload?.cancel(); receiverDownload = nil
        if receiverLoaded { webView.evaluateJavaScript("window.receiver?.close()", completionHandler: nil) }
        receiverLoaded = false; receiverVisible = false; paired = false
        let previous = socket; socket = nil
        previous?.cancel(with: .goingAway, reason: nil)
        session.pause()
        active = false; aligned = false; recording = false; trackingReady = false; sending = false
        tracking = "Waiting for tracking"; self.message = message
        UIApplication.shared.isIdleTimerDisabled = false
    }
}

private final class ReceiverBridge: NSObject, WKScriptMessageHandler {
    weak var owner: MotionController?
    init(_ owner: MotionController) { self.owner = owner }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame else { return }
        owner?.receiverMessage(message.body)
    }
}
