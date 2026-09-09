import AVFoundation
import AudioToolbox
import Foundation

struct Event: Decodable { let time: Double; let part: Int; let note: Int; let velocity: Int; let duration: Double }
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let events = try JSONDecoder().decode([Event].self, from: Data(contentsOf: root.appendingPathComponent("launch-video/audio/score.json")))
let engine = AVAudioEngine()
let programs: [UInt8] = [42, 42, 40]
var players: [AVAudioUnitSampler] = []
let bank = URL(fileURLWithPath: "/System/Library/Components/CoreAudio.component/Contents/Resources/gs_instruments.dls")
let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 2)!
for program in programs {
    let player = AVAudioUnitSampler()
    engine.attach(player)
    try player.loadSoundBankInstrument(at: bank, program: program, bankMSB: UInt8(kAUSampler_DefaultMelodicBankMSB), bankLSB: 0)
    engine.connect(player, to: engine.mainMixerNode, format: format)
    players.append(player)
}
players[0].masterGain = -5
players[1].masterGain = -10
players[2].masterGain = -15
let reverb = AVAudioUnitReverb()
engine.attach(reverb)
reverb.loadFactoryPreset(.mediumHall)
reverb.wetDryMix = 18
engine.disconnectNodeOutput(engine.mainMixerNode)
engine.connect(engine.mainMixerNode, to: reverb, format: format)
engine.connect(reverb, to: engine.outputNode, format: format)
try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 512)
try engine.start()
struct Action { let sample: Int64; let part: Int; let note: UInt8; let velocity: UInt8 }
var actions: [Action] = []
for e in events {
    actions.append(Action(sample: Int64(e.time * 48000), part: e.part, note: UInt8(e.note), velocity: UInt8(e.velocity)))
    actions.append(Action(sample: Int64((e.time + e.duration) * 48000), part: e.part, note: UInt8(e.note), velocity: 0))
}
actions.sort { $0.sample == $1.sample ? $0.velocity < $1.velocity : $0.sample < $1.sample }
let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 512)!
let file = try AVAudioFile(forWriting: root.appendingPathComponent("launch-video/output/strings-raw-v1.wav"), settings: format.settings)
let end: Int64 = Int64(34.6 * 48000)
var index = 0
while engine.manualRenderingSampleTime < end {
    let now = engine.manualRenderingSampleTime
    while index < actions.count && actions[index].sample <= now {
        let action = actions[index]
        if action.velocity == 0 { players[action.part].stopNote(action.note, onChannel: 0) }
        else { players[action.part].startNote(action.note, withVelocity: action.velocity, onChannel: 0) }
        index += 1
    }
    let next = index < actions.count ? actions[index].sample : end
    let count = AVAudioFrameCount(min(512, min(end - now, max(1, next - now))))
    let status = try engine.renderOffline(count, to: buffer)
    if status == .success { try file.write(from: buffer) }
    else if status == .error { fatalError("Offline audio rendering failed") }
}
engine.stop()
print("Rendered \(events.count) notes, 34.6 seconds at 48 kHz")
