// supabase/functions/_shared/providers.js
var GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
var GEMINI_DEFAULT_STT_MODEL = "gemini-3.5-transcribe";
var OPENAI_DEFAULT_LLM_MODEL = "gpt-4o-mini";
var OPENAI_DEFAULT_STT_MODEL = "whisper-1";
var SUPPORTED_PROVIDERS = ["gemini", "openai"];
var SECRET_NAMES = {
  gemini: { stt: "GEMINI_API_KEY", llm: "GEMINI_API_KEY" },
  openai: { stt: "SPEECH_TO_TEXT_API_KEY", llm: "LLM_API_KEY" }
};
function has(env, name) {
  return Boolean(String(env(name) || "").trim());
}
function resolveProvider(kind, env) {
  const explicit = String(env(kind === "stt" ? "STT_PROVIDER" : "LLM_PROVIDER") || "").trim().toLowerCase();
  let provider = explicit;
  if (!provider) {
    if (kind === "llm") provider = has(env, "GEMINI_API_KEY") ? "gemini" : "openai";
    else provider = has(env, "SPEECH_TO_TEXT_API_KEY") ? "openai" : has(env, "GEMINI_API_KEY") ? "gemini" : "openai";
  }
  const supported = SUPPORTED_PROVIDERS.includes(provider);
  const keyName = supported ? SECRET_NAMES[provider][kind] : null;
  const defaultModel = provider === "gemini" ? kind === "stt" ? GEMINI_DEFAULT_STT_MODEL : GEMINI_DEFAULT_MODEL : kind === "stt" ? OPENAI_DEFAULT_STT_MODEL : OPENAI_DEFAULT_LLM_MODEL;
  const model = String(env(kind === "stt" ? "STT_MODEL" : "LLM_MODEL") || "").trim() || defaultModel;
  return {
    provider,
    supported,
    keyName,
    configured: supported && has(env, keyName),
    model
  };
}
function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.filter((part) => !part?.thought && typeof part?.text === "string").map((part) => part.text).join("").trim();
}
function geminiLanguageHint(language) {
  const raw = String(language || "").trim();
  if (/^[a-z]{2}-[A-Za-z]{2}$/.test(raw)) return raw;
  return "";
}
function collectTranscriptChunks(node, chunks, seen) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  const transcription = node.audioTranscription || node.audio_transcription;
  if (transcription && typeof transcription === "object") {
    if (typeof transcription.text === "string" && transcription.text.trim()) {
      chunks.push(transcription.text.trim());
    }
    if (Array.isArray(transcription.words)) {
      const line = transcription.words.map((word) => word?.word || word?.text || "").filter(Boolean).join(" ").trim();
      if (line) chunks.push(line);
    }
  }
  if (Array.isArray(node)) {
    node.forEach((item) => collectTranscriptChunks(item, chunks, seen));
    return;
  }
  Object.values(node).forEach((value) => collectTranscriptChunks(value, chunks, seen));
}
function extractGeminiTranscript(payload) {
  const text2 = extractGeminiText(payload);
  if (text2) return text2;
  const chunks = [];
  collectTranscriptChunks(payload, chunks, /* @__PURE__ */ new Set());
  return chunks.join(" ").trim();
}
function geminiUsage(payload) {
  const meta = payload?.usageMetadata || {};
  return {
    prompt_tokens: Number(meta.promptTokenCount) || null,
    completion_tokens: Number(meta.candidatesTokenCount) || null
  };
}
function geminiBlockedReason(payload) {
  if (payload?.promptFeedback?.blockReason) return String(payload.promptFeedback.blockReason);
  const finish = payload?.candidates?.[0]?.finishReason;
  if (finish && !["STOP", "MAX_TOKENS"].includes(finish)) return String(finish);
  return "";
}
var GEMINI_AUDIO_MIME = {
  "audio/wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/mpeg": "audio/mp3",
  "audio/mp3": "audio/mp3",
  "audio/aiff": "audio/aiff",
  "audio/aac": "audio/aac",
  "audio/ogg": "audio/ogg",
  "audio/flac": "audio/flac",
  "audio/m4a": "audio/m4a",
  "audio/x-m4a": "audio/m4a",
  "audio/mp4": "audio/m4a",
  "audio/webm": "audio/webm",
  "audio/weba": "audio/webm",
  "audio/opus": "audio/opus",
  "video/webm": "audio/webm"
};
function sniffGeminiAudio(bytes, mimeType, fileName = "") {
  const head = bytes || new Uint8Array();
  if (head.length >= 12 && head[0] === 82 && head[1] === 73 && head[2] === 70 && head[3] === 70 && head[8] === 87 && head[9] === 65 && head[10] === 86 && head[11] === 69) {
    return { mime: "audio/wav", playable: true };
  }
  if (head.length >= 4 && head[0] === 26 && head[1] === 69 && head[2] === 223 && head[3] === 163) {
    return { mime: "audio/webm", playable: true };
  }
  if (head.length >= 3 && head[0] === 73 && head[1] === 68 && head[2] === 51) return { mime: "audio/mp3", playable: true };
  if (head.length >= 2 && head[0] === 255 && (head[1] & 224) === 224) return { mime: "audio/mp3", playable: true };
  if (head.length >= 8 && head[4] === 102 && head[5] === 116 && head[6] === 121 && head[7] === 112) return { mime: "audio/m4a", playable: true };
  if (head.length >= 4 && head[0] === 79 && head[1] === 103 && head[2] === 103 && head[3] === 83) return { mime: "audio/ogg", playable: true };
  return { mime: geminiAudioMime(mimeType, fileName).mime, playable: false };
}
function geminiAudioMime(mimeType, fileName = "") {
  const base = String(mimeType || "").split(";")[0].trim().toLowerCase();
  const name = String(fileName || "").toLowerCase();
  if (GEMINI_AUDIO_MIME[base]) return { mime: GEMINI_AUDIO_MIME[base], documented: true };
  if (name.endsWith(".weba") || name.endsWith(".webm")) return { mime: "audio/webm", documented: true };
  if (name.endsWith(".wav")) return { mime: "audio/wav", documented: true };
  if (name.endsWith(".mp3")) return { mime: "audio/mp3", documented: true };
  if (name.endsWith(".m4a") || name.endsWith(".mp4")) return { mime: "audio/m4a", documented: true };
  if (name.endsWith(".ogg")) return { mime: "audio/ogg", documented: true };
  return { mime: base || "audio/webm", documented: Boolean(GEMINI_AUDIO_MIME[base]) };
}

