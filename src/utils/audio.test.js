import { describe, expect, it } from 'vitest'
import {
  baseMime,
  canonicalMime,
  extensionForMime,
  filePickerAccept,
  hasNonAudioSignature,
  isAllowedMime,
  isSilentSamples,
  needsWavConversion,
  prepareAudioFile,
  resolveAudioMime,
  sniffAudioMime,
  validateAudioFile,
} from './audio'

describe('audio validation', () => {
  it('accepts a supported file within the size limit', () => {
    const file = { type: 'audio/webm;codecs=opus', size: 1024 }
    expect(baseMime(file.type)).toBe('audio/webm')
    expect(extensionForMime(file.type)).toBe('webm')
    expect(validateAudioFile(file)).toBe('')
  })

  it('rejects an unsupported format and an oversized file', () => {
    expect(validateAudioFile({ type: 'audio/weba', size: 2048 })).toBe('')
    expect(validateAudioFile({ type: 'audio/flac', size: 100 })).toMatch(/not supported/)
    expect(validateAudioFile({ type: 'audio/mpeg', size: 26 * 1024 * 1024 })).toMatch(/too large/)
    expect(validateAudioFile({ type: 'audio/wav', size: 0 })).toMatch(/empty/)
  })

  it('detects silent recordings before they are sent to Gemini', () => {
    expect(isSilentSamples(new Float32Array(64))).toBe(true)
    const spoken = new Float32Array(64)
    spoken[10] = 0.4
    expect(isSilentSamples(spoken)).toBe(false)
  })

  it('flags browser recordings that Gemini should receive as WAV', () => {
    expect(needsWavConversion('audio/webm;codecs=opus', 'clip.weba')).toBe(true)
    expect(needsWavConversion('audio/wav', 'clip.wav')).toBe(false)
    expect(needsWavConversion('audio/ogg', 'clip.ogg')).toBe(false)
  })
})

describe('cross-browser and macOS audio compatibility', () => {
  it('accepts files with empty file.type when extension is valid (macOS Safari Voice Memos)', () => {
    const extensions = ['m4a', 'mp3', 'wav', 'ogg', 'webm', 'aac']
    for (const ext of extensions) {
      const file = { name: `test_memo.${ext}`, type: '', size: 50000 }
      expect(validateAudioFile(file)).toBe('')
    }
  })

  it('accepts files with application/octet-stream or generic MIME if extension is valid', () => {
    const file = { name: 'recording.m4a', type: 'application/octet-stream', size: 12000 }
    expect(validateAudioFile(file)).toBe('')
    expect(resolveAudioMime(file)).toBe('audio/mp4')
  })

  it('maps Apple / Safari / WebKit audio MIME variations to canonical audio types', () => {
    expect(canonicalMime('audio/mp4a-latm')).toBe('audio/mp4')
    expect(canonicalMime('audio/x-m4a')).toBe('audio/mp4')
    expect(canonicalMime('video/quicktime')).toBe('audio/mp4')
    expect(canonicalMime('audio/vnd.wave')).toBe('audio/wav')
    expect(canonicalMime('audio/x-pn-wav')).toBe('audio/wav')
    expect(canonicalMime('audio/mpg')).toBe('audio/mpeg')
    expect(canonicalMime('audio/x-opus')).toBe('audio/ogg')
  })

  it('accepts macOS Safari specific audio formats during validation', () => {
    expect(validateAudioFile({ name: 'voice.m4a', type: 'audio/mp4a-latm', size: 1024 })).toBe('')
    expect(validateAudioFile({ name: 'clip.mov', type: 'video/quicktime', size: 1024 })).toBe('')
    expect(validateAudioFile({ name: 'sound.wav', type: 'audio/vnd.wave', size: 1024 })).toBe('')
  })

  it('detects non-audio file signatures and rejects renamed files', () => {
    // Fake MP3 that is actually a PDF
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35])
    expect(hasNonAudioSignature(pdfBytes)).toBe(true)
    const fakeMp3 = { name: 'document.mp3', type: 'audio/mpeg', size: 1024 }
    expect(validateAudioFile(fakeMp3, { header: pdfBytes })).toMatch(/not supported/)

    // Fake M4A that is actually a PNG image
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(hasNonAudioSignature(pngBytes)).toBe(true)
    const fakeM4a = { name: 'image.m4a', type: 'audio/mp4', size: 2048 }
    expect(validateAudioFile(fakeM4a, { header: pngBytes })).toMatch(/not supported/)

    // Fake WAV that is actually a ZIP archive
    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    expect(hasNonAudioSignature(zipBytes)).toBe(true)
    const fakeWav = { name: 'archive.wav', type: '', size: 3000 }
    expect(validateAudioFile(fakeWav, { header: zipBytes })).toMatch(/not supported/)
  })

  it('identifies valid audio formats via magic bytes', () => {
    // RIFF WAV
    const wavBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ])
    expect(sniffAudioMime(wavBytes)).toBe('audio/wav')

    // WebM EBML
    const webmBytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])
    expect(sniffAudioMime(webmBytes)).toBe('audio/webm')

    // ID3 MP3
    const mp3Bytes = new Uint8Array([0x49, 0x44, 0x33, 0x03])
    expect(sniffAudioMime(mp3Bytes)).toBe('audio/mpeg')

    // OggS
    const oggBytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53])
    expect(sniffAudioMime(oggBytes)).toBe('audio/ogg')
  })

  it('generates an accept string including extensions and audio types for Safari file picker', () => {
    const accept = filePickerAccept()
    expect(accept).toContain('.m4a')
    expect(accept).toContain('.mp3')
    expect(accept).toContain('.wav')
    expect(accept).toContain('.ogg')
    expect(accept).toContain('.webm')
    expect(accept).toContain('audio/*')
    expect(accept).toContain('audio/mp4')
  })

  it('prepares and normalizes audio files with canonical MIME types', async () => {
    const mockFile = new File([new Uint8Array([1, 2, 3])], 'voice-note.m4a', { type: '' })
    const prepared = await prepareAudioFile(mockFile)
    expect(prepared.name).toBe('voice-note.m4a')
    expect(prepared.type).toBe('audio/mp4')
  })
})
