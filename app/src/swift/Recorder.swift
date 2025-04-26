

import Foundation
import AVFoundation
import ScreenCaptureKit



struct Stderr: TextOutputStream {
    func write(_ s: String) { FileHandle.standardError.write(Data(s.utf8)) }
}
var stderr = Stderr()

@inline(__always)
func jsonLine(_ d:[String:Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: d),
       let s = String(data:data,encoding:.utf8) {
        print(s); fflush(stdout)
    }
}


final class RecorderCLI: NSObject, SCStreamDelegate, SCStreamOutput {

  
    static var stream:        SCStream?
    static var file:          AVAudioFile?
    static var pcmConverter:  AVAudioConverter?


    var isPipe       = CommandLine.arguments.contains("--pipe")
    var recordFolder : String?
    var recordName   : String?
    var gotFirst     = false

    override init() {
        super.init()

        parseArguments()

        
        signal(SIGINT) { _ in
            RecorderCLI.stream?.stopCapture()
            jsonLine([
              "code":"RECORDING_STOPPED",
              "timestamp": ISO8601DateFormatter().string(from: .init())
            ])
            exit(0)
        }
    }

    private func parseArguments() {
        let a = CommandLine.arguments

       
        if a.contains("--check-permissions") {
            jsonLine([
              "code": CGPreflightScreenCaptureAccess()
                      ? "PERMISSION_GRANTED" : "PERMISSION_DENIED"
            ])
            exit(0)
        }

        if isPipe { return }  

        guard let i = a.firstIndex(of:"--record"), i+1 < a.count else {
            jsonLine(["code":"INVALID_ARGUMENTS"]); exit(1)
        }
        recordFolder = a[i+1]

        if let f = a.firstIndex(of:"--filename"), f+1 < a.count {
            recordName = a[f+1]
        }
    }

 
    func run() {
        PermissionsRequester.request { ok in
            guard ok else { jsonLine(["code":"PERMISSION_DENIED"]); exit(1) }
            Task { @MainActor in await self.startCapture() }
        }
        RunLoop.current.run()    
    }

 
    @MainActor
    private func startCapture() async {
       
        let content: SCShareableContent
        do {
            content = try await withCheckedThrowingContinuation { cont in
                SCShareableContent.getExcludingDesktopWindows(
                    true, onScreenWindowsOnly: true) { c, err in
                        if let c = c { cont.resume(returning: c) }
                        else       { cont.resume(throwing: err ?? NSError()) }
                    }
            }
        } catch {
            jsonLine(["code":"CONTENT_ERROR"]); exit(1)
        }

        guard let display = content.displays.first else {
            jsonLine(["code":"NO_DISPLAY_FOUND"]); exit(1)
        }

        let filter = SCContentFilter(display: display,
                                     excludingApplications: [],
                                     exceptingWindows: [])
        let cfg = SCStreamConfiguration()
        cfg.capturesAudio = true
        cfg.sampleRate    = 16_000
        cfg.channelCount  = 1
        cfg.width = 2; cfg.height = 2
        cfg.minimumFrameInterval = .invalid
        cfg.showsCursor = false

        do {
            RecorderCLI.stream = SCStream(filter: filter,
                                          configuration: cfg,
                                          delegate: self)
            try RecorderCLI.stream?.addStreamOutput(
                    self, type: .audio, sampleHandlerQueue: .global())
            try await RecorderCLI.stream?.startCapture()
        } catch {
            jsonLine(["code":"CAPTURE_FAILED"]); exit(1)
        }
    }

    
    func stream(_ s: SCStream,
                didOutputSampleBuffer sb: CMSampleBuffer,
                of _: SCStreamOutputType)
    {
        guard sb.isValid, let floatBuf = sb.asPCMBuffer else { return }


        if isPipe {

            if RecorderCLI.pcmConverter == nil {
                let dstFmt = AVAudioFormat(commonFormat: .pcmFormatInt16,
                                           sampleRate: 16_000,
                                           channels: 1,
                                           interleaved: true)!
                RecorderCLI.pcmConverter = AVAudioConverter(from: floatBuf.format,
                                                            to:   dstFmt)
            }
            guard let conv = RecorderCLI.pcmConverter,
                  let dst  = AVAudioPCMBuffer(pcmFormat: conv.outputFormat,
                                              frameCapacity: floatBuf.frameCapacity)
            else { return }

            try? conv.convert(to: dst, from: floatBuf)

            let ptr   = dst.int16ChannelData![0]
            let bytes = Int(dst.frameLength) * MemoryLayout<Int16>.size
            let data  = Data(bytes: ptr, count: bytes)
            jsonLine(["code":"SCR", "timestamp":ISO8601DateFormatter().string(from: .init()), "data":data.base64EncodedString()])

            if !gotFirst {
                gotFirst = true
                jsonLine(["code":"RECORDING_STARTED",
                          "timestamp": ISO8601DateFormatter().string(from: .init())])
            }
            return
        }

        
        if RecorderCLI.file == nil {
            let ts = ISO8601DateFormatter().string(from: .init())
            let name = recordName ?? ts.replacingOccurrences(of:":", with:".")
            let path = "\(recordFolder!)/\(name).flac"
            let settings: [String:Any] = [
                AVSampleRateKey: 16_000,
                AVNumberOfChannelsKey: 1,
                AVFormatIDKey: kAudioFormatFLAC
            ]
            RecorderCLI.file = try? AVAudioFile(forWriting: URL(fileURLWithPath:path),
                                                settings: settings)
            jsonLine(["code":"RECORDING_STARTED","path":path,"timestamp":ts])
        }
        try? RecorderCLI.file?.write(from: floatBuf)
    }

    func stream(_ s: SCStream, didStopWithError e: Error) {
        jsonLine(["code":"STREAM_ERROR","error":String(describing:e)]); exit(1)
    }
}


struct PermissionsRequester {
    static func request(_ cb:@escaping(Bool)->Void) {
        if CGPreflightScreenCaptureAccess() { cb(true); return }
        cb( CGRequestScreenCaptureAccess() )
    }
}


extension CMSampleBuffer {
    var asPCMBuffer: AVAudioPCMBuffer? {
        try? self.withAudioBufferList { list, _ -> AVAudioPCMBuffer? in
            guard let asbd = formatDescription?.audioStreamBasicDescription,
               let fmt = AVAudioFormat(standardFormatWithSampleRate: asbd.mSampleRate,
                                       channels: asbd.mChannelsPerFrame)
            else { return nil }
            return AVAudioPCMBuffer(pcmFormat: fmt, bufferListNoCopy: list.unsafePointer)
        }
    }
}


RecorderCLI().run()