// supabase/functions/_shared/ai.js
var NOTE_SHAPE = `{
  "title": "short title from the transcript",
  "short_summary": "one or two sentences",
  "detailed_summary": "a fuller recap of only what was said",
  "key_points": ["point"],
  "decisions": [{"text": "decision", "confidence": "high"}],
  "action_items": [{"title": "task", "description": "details said in the audio", "priority": "medium", "due_date": null, "confidence": "low", "evidence": "exact short quote"}],
  "deadlines": [{"label": "what is due", "date": null, "confidence": "low", "evidence": "exact short quote"}],
  "language": "language of the transcript"
}`;
var GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
var GEMINI_INLINE_AUDIO_LIMIT = 14 * 1024 * 1024;
var OPENAI_AUDIO_LIMIT = 25 * 1024 * 1024;
var readEnv = (name) => Deno.env.get(name);
function providerName(kind) {
  return resolveProvider(kind, readEnv).provider;
}
function providerConfig(kind) {
  const resolved = resolveProvider(kind, readEnv);
  if (!resolved.supported) {
    const error = new Error("provider");
    error.code = "unsupported_provider";
    throw error;
  }
  const key = Deno.env.get(resolved.keyName);
  if (!key) {
    const error = new Error("key");
    error.code = "ai_not_configured";
    throw error;
  }
  return { provider: resolved.provider, key, model: resolved.model };
}
function geminiGenerationConfig(model, extra = {}) {
  const config = { ...extra };
  const name = String(model || "");
  if (/transcribe/i.test(name)) return config;
  if (/gemini-[34]/.test(name)) config.thinkingConfig = { thinkingLevel: "low" };
  return config;
}
function safeDetail(text2) {
  return String(text2 || "").replace(/key[s]?\s*[:=]\s*\S+/gi, "key=redacted").replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]").slice(0, 160);
}
async function throwProvider(response) {
  let detail = "";
  try {
    const body = await response.json();
    detail = String(body?.error?.message || body?.error?.status || "");
  } catch {
    await response.arrayBuffer().catch(() => null);
  }
  const lower = detail.toLowerCase();
  const formatError = /mime|unsupported.*audio|unable to process|audio format|inline_data|invalid argument/.test(lower);
  const code = response.status === 429 ? "rate_limited" : response.status === 503 ? "provider_unavailable" : response.status === 413 ? "file_too_large" : response.status === 401 || response.status === 403 ? "ai_not_configured" : response.status === 408 || response.status === 504 ? "timeout" : formatError ? "unsupported_audio_format" : "processing_failed";
  console.log(JSON.stringify({ providerStatus: response.status, code, detail: safeDetail(detail) }));
  const error = new Error("provider");
  error.code = code;
  error.publicDetail = `Gemini HTTP ${response.status}${safeDetail(detail) ? `: ${safeDetail(detail)}` : ""}`;
  throw error;
}
function parseJsonContent(content) {
  try {
    return JSON.parse(content);
  } catch {
    const start = String(content || "").indexOf("{");
    const end = String(content || "").lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(content.slice(start, end + 1));
    const error = new Error("parse");
    error.code = "invalid_ai_json";
    throw error;
  }
}
async function fetchWithTimeout(url, init, timeoutMs) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const wrapped = new Error("timeout");
    wrapped.code = error?.name === "TimeoutError" ? "timeout" : "processing_failed";
    wrapped.publicDetail = error?.name === "TimeoutError" ? "The Gemini request timed out." : "The Gemini request could not be sent.";
    throw wrapped;
  }
}
async function completeOpenAi(key, model, messages, timeoutMs) {
  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.2, response_format: { type: "json_object" }, messages })
  }, timeoutMs);
  if (!response.ok) await throwProvider(response);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content || "";
  return { parsed: parseJsonContent(content), usage: payload.usage || {} };
}
var GEMINI_BUSY_FALLBACKS = ["gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
function geminiBusy(error) {
  return error?.code === "provider_unavailable" || error?.code === "rate_limited" || /Gemini HTTP (?:500|502|503|504)/.test(String(error?.publicDetail || ""));
}
function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function geminiGenerateOnce(key, model, body, timeoutMs) {
  const response = await fetchWithTimeout(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, timeoutMs);
  if (!response.ok) await throwProvider(response);
  const payload = await response.json();
  const blocked = geminiBlockedReason(payload);
  if (blocked) {
    console.log(JSON.stringify({ geminiFinish: blocked }));
    const error = new Error("blocked");
    error.code = "processing_failed";
    error.publicDetail = `Gemini stopped the response (${blocked}).`;
    throw error;
  }
  return payload;
}
async function geminiGenerate(key, model, body, timeoutMs, maxRetries = 2) {
  let attempt = 0;
  while (true) {
    try {
      return await geminiGenerateOnce(key, model, body, timeoutMs);
    } catch (error) {
      if (!geminiBusy(error) || attempt >= maxRetries) throw error;
      attempt += 1;
      const delayMs = attempt * 1500;
      console.log(JSON.stringify({ geminiRetry: model, code: error.code, attempt, delayMs }));
      await pause(delayMs);
    }
  }
}
async function completeGemini(key, model, messages, timeoutMs) {
  const system = messages.filter((item) => item.role === "system").map((item) => item.content).join("\n\n");
  const contents = messages.filter((item) => item.role !== "system").map((item) => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] }));
  const models = [.../* @__PURE__ */ new Set([model, ...GEMINI_BUSY_FALLBACKS])];
  let lastError;
  for (const name of models) {
    try {
      const payload = await geminiGenerate(key, name, {
        ...system ? { systemInstruction: { parts: [{ text: system }] } } : {},
        contents,
        generationConfig: geminiGenerationConfig(name, { responseMimeType: "application/json" })
      }, timeoutMs);
      if (name !== model) console.log(JSON.stringify({ geminiFallback: name }));
      return { parsed: parseJsonContent(extractGeminiText(payload)), usage: geminiUsage(payload), model: name };
    } catch (error) {
      lastError = error;
      if (!geminiBusy(error) || name === models[models.length - 1]) throw error;
      console.log(JSON.stringify({ geminiBusy: name, code: error.code }));
    }
  }
  throw lastError;
}
async function complete(config, messages, timeoutMs) {
  if (config.provider === "gemini") return completeGemini(config.key, config.model, messages, timeoutMs);
  return completeOpenAi(config.key, config.model, messages, timeoutMs);
}
function toBase64(bytes) {
  const parts = [];
  const chunk = 4096;
  for (let index = 0; index < bytes.length; index += chunk) {
    const slice = bytes.subarray(index, index + chunk);
    let binary = "";
    for (let offset = 0; offset < slice.length; offset += 1) binary += String.fromCharCode(slice[offset]);
    parts.push(binary);
  }
  return btoa(parts.join(""));
}
async function transcribeOpenAi({ key, model, bytes, mimeType, fileName, language }) {
  if (bytes.byteLength > OPENAI_AUDIO_LIMIT) {
    const error = new Error("size");
    error.code = "file_too_large";
    throw error;
  }
  async function send(includeHints) {
    const form = new FormData();
    form.append("file", new File([bytes], fileName || "audio.webm", { type: mimeType || "audio/webm" }));
    form.append("model", model);
    form.append("response_format", "verbose_json");
    if (includeHints) {
      form.append("timestamp_granularities[]", "segment");
      if (language) form.append("language", language);
    }
    const response = await fetchWithTimeout("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form
    }, 12e4);
    if (!response.ok) await throwProvider(response);
    return response.json();
  }
  let payload;
  try {
    payload = await send(true);
  } catch (error) {
    if (error.code === "processing_failed") payload = await send(false);
    else throw error;
  }
  const segments = Array.isArray(payload.segments) ? payload.segments.slice(0, 500).map((segment) => ({
    start: Number(segment.start) || 0,
    end: Number(segment.end) || 0,
    text: String(segment.text || "").trim()
  })).filter((segment) => segment.text) : [];
  return {
    text: String(payload.text || "").trim(),
    language: payload.language || null,
    duration: Number.isFinite(Number(payload.duration)) ? Number(payload.duration) : null,
    segments,
    provider: "openai",
    model
  };
}
function transcriptFromGemini(payload) {
  const raw = extractGeminiTranscript(payload).trim();
  if (!raw) {
    const parts = payload?.candidates?.[0]?.content?.parts;
    console.log(JSON.stringify({
      emptyTranscript: true,
      finish: payload?.candidates?.[0]?.finishReason || payload?.promptFeedback?.blockReason || "",
      partKeys: Array.isArray(parts) ? parts.map((part) => Object.keys(part || {})) : []
    }));
    const error = new Error("empty");
    error.code = "empty_transcript";
    throw error;
  }
  try {
    const parsed = parseJsonContent(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.text === "string") {
      return {
        text: parsed.text.trim(),
        language: parsed.language ? String(parsed.language).slice(0, 10) : null
      };
    }
  } catch {
  }
  return { text: raw, language: null };
}
async function transcribeGemini({ key, model, bytes, mimeType, fileName, language }) {
  if (bytes.byteLength > GEMINI_INLINE_AUDIO_LIMIT) {
    const error = new Error("size");
    error.code = "file_too_large";
    throw error;
  }
  const sniffed = sniffGeminiAudio(bytes, mimeType, fileName);
  if (!sniffed.playable) {
    const invalid = new Error("audio");
    invalid.code = "unsupported_audio_format";
    invalid.publicDetail = "The saved file does not start with WAV, WebM, MP3, M4A, or OGG audio. Record it again.";
    throw invalid;
  }
  const { mime } = sniffed.playable ? sniffed : geminiAudioMime(mimeType, fileName);
  const sttModel = /transcribe/i.test(model) ? model : "gemini-3.5-transcribe";
  const languageCode = geminiLanguageHint(language);
  console.log(JSON.stringify({
    transcribe: "gemini",
    model: sttModel,
    mime,
    bytes: bytes.byteLength,
    fileName: String(fileName || "").slice(0, 80),
    language: "auto"
  }));
  const audioPart = { inlineData: { mimeType: mime, data: toBase64(bytes) } };
  try {
    const payload = await geminiGenerate(key, sttModel, {
      contents: [{ parts: [audioPart] }]
    }, 12e4);
    const parsed = transcriptFromGemini(payload);
    return {
      text: parsed.text,
      language: parsed.language || languageCode || null,
      duration: null,
      segments: [],
      provider: "gemini",
      model: sttModel
    };
  } catch (error) {
    if (["ai_not_configured", "rate_limited", "file_too_large"].includes(error.code)) throw error;
    if (error.publicDetail && /does not start with/.test(error.publicDetail)) throw error;
    console.log(JSON.stringify({ transcribeFallback: error.code || "unknown", detail: String(error.publicDetail || "").slice(0, 160) }));
    try {
      const fallback = await geminiGenerate(key, "gemini-3.8-flash", {
        contents: [{
          parts: [
            audioPart,
            { text: "Transcribe the spoken words in this audio. Return only the transcript." }
          ]
        }],
        generationConfig: geminiGenerationConfig("gemini-3.8-flash")
      }, 12e4);
      const parsed = transcriptFromGemini(fallback);
      return {
        text: parsed.text,
        language: parsed.language || languageCode || null,
        duration: null,
        segments: [],
        provider: "gemini",
        model: "gemini-3.8-flash"
      };
    } catch (fallbackError) {
      if (error.publicDetail && !String(fallbackError.publicDetail || "").includes(error.publicDetail)) {
        fallbackError.publicDetail = `${fallbackError.publicDetail || ""} First attempt: ${error.publicDetail}`.trim();
      }
      throw fallbackError;
    }
  }
}
async function transcribeAudio({ bytes, mimeType, fileName, language }) {
  const config = providerConfig("stt");
  if (config.provider === "gemini") return transcribeGemini({ ...config, bytes, mimeType, fileName, language });
  return transcribeOpenAi({ ...config, bytes, mimeType, fileName, language });
}
async function generateNotes({ transcript, style, errors }) {
  const config = providerConfig("llm");
  const clipped = transcript.slice(0, 24e3);
  const repair = errors?.length ? `The previous JSON failed validation: ${errors.join("; ")}. Return corrected JSON only.` : "";
  const result = await complete(config, [
    {
      role: "system",
      content: `You extract notes from a transcript. Use only facts present in the transcript. If a name, date, decision, or commitment is not explicit, leave it out or mark confidence as low and use null for the date. Do not guess a calendar date from a relative phrase. Evidence must be a short exact quote from the transcript. Summary style: ${style || "balanced"}. ${repair} Respond as JSON with this shape: ${NOTE_SHAPE}`
    },
    { role: "user", content: clipped }
  ], 6e4);
  return { ...result, provider: config.provider, model: result.model || config.model, truncated: transcript.length > clipped.length };
}

