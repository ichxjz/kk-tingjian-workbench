import Foundation
import AVFoundation
import Vision

let asset = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let duration = CMTimeGetSeconds(asset.duration)
guard duration.isFinite && duration > 0 else { exit(0) }
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.maximumSize = CGSize(width: 1280, height: 1280)
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
var cues: [[String: Any]] = []
var previous = ""
for time in stride(from: 0.0, to: duration, by: 0.5) {
    try autoreleasepool {
        let frame = try generator.copyCGImage(at: CMTime(seconds: time, preferredTimescale: 600), actualTime: nil)
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
        request.usesLanguageCorrection = true
        // Vision uses a bottom-left origin: ignore headers in the upper 40%.
        request.regionOfInterest = CGRect(x: 0.05, y: 0.02, width: 0.9, height: 0.58)
        try VNImageRequestHandler(cgImage: frame).perform([request])
        let text = (request.results ?? []).filter { ($0.topCandidates(1).first?.confidence ?? 0) >= 0.5 }
            .sorted { $0.boundingBox.midY > $1.boundingBox.midY }
            .compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
        if !text.isEmpty {
            if text == previous && !cues.isEmpty { cues[cues.count - 1]["end"] = min(time + 0.5, duration) }
            else { cues.append(["start": time, "end": min(time + 0.5, duration), "text": text]) }
        }
        previous = text
    }
}
let data = try JSONSerialization.data(withJSONObject: cues)
print(String(data: data, encoding: .utf8)!)
