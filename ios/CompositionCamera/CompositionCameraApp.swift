import SwiftUI
import WebKit
import AVFoundation
import VisionKit

@main
struct CompositionCameraApp: App {
    @StateObject private var controller = MotionController()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            CameraScreen(controller: controller)
                .preferredColorScheme(.light)
                .onChange(of: phase) { _, value in
                    if value == .background { controller.disconnect(message: "Connection paused. Reconnect when ready.") }
                }
        }
    }
}

private struct CameraScreen: View {
    @ObservedObject var controller: MotionController
    @AppStorage("computerAddress") private var address = ""
    @State private var code = ""
    @Environment(\.scenePhase) private var phase
    @State private var scanning = false
    @State private var scanMessage = ""
    @State private var pendingPairing: CameraPairingCode?
    @State private var manualPairing = false

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 9) {
                Text("composition").font(.system(size: 20, weight: .semibold))
                Spacer()
                HStack(spacing: 6) {
                    Circle().fill(controller.recording && !controller.paused ? CameraPalette.red : controller.aligned && !controller.paused ? CameraPalette.green : CameraPalette.muted).frame(width: 6, height: 6)
                    Text(status).font(.caption)
                }.padding(.horizontal, 12).padding(.vertical, 8).background(.white, in: Capsule())
                Menu {
                    Toggle("Debug information", isOn: Binding(get: { controller.debugEnabled }, set: controller.setDebugEnabled))
                    if controller.active {
                        Button("Return to editing", systemImage: "cursorarrow") { controller.control("stop") }
                        Button("Disconnect", systemImage: "wifi.slash", role: .destructive) { controller.disconnect() }
                    }
                } label: {
                    Image(systemName: "ellipsis").frame(width: 44, height: 36).background(.white, in: RoundedRectangle(cornerRadius: 12))
                }.accessibilityLabel("Camera options")
            }
            HStack(spacing: 16) {
                ZStack {
                    CameraPalette.raised
                    if controller.receiverVisible {
                        ReceiverView(webView: controller.webView)
                    } else {
                        VStack(spacing: 12) {
                            Image(systemName: "video.slash").font(.system(size: 32, weight: .light)).foregroundStyle(CameraPalette.muted).accessibilityHidden(true)
                            Text("Camera is disconnected").font(.headline)
                        }.padding().multilineTextAlignment(.center)
                    }
                    if controller.paused {
                        Label("Paused", systemImage: "pause.fill").font(.caption.weight(.semibold))
                            .padding(12).background(.white.opacity(0.94), in: Capsule()).allowsHitTesting(false)
                    }
                }.aspectRatio(16 / 9, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 22))
                    .overlay(RoundedRectangle(cornerRadius: 22).stroke(CameraPalette.line, lineWidth: 1))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Text(controller.active ? "Frame your shot" : "Connect your camera").font(.headline)
                        if !controller.active {
                            Button(action: scanPairingCode) { Label("Scan pairing code", systemImage: "qrcode.viewfinder") }.buttonStyle(CameraButtonStyle())
                            Text("Open Phone camera → Pair iPhone on your computer, then scan its QR code.").font(.caption).foregroundStyle(CameraPalette.muted)
                            if !scanMessage.isEmpty { Text(scanMessage).font(.caption).foregroundStyle(CameraPalette.red) }
                            DisclosureGroup("Enter manually", isExpanded: $manualPairing) {
                                VStack(spacing: 12) {
                                    TextField("Computer address:port", text: $address)
                                        .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                                    TextField("8-digit pairing code", text: $code).keyboardType(.numberPad)
                                    Button("Connect") { controller.connect(address: address, code: code) }.buttonStyle(CameraButtonStyle())
                                }.padding(.top, 12)
                            }.font(.subheadline)
                        } else {
                            Button("Set starting pose") { controller.control("align") }
                                .disabled(!controller.trackingReady || controller.recording).buttonStyle(CameraButtonStyle())
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text("Movement").font(.subheadline)
                                    Spacer()
                                    Text(String(format: "%g×", controller.translationScale)).font(.subheadline.weight(.semibold)).monospacedDigit()
                                }
                                Slider(value: Binding(get: { controller.translationScale }, set: controller.setTranslationScale), in: 1...10, step: 0.5)
                                    .disabled(controller.recording).accessibilityLabel("Movement sensitivity")
                                Text(controller.recording ? "Finish the take to change sensitivity." : "10 cm on your phone = \(String(format: "%g", 10 * controller.translationScale)) cm in the scene.")
                                    .font(.caption2).foregroundStyle(CameraPalette.muted)
                            }
                            Button { controller.control(controller.recording ? "stop" : "record") } label: {
                                Label(controller.recording ? "Stop & save" : "Record", systemImage: controller.recording ? "stop.fill" : "record.circle")
                            }.disabled(!controller.aligned || controller.paused && !controller.recording).buttonStyle(CameraButtonStyle(record: true))
                            Button { controller.control(controller.paused ? "resume" : "pause") } label: {
                                Label(controller.paused ? "Resume" : "Pause", systemImage: controller.paused ? "play.fill" : "pause.fill")
                            }.disabled(!controller.aligned).buttonStyle(CameraButtonStyle())
                        }
                        Text(controller.message).font(.caption).foregroundStyle(CameraPalette.muted)
                        if controller.debugEnabled {
                            Divider()
                            Text("DEBUG").font(.caption2.weight(.semibold)).tracking(2)
                            Text(controller.tracking).font(.caption)
                            Text(controller.positionReadout).font(.system(.caption2, design: .monospaced))
                        }
                    }.padding(16).textFieldStyle(.roundedBorder)
                }.frame(width: 248).background(.white, in: RoundedRectangle(cornerRadius: 22))
                    .overlay(RoundedRectangle(cornerRadius: 22).stroke(CameraPalette.line, lineWidth: 1))
            }
        }.padding(16).foregroundStyle(CameraPalette.text).tint(CameraPalette.text).background(CameraPalette.background)
            .sheet(isPresented: $scanning, onDismiss: connectScannedPairing) {
                VStack(spacing: 12) {
                    HStack {
                        Text("Scan pairing code").font(.headline)
                        Spacer()
                        Button("Cancel") { pendingPairing = nil; scanning = false }
                    }
                    PairingScanner(onScan: { pairing in pendingPairing = pairing; scanning = false }, onError: { scanMessage = $0 })
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                    Text(scanMessage.isEmpty ? "Point your camera at the QR code in Composition." : scanMessage)
                        .font(.caption).foregroundStyle(CameraPalette.muted)
                }.padding(16).background(CameraPalette.background).tint(CameraPalette.text)
            }
            .onChange(of: phase) { _, value in
                if value == .background { pendingPairing = nil; scanning = false }
            }
    }

    private func scanPairingCode() {
        guard DataScannerViewController.isSupported else {
            scanMessage = "QR scanning isn't supported on this iPhone. Use Enter manually."; manualPairing = true; return
        }
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                guard phase == .active else { return }
                guard granted, DataScannerViewController.isAvailable else {
                    scanMessage = "Allow camera access in Settings to scan. You can also enter the code manually."; manualPairing = true; return
                }
                controller.disconnect()
                pendingPairing = nil; scanMessage = ""; scanning = true
            }
        }
    }

    private func connectScannedPairing() {
        guard let pairing = pendingPairing else { return }
        pendingPairing = nil
        guard phase == .active else { return }
        // The scanner has stopped and its sheet is dismissed before ARKit takes the camera.
        address = pairing.address; code = pairing.code
        controller.connect(address: address, code: code)
    }

    private var status: String {
        if !controller.active { return "Not connected" }
        if controller.paused { return controller.recording ? "Take paused" : "Camera paused" }
        if controller.recording { return "Recording" }
        if controller.aligned { return "Live camera" }
        return controller.trackingReady ? "Ready" : "Finding the room"
    }
}

