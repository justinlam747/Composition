import SwiftUI

@main
struct CompositionCameraApp: App {
    @StateObject private var controller = MotionController()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            CameraScreen(controller: controller)
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
        HStack(spacing: 20) {
            ZStack {
                Color.black
                if let preview = controller.preview {
                    Image(uiImage: preview).resizable().aspectRatio(contentMode: .fit)
                } else {
                    VStack(spacing: 12) {
                        Image(systemName: "viewfinder").font(.largeTitle)
                        Text("Your virtual shot appears here").font(.headline)
                        Text("Pair with the desktop editor, then set the starting pose.")
                            .font(.caption).multilineTextAlignment(.center)
                    }.foregroundStyle(.white).padding()
                }
                VStack { HStack { Text("COMPOSITION · 16:9").font(.caption.bold()); Spacer() }; Spacer() }
                    .foregroundStyle(.white).padding()
            }.aspectRatio(16 / 9, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 18))
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Phone camera").font(.title2.bold())
                    if !controller.active {
                        TextField("Computer address:port", text: $address)
                            .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                        TextField("8-digit pairing code", text: $code).keyboardType(.numberPad)
                        Button("Connect") { controller.connect(address: address, code: code) }
                            .buttonStyle(.borderedProminent)
                    } else {
                        Label(controller.tracking, systemImage: controller.trackingReady ? "checkmark.circle" : "viewfinder")
                        Button("Set starting pose") { controller.control("align") }
                            .disabled(!controller.trackingReady || controller.recording).buttonStyle(.bordered)
                        Button(controller.recording ? "Stop & save" : "Record move") {
                            controller.control(controller.recording ? "stop" : "record")
                        }.disabled(!controller.aligned).buttonStyle(.borderedProminent)
                        Button("Return to editing") { controller.control("stop") }.disabled(!controller.aligned)
                        Button("Disconnect") { controller.disconnect() }
                    }
                    Text(controller.message).font(.caption).foregroundStyle(.secondary)
                    Text("Walk closer, pull back, or pan. Keep the desktop tab visible. The preview is your virtual scene; camera images stay on this phone.")
                        .font(.caption2).foregroundStyle(.secondary)
                }.textFieldStyle(.roundedBorder)
            }.frame(width: 230)
        }.padding(20).tint(.orange)
    }
}