// supabase/functions/_shared/auth.js
import { createClient } from "npm:@supabase/supabase-js@2";
async function requireUser(req) {
  const header = req.headers.get("Authorization") || "";
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceKey) {
    const error2 = new Error("config");
    error2.code = "ai_not_configured";
    error2.status = 500;
    throw error2;
  }
  if (!header.startsWith("Bearer ")) {
    const error2 = new Error("auth");
    error2.code = "unauthorized";
    throw error2;
  }
  const userClient = createClient(url, anon, { global: { headers: { Authorization: header } }, auth: { persistSession: false } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    const authError = new Error("auth");
    authError.code = "unauthorized";
    throw authError;
  }
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: profile, error: profileError } = await service.from("profiles").select("id, role, account_status, email, full_name").eq("id", data.user.id).single();
  if (profileError || !profile) {
    const missing = new Error("profile");
    missing.code = "unauthorized";
    throw missing;
  }
  if (profile.account_status !== "active") {
    const inactive = new Error("inactive");
    inactive.code = "account_deactivated";
    throw inactive;
  }
  return { user: data.user, profile, service };
}

// supabase/functions/_shared/http.js
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var MESSAGES = {
  unauthorized: "Log in to continue.",
  account_deactivated: "This account is deactivated.",
  forbidden: "You do not have access to this action.",
  ai_not_configured: "Speech-to-text or the language model is not configured on the server.",
  unsupported_provider: "The configured AI provider is not available in this deployment.",
  rate_limited: "The hourly AI limit or the provider rate limit was reached. Try again later.",
  empty_transcript: "No speech was detected in this audio.",
  invalid_ai_json: "The AI response failed validation. You can retry.",
  missing_audio: "The audio file could not be found in private storage.",
  file_too_large: "This audio file exceeds the provider size limit.",
  timeout: "The AI request timed out. You can retry.",
  payload_too_large: "The request is too large.",
  invalid_json: "The request could not be read.",
  invalid_action: "That admin action is not supported.",
  empty_question: "Enter a question about this note.",
  not_found: "That item was not found in your account.",
  retry_exhausted: "This job has reached the retry limit.",
  processing_failed: "Processing failed. You can retry if the recording is still available.",
  provider_unavailable: "The AI service is busy right now. Ask again in a moment.",
  unsupported_audio_format: "Gemini could not read this audio file. Record again or upload a WAV, MP3, or M4A file.",
  invalid_setting: "That setting value is not allowed.",
  retry_in_progress: "A retry is already queued or running for this recording.",
  confirmation_required: "Type DELETE to confirm account deletion."
};
function safeReason(value) {
  return String(value || "").replace(/AIza[0-9A-Za-z_-]{10,}/g, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\b(api[_ ]?key|service[_ ]?role|secret)\b\s*[:=]\s*\S+/gi, "$1=[redacted]").replace(/\s+/g, " ").trim().slice(0, 180);
}
function publicError(error) {
  const known = Boolean(MESSAGES[error?.code]);
  const code = known ? error.code : "processing_failed";
  const reason = safeReason(error?.publicDetail || (known ? "" : error?.message || error?.details || error?.hint || ""));
  const base = MESSAGES[code];
  const message = reason ? `${base} ${reason}` : base;
  return { code, message, status: error?.status || (code === "unauthorized" ? 401 : code === "forbidden" || code === "account_deactivated" ? 403 : code === "not_found" ? 404 : code === "rate_limited" ? 429 : code === "provider_unavailable" ? 503 : 400) };
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
function fail(error) {
  const mapped = publicError(error);
  return json({ ok: false, error: { code: mapped.code, message: mapped.message } }, mapped.status);
}
async function readBody(req, limit = 2e4) {
  let raw = "";
  try {
    raw = await req.text();
  } catch {
    const error = new Error("body");
    error.code = "invalid_json";
    error.publicDetail = "The request body stream could not be read.";
    throw error;
  }
  raw = String(raw || "").replace(/^\uFEFF/, "").trim();
  if (raw.length > limit) {
    const error = new Error("large");
    error.code = "payload_too_large";
    throw error;
  }
  if (!raw) return {};
  try {
    let parsed = JSON.parse(raw);
    if (typeof parsed === "string") {
      const inner = parsed.trim();
      if (inner.startsWith("{") || inner.startsWith("[")) parsed = JSON.parse(inner);
      else return {};
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    const error = new Error("json");
    error.code = "invalid_json";
    error.publicDetail = "Body must be a JSON object.";
    throw error;
  }
}
function servePost(handler) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return fail(Object.assign(new Error("method"), { code: "invalid_json", status: 405 }));
    try {
      return await handler(req);
    } catch (error) {
      const mapped = publicError(error);
      console.log(JSON.stringify({ code: mapped.code, detail: mapped.message }));
      return json({ ok: false, error: { code: mapped.code, message: mapped.message } }, mapped.status);
    }
  });
}