private enum CameraPalette {
    static let background = Color(red: 0.977, green: 0.976, blue: 0.970)
    static let raised = Color(red: 0.950, green: 0.948, blue: 0.937)
    static let line = Color(red: 0.881, green: 0.878, blue: 0.864)
    static let text = Color(red: 0.136, green: 0.131, blue: 0.111)
    static let muted = Color(red: 0.421, green: 0.413, blue: 0.382)
    static let red = Color(red: 0.800, green: 0.270, blue: 0.234)
    static let green = Color(red: 0.282, green: 0.504, blue: 0.384)
}

private struct CameraButtonStyle: ButtonStyle {
    var record = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: record ? 50 : 42)
            .foregroundStyle(record ? Color.white : CameraPalette.text)
            .background(record ? CameraPalette.red : CameraPalette.raised, in: RoundedRectangle(cornerRadius: 14))
            .opacity(enabled ? configuration.isPressed ? 0.75 : 1 : 0.4)
    }
}

private struct ReceiverView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

private struct CameraPairingCode: Decodable {
    let type: String
    let version: Int
    let address: String
    let code: String
    let expiresAt: Double

    static func parse(_ text: String) throws -> CameraPairingCode {
        guard text.utf8.count <= 1024, let data = text.data(using: .utf8),
              let value = try? JSONDecoder().decode(Self.self, from: data),
              value.type == "composition-camera", value.version == 1,
              value.code.utf8.count == 8, value.code.utf8.allSatisfy({ (48...57).contains($0) }),
              value.expiresAt.isFinite, value.expiresAt > 0, value.expiresAt <= 9_007_199_254_740_991,
              value.expiresAt.rounded() == value.expiresAt,
              isLocalAddress(value.address) else { throw PairingError.invalid }
        guard value.expiresAt > Date().timeIntervalSince1970 * 1000 else { throw PairingError.expired }
        return value
    }

