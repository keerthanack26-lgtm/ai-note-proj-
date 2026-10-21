import { describe, expect, it } from 'vitest'
import { baseMime, extensionForMime, isSilentSamples, needsWavConversion, validateAudioFile } from './audio'

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
  })
})
