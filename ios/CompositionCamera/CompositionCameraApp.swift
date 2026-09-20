import SwiftUI
import WebKit

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
                            TextField("Computer address:port", text: $address)
                                .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                            TextField("8-digit pairing code", text: $code).keyboardType(.numberPad)
                            Button("Connect") { controller.connect(address: address, code: code) }.buttonStyle(CameraButtonStyle())
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
