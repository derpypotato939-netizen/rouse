import Foundation

/// Minimal RIFF/WAVE serialiser, 16-bit stereo PCM.
///
/// Hand-rolled rather than using AVFoundation so sounds can be rendered and auditioned from the
/// command line before Xcode exists — being able to *hear* the engine on day one is worth more
/// than a dependency saved. The app converts the same buffer to `.caf` for AlarmKit.
public enum WavWriter {

    public static func data(_ buffer: Synth.Buffer, sampleRate: Double = Synth.sampleRate) -> Data {
        let channels = 2
        let bitsPerSample = 16
        let bytesPerFrame = channels * bitsPerSample / 8
        let dataBytes = buffer.frameCount * bytesPerFrame

        var out = Data(capacity: 44 + dataBytes)

        func ascii(_ s: String) { out.append(contentsOf: Array(s.utf8)) }
        func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { out.append(contentsOf: $0) } }
        func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { out.append(contentsOf: $0) } }

        ascii("RIFF")
        u32(UInt32(36 + dataBytes))
        ascii("WAVE")

        ascii("fmt ")
        u32(16)                                             // PCM chunk size
        u16(1)                                              // format: PCM
        u16(UInt16(channels))
        u32(UInt32(sampleRate))
        u32(UInt32(sampleRate) * UInt32(bytesPerFrame))     // byte rate
        u16(UInt16(bytesPerFrame))                          // block align
        u16(UInt16(bitsPerSample))

        ascii("data")
        u32(UInt32(dataBytes))

        var pcm = [UInt8]()
        pcm.reserveCapacity(dataBytes)
        for i in 0..<buffer.frameCount {
            for sample in [buffer.left[i], buffer.right[i]] {
                let clamped = max(-1.0, min(1.0, sample))
                let value = Int16(clamped * 32_767)
                withUnsafeBytes(of: value.littleEndian) { pcm.append(contentsOf: $0) }
            }
        }
        out.append(contentsOf: pcm)
        return out
    }

    public static func write(_ buffer: Synth.Buffer, to url: URL) throws {
        try data(buffer).write(to: url)
    }
}
