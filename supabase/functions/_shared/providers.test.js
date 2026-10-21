import { describe, expect, it } from 'vitest'
import {
  extractGeminiText,
  extractGeminiTranscript,
  geminiAudioMime,
  sniffGeminiAudio,
  geminiBlockedReason,
  geminiLanguageHint,
  geminiUsage,
  resolveProvider,
} from './providers.js'

const env = (values) => (name) => values[name]

describe('provider selection', () => {
  it('uses Gemini for notes and chat when only GEMINI_API_KEY is set', () => {
    const llm = resolveProvider('llm', env({ GEMINI_API_KEY: 'secret' }))
    expect(llm).toMatchObject({ provider: 'gemini', keyName: 'GEMINI_API_KEY', configured: true, model: 'gemini-3.8-flash' })
    const stt = resolveProvider('stt', env({ GEMINI_API_KEY: 'secret' }))
    expect(stt).toMatchObject({ provider: 'gemini', configured: true, model: 'gemini-3.5-transcribe' })
  })

  it('reports a missing key without exposing anything', () => {
    const llm = resolveProvider('llm', env({ LLM_PROVIDER: 'gemini' }))
    expect(llm.configured).toBe(false)
    expect(JSON.stringify(llm)).not.toContain('secret')
  })

  it('prefers OpenAI speech-to-text when that key exists and honours explicit overrides', () => {
    const stt = resolveProvider('stt', env({ GEMINI_API_KEY: 'a', SPEECH_TO_TEXT_API_KEY: 'b' }))
    expect(stt.provider).toBe('openai')
    const forced = resolveProvider('llm', env({ LLM_PROVIDER: 'openai', LLM_API_KEY: 'b', LLM_MODEL: 'gpt-4.1-mini' }))
    expect(forced).toMatchObject({ provider: 'openai', model: 'gpt-4.1-mini', configured: true })
    expect(resolveProvider('llm', env({ LLM_PROVIDER: 'anthropic' })).supported).toBe(false)
  })
})

describe('Gemini response helpers', () => {
  it('joins text parts and reads token usage', () => {
    const payload = {
      candidates: [{ content: { parts: [{ text: '{"answer":' }, { text: '"yes"}' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4 },
    }
    expect(extractGeminiText(payload)).toBe('{"answer":"yes"}')
    expect(geminiUsage(payload)).toEqual({ prompt_tokens: 12, completion_tokens: 4 })
    expect(geminiBlockedReason(payload)).toBe('')
    expect(geminiBlockedReason({ promptFeedback: { blockReason: 'SAFETY' } })).toBe('SAFETY')
    expect(extractGeminiText({
      candidates: [{ content: { parts: [{ thought: true, text: 'scratch' }, { text: '{"ok":true}' }] } }],
    })).toBe('{"ok":true}')
    expect(extractGeminiTranscript({
      candidates: [{
        content: {
          parts: [{
            audioTranscription: { words: [{ word: 'Hello' }, { word: 'there' }] },
          }],
        },
      }],
    })).toBe('Hello there')
  })

  it('does not send short language codes that Gemini rejects', () => {
    expect(geminiLanguageHint('en')).toBe('')
    expect(geminiLanguageHint('en-US')).toBe('en-US')
    expect(geminiLanguageHint('English')).toBe('')
  })

  it('maps audio types to the names Gemini documents', () => {
    expect(geminiAudioMime('audio/mpeg')).toEqual({ mime: 'audio/mp3', documented: true })
    expect(geminiAudioMime('audio/webm;codecs=opus')).toEqual({ mime: 'audio/webm', documented: true })
    expect(geminiAudioMime('audio/weba', 'clip.weba')).toEqual({ mime: 'audio/webm', documented: true })
    expect(geminiAudioMime('', '3ee15946.weba')).toEqual({ mime: 'audio/webm', documented: true })
    const wav = new Uint8Array(12)
    wav.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])
    expect(sniffGeminiAudio(wav, 'audio/webm', 'clip.webm')).toEqual({ mime: 'audio/wav', playable: true })
    expect(sniffGeminiAudio(new Uint8Array([0x2d, 0x2d, 0x2d, 0x2d]), 'audio/wav', 'clip.wav').playable).toBe(false)
  })
})