// supabase/functions/_shared/usage.js
async function assertWithinRateLimit(service, userId) {
  const { data } = await service.from("application_settings").select("value").eq("key", "ai_hourly_limit").maybeSingle();
  const limit = Number(data?.value ?? 30);
  const since = new Date(Date.now() - 60 * 60 * 1e3).toISOString();
  const { count, error } = await service.from("ai_usage_events").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  if (error) throw error;
  if ((count || 0) >= limit) {
    const limitError = new Error("limit");
    limitError.code = "rate_limited";
    throw limitError;
  }
}
async function recordUsage(service, row) {
  const { error } = await service.from("ai_usage_events").insert(row);
  if (error) console.log(JSON.stringify({ code: "usage_log_failed" }));
}

// supabase/functions/_shared/validateNotes.js
var CONFIDENCE = /* @__PURE__ */ new Set(["high", "low"]);
var PRIORITY = /* @__PURE__ */ new Set(["low", "medium", "high"]);
var DATE = /^\d{4}-\d{2}-\d{2}$/;
function text(value, max = 4e3) {
  return String(value ?? "").trim().slice(0, max);
}
function asArray(value, errors, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return [];
  }
  return value.slice(0, 30);
}
function validateAiNotes(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["Response was not an object"] };
  }
  const title = text(input.title, 160);
  const shortSummary = text(input.short_summary, 800);
  const detailedSummary = text(input.detailed_summary, 6e3);
  if (!title) errors.push("Missing title");
  if (!shortSummary) errors.push("Missing short summary");
  const keyPoints = asArray(input.key_points, errors, "key_points").map((item) => text(item, 400)).filter(Boolean);
  const decisions = asArray(input.decisions, errors, "decisions").map((item, index) => {
    const line = text(item?.text, 500);
    if (!line) errors.push(`decisions[${index}] missing text`);
    return { text: line, confidence: CONFIDENCE.has(item?.confidence) ? item.confidence : "low" };
  }).filter((item) => item.text);
  const actionItems = asArray(input.action_items, errors, "action_items").map((item, index) => {
    const itemTitle = text(item?.title, 200);
    if (!itemTitle) errors.push(`action_items[${index}] missing title`);
    const due = item?.due_date == null || item.due_date === "" ? null : text(item.due_date, 20);
    return {
      title: itemTitle,
      description: text(item?.description, 800),
      priority: PRIORITY.has(item?.priority) ? item.priority : "medium",
      due_date: due && DATE.test(due) ? due : null,
      confidence: CONFIDENCE.has(item?.confidence) ? item.confidence : "low",
      evidence: text(item?.evidence, 400)
    };
  }).filter((item) => item.title);
  const deadlines = asArray(input.deadlines, errors, "deadlines").map((item) => {
    const date = item?.date == null || item.date === "" ? null : text(item.date, 20);
    return {
      label: text(item?.label, 200) || "Deadline",
      date: date && DATE.test(date) ? date : null,
      confidence: CONFIDENCE.has(item?.confidence) ? item.confidence : "low",
      evidence: text(item?.evidence, 400)
    };
  });
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      short_summary: shortSummary,
      detailed_summary: detailedSummary,
      key_points: keyPoints,
      decisions,
      action_items: actionItems,
      deadlines,
      language: text(input.language, 40) || null
    }
  };
}
function compact(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}
function groundExtractions(note, transcript) {
  const source = compact(transcript);
  const deadlines = (note.deadlines || []).map((item) => {
    const evidence = compact(item.evidence);
    const evidenceOk = evidence.length > 8 && source.includes(evidence);
    if (!evidenceOk || item.confidence !== "high" || !item.date) {
      return {
        ...item,
        date: null,
        confidence: "low",
        warning: "This deadline was not confidently identified in the transcript."
      };
    }
    return { ...item, warning: null };
  });
  const actionItems = (note.action_items || []).map((item) => {
    const evidence = compact(item.evidence);
    const evidenceOk = evidence.length > 8 && source.includes(evidence);
    const dueDate = item.confidence === "high" && evidenceOk ? item.due_date : null;
    const warning = item.confidence === "high" && evidenceOk ? null : "This action item was not confidently identified. Review it before relying on it.";
    return { ...item, due_date: dueDate, warning };
  });
  return { ...note, deadlines, action_items: actionItems };
}