    private static func isLocalAddress(_ value: String) -> Bool {
        guard value.utf8.count <= 21 else { return false }
        let parts = value.split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count == 2, let port = Int(parts[1]), (1...65535).contains(port), String(port) == parts[1] else { return false }
        let octets = parts[0].split(separator: ".", omittingEmptySubsequences: false)
        guard octets.count == 4 else { return false }
        let numbers = octets.compactMap { Int($0) }
        guard numbers.count == 4, zip(numbers, octets).allSatisfy({ (0...255).contains($0.0) && String($0.0) == $0.1 }) else { return false }
        let a = numbers[0], b = numbers[1]
        return a == 10 || a == 172 && (16...31).contains(b) || a == 192 && b == 168
            || a == 169 && b == 254 || a == 100 && (64...127).contains(b)
    }

    private enum PairingError: LocalizedError {
        case invalid, expired
        var errorDescription: String? {
            switch self {
            case .invalid: return "This isn't a Composition pairing code. Scan the QR shown by Phone camera → Pair iPhone."
            case .expired: return "This pairing code expired. Choose New pairing code on your computer."
            }
        }
    }
}

private struct PairingScanner: UIViewControllerRepresentable {
    let onScan: (CameraPairingCode) -> Void
    let onError: (String) -> Void
    func makeUIViewController(context: Context) -> PairingScannerController { PairingScannerController(onScan: onScan, onError: onError) }
    func updateUIViewController(_ controller: PairingScannerController, context: Context) {}
    static func dismantleUIViewController(_ controller: PairingScannerController, coordinator: ()) { controller.stop() }
}

private final class PairingScannerController: UIViewController, DataScannerViewControllerDelegate {
    private let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced,
        recognizesMultipleItems: false, isHighFrameRateTrackingEnabled: false, isPinchToZoomEnabled: true,
        isGuidanceEnabled: true, isHighlightingEnabled: true)
    private let onScan: (CameraPairingCode) -> Void
    private let onError: (String) -> Void
    private var accepted = false

    init(onScan: @escaping (CameraPairingCode) -> Void, onError: @escaping (String) -> Void) {
        self.onScan = onScan; self.onError = onError
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        scanner.delegate = self; addChild(scanner)
        scanner.view.frame = view.bounds; scanner.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(scanner.view); scanner.didMove(toParent: self)
    }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !accepted else { return }
        do { try scanner.startScanning() }
        catch { onError("Couldn't start the scanner. Close it and try again, or use Enter manually.") }
    }
    override func viewWillDisappear(_ animated: Bool) { stop(); super.viewWillDisappear(animated) }
    func stop() { scanner.stopScanning() }
    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        addedItems.forEach(read)
    }
    func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) { read(item) }
    func dataScanner(_ dataScanner: DataScannerViewController, becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable) {
        onError("The camera is unavailable. Close the scanner and try again, or use Enter manually.")
    }
    private func read(_ item: RecognizedItem) {
        guard !accepted, case .barcode(let barcode) = item, let text = barcode.payloadStringValue else { return }
        do {
            let pairing = try CameraPairingCode.parse(text)
            accepted = true; stop(); onScan(pairing)
        } catch { onError(error.localizedDescription) }
    }
}
