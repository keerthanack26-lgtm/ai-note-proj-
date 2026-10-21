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

// supabase/functions/_shared/ai.js
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
async function answerQuestion({ note, question, history }) {
  const config = providerConfig("llm");
  const context = JSON.stringify({
    title: note.title,
    transcript: String(note.transcript || "").slice(0, 24e3),
    short_summary: note.short_summary,
    detailed_summary: note.detailed_summary,
    key_points: note.key_points,
    decisions: note.decisions,
    action_items: note.action_items,
    deadlines: note.deadlines
  });
  const messages = [
    {
      role: "system",
      content: 'Answer only from the supplied note JSON. If the note does not contain the answer, say that clearly and set missing_information to true. Do not claim you sent a reminder, created a calendar event, or completed a task. Respond as JSON: {"answer":"","grounded":true,"missing_information":false}'
    },
    { role: "user", content: `Note:
${context}` },
    ...history.map((item) => ({ role: item.role === "assistant" ? "assistant" : "user", content: String(item.content || "").slice(0, 2e3) })),
    { role: "user", content: question }
  ];
  const result = await complete(config, messages, 45e3);
  return { ...result, provider: config.provider, model: result.model || config.model };
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
async function settingValue(service, key, fallback) {
  const { data } = await service.from("application_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? fallback;
}

// supabase/functions/_shared/validateNotes.js
function text(value, max = 4e3) {
  return String(value ?? "").trim().slice(0, max);
}
function validateChatAnswer(input) {
  if (!input || typeof input !== "object" || !text(input.answer, 4e3)) {
    return { ok: false, errors: ["Missing answer"] };
  }
  return {
    ok: true,
    value: {
      answer: text(input.answer, 4e3),
      grounded: input.grounded !== false,
      missing_information: Boolean(input.missing_information)
    }
  };
}

// supabase/functions/chat-with-note/index.js
function hasContent(note) {
  const chunks = [note.transcript, note.short_summary, note.detailed_summary, ...note.key_points || []];
  return chunks.some((item) => String(item || "").trim());
}
servePost(async (req) => {
  const { user, service } = await requireUser(req);
  const body = await readBody(req);
  const question = String(body.question || "").trim();
  const limit = Number(await settingValue(service, "chat_max_input_chars", 2e3));
  if (!question) {
    const error = new Error("empty");
    error.code = "empty_question";
    throw error;
  }
  if (question.length > limit) {
    const error = new Error("long");
    error.code = "payload_too_large";
    throw error;
  }
  const { data: note } = await service.from("notes").select("*").eq("id", body.noteId).eq("user_id", user.id).maybeSingle();
  if (!note) {
    const missing = new Error("missing");
    missing.code = "not_found";
    throw missing;
  }
  if (!hasContent(note)) {
    return json({
      ok: true,
      data: {
        answer: "This note does not contain information to answer that question.",
        grounded: true,
        missingInformation: true
      }
    });
  }
  await assertWithinRateLimit(service, user.id);
  const historyEnabled = await settingValue(service, "chat_history_enabled", true);
  const { data: history } = historyEnabled ? await service.from("note_chat_messages").select("role, content").eq("note_id", note.id).eq("user_id", user.id).order("created_at", { ascending: false }).limit(8) : { data: [] };
  try {
    const result = await answerQuestion({ note, question, history: (history || []).reverse() });
    let answer;
    try {
      const validated = validateChatAnswer(result.parsed);
      if (!validated.ok) throw new Error("schema");
      answer = validated.value;
    } catch {
      const invalid = new Error("schema");
      invalid.code = "invalid_ai_json";
      throw invalid;
    }
    await recordUsage(service, {
      user_id: user.id,
      operation: "chat",
      provider: result.provider,
      model: result.model,
      status: "success",
      input_tokens: result.usage?.prompt_tokens || null,
      output_tokens: result.usage?.completion_tokens || null
    });
    let messageId = null;
    if (historyEnabled !== false) {
      const { data: rows } = await service.from("note_chat_messages").insert([
        { user_id: user.id, note_id: note.id, role: "user", content: question },
        {
          user_id: user.id,
          note_id: note.id,
          role: "assistant",
          content: answer.answer,
          grounded: answer.grounded,
          missing_information: answer.missing_information
        }
      ]).select("id, role");
      messageId = rows?.find((row) => row.role === "assistant")?.id || null;
    }
    return json({
      ok: true,
      data: {
        answer: answer.answer,
        grounded: answer.grounded,
        missingInformation: answer.missing_information,
        messageId
      }
    });
  } catch (error) {
    await recordUsage(service, {
      user_id: user.id,
      operation: "chat",
      provider: providerName("llm"),
      status: "failed",
      error_code: error.code || "processing_failed"
    });
    throw error;
  }
});