// supabase/functions/process-audio/index.js
servePost(async (req) => {
  const { user, service } = await requireUser(req);
  const body = await readBody(req);
  if (body.regenerate) return regenerate(service, user, body.noteId);
  return runJob(service, user, body);
});
async function runJob(service, user, body) {
  const { data: job, error } = await service.from("processing_jobs").select("*").eq("id", body.jobId).eq("user_id", user.id).maybeSingle();
  if (error || !job) {
    const missing = new Error("missing");
    missing.code = "not_found";
    throw missing;
  }
  if (job.status === "completed") return json({ ok: true, data: { done: true, noteId: job.note_id, stage: "completed" } });
  if (job.status === "failed" && !body.retry) {
    return json({ ok: true, data: { done: false, failed: true, stage: job.current_stage, error: job.error_message } });
  }
  if (body.retry) {
    if (job.retry_count >= 50) {
      const exhausted = new Error("retry");
      exhausted.code = "retry_exhausted";
      throw exhausted;
    }
    await service.from("processing_jobs").update({
      status: "queued",
      error_code: null,
      error_message: null,
      locked_at: null,
      retry_count: job.retry_count + 1
    }).eq("id", job.id);
  }
  const { data: claimedRow, error: claimError } = await service.rpc("claim_processing_job", { target_id: job.id, owner_id: user.id });
  if (claimError) {
    const claimFailed = new Error("claim");
    claimFailed.code = "processing_failed";
    claimFailed.publicDetail = claimError.message || "The processing job could not be claimed.";
    throw claimFailed;
  }
  const claimed = Array.isArray(claimedRow) ? claimedRow[0] : claimedRow;
  if (!claimed) return json({ ok: true, data: { inProgress: true, stage: job.current_stage } });
  try {
    await assertWithinRateLimit(service, user.id);
    const { data: audio } = await service.from("audio_files").select("*").eq("id", job.audio_file_id).eq("user_id", user.id).maybeSingle();
    if (!audio || audio.removed_at) {
      const missingAudio = new Error("audio");
      missingAudio.code = "missing_audio";
      throw missingAudio;
    }
    let note = await loadNote(service, user.id, claimed.note_id, audio.id);
    if (!note?.transcript?.trim()) {
      await setStage(service, job.id, "transcribing");
      const transcript = await transcribe(service, user.id, job.id, audio);
      note = await saveTranscript(service, user.id, note, audio, transcript);
      await service.from("processing_jobs").update({
        status: "queued",
        current_stage: "generating_notes",
        note_id: note.id,
        locked_at: null
      }).eq("id", job.id);
      return json({ ok: true, data: { continue: true, stage: "generating_notes", noteId: note.id } });
    }
    await setStage(service, job.id, "generating_notes");
    const { data: prefs } = await service.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle();
    const generated = await generateValidated(service, user.id, job.id, note.transcript, prefs?.summary_style);
    await setStage(service, job.id, "extracting_actions");
    await service.from("notes").update({
      title: note.title && note.title !== "Untitled note" ? note.title : generated.title,
      short_summary: generated.short_summary,
      detailed_summary: generated.truncated ? `Only the first portion of a long transcript was sent to the model.

${generated.detailed_summary}` : generated.detailed_summary,
      key_points: generated.key_points,
      decisions: generated.decisions,
      action_items: generated.action_items,
      deadlines: generated.deadlines,
      language: generated.language || note.language,
      processing_status: "completed"
    }).eq("id", note.id);
    if (prefs?.auto_create_tasks) await insertTasks(service, user.id, note.id, generated.action_items);
    await setStage(service, job.id, "saving");
    if (prefs && prefs.retain_audio === false) {
      await service.storage.from("voice-recordings").remove([audio.storage_path]);
      await service.from("audio_files").update({ removed_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", audio.id);
    }
    await service.from("processing_jobs").update({
      status: "completed",
      current_stage: "completed",
      note_id: note.id,
      locked_at: null,
      error_code: null,
      error_message: null,
      completed_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", job.id);
    return json({ ok: true, data: { done: true, noteId: note.id, stage: "completed" } });
  } catch (error2) {
    const mapped = publicError(error2);
    await service.from("processing_jobs").update({
      status: "failed",
      error_code: mapped.code,
      error_message: mapped.message,
      locked_at: null
    }).eq("id", job.id);
    throw error2;
  }
}
async function regenerate(service, user, noteId) {
  const { data: note } = await service.from("notes").select("*").eq("id", noteId).eq("user_id", user.id).maybeSingle();
  if (!note) {
    const missing = new Error("missing");
    missing.code = "not_found";
    throw missing;
  }
  if (!note.transcript?.trim()) {
    const empty = new Error("empty");
    empty.code = "empty_transcript";
    throw empty;
  }
  await assertWithinRateLimit(service, user.id);
  await service.from("notes").update({ processing_status: "processing" }).eq("id", note.id);
  try {
    const { data: prefs } = await service.from("user_preferences").select("summary_style").eq("user_id", user.id).maybeSingle();
    const generated = await generateValidated(service, user.id, null, note.transcript, prefs?.summary_style);
    await service.from("notes").update({
      short_summary: generated.short_summary,
      detailed_summary: generated.detailed_summary,
      key_points: generated.key_points,
      decisions: generated.decisions,
      action_items: generated.action_items,
      deadlines: generated.deadlines,
      language: generated.language || note.language,
      processing_status: "completed"
    }).eq("id", note.id);
    return json({ ok: true, data: { done: true, noteId: note.id } });
  } catch (error) {
    await service.from("notes").update({ processing_status: "failed" }).eq("id", note.id);
    throw error;
  }
}
async function loadNote(service, userId, noteId, audioId) {
  if (noteId) {
    const { data: data2 } = await service.from("notes").select("*").eq("id", noteId).eq("user_id", userId).maybeSingle();
    if (data2) return data2;
  }
  const { data } = await service.from("notes").select("*").eq("audio_file_id", audioId).eq("user_id", userId).maybeSingle();
  return data;
}
async function transcribe(service, userId, jobId, audio) {
  const { data: file, error } = await service.storage.from("voice-recordings").download(audio.storage_path);
  if (error || !file) {
    const missing = new Error("audio");
    missing.code = "missing_audio";
    throw missing;
  }
  const { data: prefs } = await service.from("user_preferences").select("preferred_language").eq("user_id", userId).maybeSingle();
  try {
    const result = await transcribeAudio({
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: audio.mime_type,
      fileName: audio.file_name,
      language: prefs?.preferred_language || ""
    });
    if (!result.text) {
      const empty = new Error("empty");
      empty.code = "empty_transcript";
      throw empty;
    }
    await recordUsage(service, {
      user_id: userId,
      job_id: jobId,
      operation: "transcribe",
      provider: result.provider,
      model: result.model,
      status: "success",
      audio_seconds: result.duration
    });
    if (!audio.duration_seconds && result.duration) {
      await service.from("audio_files").update({ duration_seconds: result.duration }).eq("id", audio.id);
    }
    return result;
  } catch (error2) {
    await recordUsage(service, {
      user_id: userId,
      job_id: jobId,
      operation: "transcribe",
      provider: providerName("stt"),
      status: "failed",
      error_code: error2.code || "processing_failed"
    });
    throw error2;
  }
}
async function saveTranscript(service, userId, existing, audio, transcript) {
  const payload = {
    user_id: userId,
    audio_file_id: audio.id,
    transcript: transcript.text,
    segments: transcript.segments,
    language: transcript.language,
    speaker_labels_supported: false,
    processing_status: "processing",
    title: existing?.title || "Untitled note"
  };
  if (existing?.id) {
    const { data: data2, error: error2 } = await service.from("notes").update(payload).eq("id", existing.id).select().single();
    if (error2) throw error2;
    return data2;
  }
  const { data, error } = await service.from("notes").insert(payload).select().single();
  if (error) throw error;
  return data;
}
async function generateValidated(service, userId, jobId, transcript, style) {
  let errors = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await generateNotes({ transcript, style, errors });
      const validated = validateAiNotes(result.parsed);
      if (!validated.ok) {
        errors = validated.errors;
        continue;
      }
      await recordUsage(service, {
        user_id: userId,
        job_id: jobId,
        operation: "generate_notes",
        provider: result.provider,
        model: result.model,
        status: "success",
        input_tokens: result.usage?.prompt_tokens || null,
        output_tokens: result.usage?.completion_tokens || null
      });
      return { ...groundExtractions(validated.value, transcript), truncated: result.truncated };
    } catch (error) {
      if (error.code === "invalid_ai_json" && attempt === 0) {
        errors = ["Response was not valid JSON"];
        continue;
      }
      await recordUsage(service, {
        user_id: userId,
        job_id: jobId,
        operation: "generate_notes",
        provider: providerName("llm"),
        status: "failed",
        error_code: error.code || "processing_failed"
      });
      throw error;
    }
  }
  await recordUsage(service, {
    user_id: userId,
    job_id: jobId,
    operation: "generate_notes",
    provider: providerName("llm"),
    status: "failed",
    error_code: "invalid_ai_json"
  });
  const invalid = new Error("schema");
  invalid.code = "invalid_ai_json";
  throw invalid;
}
async function insertTasks(service, userId, noteId, items) {
  const rows = (items || []).filter((item) => item.title).map((item) => ({
    user_id: userId,
    note_id: noteId,
    title: item.title,
    description: item.description || "",
    priority: item.priority || "medium",
    status: "pending",
    due_date: item.confidence === "high" ? item.due_date : null,
    confidence: item.confidence || "low"
  }));
  if (rows.length) await service.from("tasks").insert(rows);
}
async function setStage(service, jobId, stage) {
  await service.from("processing_jobs").update({ current_stage: stage, status: "processing" }).eq("id", jobId);
}
