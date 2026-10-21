# VoiceNote AI

Speak naturally. Capture intelligently. Get things done.

VoiceNote AI is a React and Supabase application. Signed-in users record or upload audio, store it in a private bucket, and run a resumable processing job. Supabase Edge Functions call the configured speech-to-text and language-model providers, then save a transcript, summary, key points, decisions, action items, and deadlines. Users can edit notes, chat with one note, manage tasks, and export TXT or PDF files. Administrators see account metadata and aggregate health, not private note content.

The app does not invent a successful transcription when a provider key is missing or a job fails. The screen shows the error returned by the Edge Function.

## Stack

- React JS, Vite, React Router
- Supabase Auth, Postgres, Storage, Row Level Security, and Edge Functions
- Google Gemini (default when `GEMINI_API_KEY` is set) or OpenAI, chosen by Edge Function secrets
- Adapters live in `supabase/functions/_shared/ai.js`; selection rules in `supabase/functions/_shared/providers.js`

There is no Express, Firebase, or .NET server.

## Local setup

1. Install Node.js 20 or newer.
2. In this folder, install dependencies:

```bash
npm install
```

3. Copy the environment example:

```bash
copy .env.example .env
```

4. Create a project at [supabase.com](https://supabase.com). In Project Settings, API, copy the project URL and the publishable (anon) key into `.env`:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Do not put the service-role key or any AI key in `.env`. Values that start with `VITE_` are visible in the browser.

5. Install the [Supabase CLI](https://supabase.com/docs/guides/cli), log in, and link the project:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

6. Apply the database, storage bucket, and security policies:

```bash
npx supabase db push
```

You can instead paste `supabase/migrations/20261017120000_init.sql` into the Supabase SQL editor and run it once.

7. Confirm the private bucket `voice-recordings` exists and its public flag is off. The migration creates it. In Storage, a file path must look like `{user-id}/{file-id}.webm`.

8. Set the AI secret. Hosted functions already receive `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Add your Google AI Studio key as an Edge Function secret. Replace the placeholder in your terminal only; never paste the key into a file or chat:

```bash
npx supabase secrets set GEMINI_API_KEY=YOUR_ACTUAL_API_KEY
```

Dashboard alternative: open your project, go to **Edge Functions**, open the **Secrets** tab, click **Add new secret**, enter the name `GEMINI_API_KEY` and the value, and save.

When `GEMINI_API_KEY` is the only AI secret, Gemini handles summaries, key points, decisions, action items, deadlines, note chat, and transcription. Leave it unset if you are not ready; those features show a configuration error instead of fake text. See "AI providers" below for OpenAI and model overrides.

9. Deploy the functions:

```bash
npx supabase functions deploy process-audio
npx supabase functions deploy chat-with-note
npx supabase functions deploy admin-operations
npx supabase functions deploy cleanup-audio
npx supabase functions deploy delete-account
```

10. In Authentication, URL configuration, add:

- Site URL: `http://localhost:5173`
- Redirect URLs: `http://localhost:5173/**` and your production URL

For local development you can turn off “Confirm email” so a new account can sign in immediately. Production should keep confirmation on. Password reset emails return to `/reset-password`.

11. Start the app:

```bash
npm run dev
```

Open `http://localhost:5173`.

## Create the first administrator

Registration always creates a User. Promote one account from the SQL editor after that person has signed up. This bypasses the client because the SQL editor is not an end-user request:

```sql
update public.profiles
set role = 'admin'
where email = 'you@example.com';
```

There is no role picker on the registration form. A normal signed-in request cannot change `role` or `account_status`.

## AI providers

All AI calls run inside Edge Functions. The browser never holds a provider key. Provider selection lives in `supabase/functions/_shared/providers.js` and the HTTP adapters in `supabase/functions/_shared/ai.js`.

| Secret | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Google AI Studio key. Used for notes and chat, and for transcription when no OpenAI speech key exists. |
| `SPEECH_TO_TEXT_API_KEY` | Optional OpenAI key for `whisper-1` transcription with segment timestamps. |
| `LLM_API_KEY` | Optional OpenAI key for notes and chat when `LLM_PROVIDER=openai`. |
| `LLM_PROVIDER`, `STT_PROVIDER` | Optional. `gemini` or `openai`. Defaults: Gemini for the language model when `GEMINI_API_KEY` exists; OpenAI for speech when `SPEECH_TO_TEXT_API_KEY` exists, otherwise Gemini. |
| `LLM_MODEL`, `STT_MODEL` | Optional model overrides. Gemini default is `gemini-3.8-flash`. OpenAI defaults are `gpt-4o-mini` and `whisper-1`. |

Gemini requests go to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with the key in the `x-goog-api-key` header and `responseMimeType: application/json`. The functions read the key with `Deno.env.get("GEMINI_API_KEY")`. If it is missing, the response is `{ ok: false, error: { code: "ai_not_configured" } }` and the job is marked failed. The key is never logged or returned.

What to expect:

- Speaker labels: not available from either adapter. The editor says so.
- Timestamps: OpenAI returns segments; Gemini transcription returns plain text only.
- Gemini transcription sends the audio inline, so files above 14 MB return `file_too_large`. Gemini documents WAV, MP3, AIFF, AAC, OGG, and FLAC. Browser recordings are WebM, which is not on that list, so a recording may be rejected by the provider. Upload an MP3 or WAV, or set an OpenAI speech key, if that happens.
- Dates are kept only when the model quotes a matching phrase from the transcript and marks the item high confidence. Other dates are stored with a warning and no calendar date.
- Email and push task reminders are not configured. The app shows overdue and upcoming tasks in the interface.

Setting a provider to anything other than `gemini` or `openai` returns an unsupported-provider error.

### Verify the secret without exposing it

1. Run `npx supabase secrets list`. The name `GEMINI_API_KEY` should appear with a hashed value. The real value is never printed.
2. Log in as the admin and open the Admin dashboard. Under Service health, "Language model configured" shows Yes and the provider line shows `gemini (gemini-3.8-flash)`. This is computed in the Edge Function from the presence of the secret, not from the browser.
3. Open a note that has transcript text and ask a question. A grounded answer means the function reached Gemini. If the secret is missing, the chat shows "Speech-to-text or the language model is not configured on the server."
4. Error cases to try: temporarily unset the secret with `npx supabase secrets unset GEMINI_API_KEY`, redeploy, and confirm the configuration error appears; send an empty question and confirm the input error; ask about something the note does not mention and confirm the "Not found in this note" badge.

## Roles

| Role | Access |
| --- | --- |
| User | Own profile, audio, jobs, notes, tasks, and chat |
| Admin | User metadata, account activation, job status, AI success and failure counts, reported issues, and non-secret settings |

Admin responses do not include transcripts, note bodies, chat, task descriptions, or audio files.

## Scripts

```bash
npm run dev
npm run build
npm test
```

`npm test` checks audio validation, export filenames, and AI JSON grounding. It does not call OpenAI or Supabase.

## Deploy

### Supabase

Complete the local setup steps so migrations, the private bucket, RLS, secrets, and Edge Functions are already applied on the hosted project.

### Vercel

1. Import this folder as a Vite project.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Vercel project environment. Do not add secret keys.
3. Add the Vercel URL to Supabase Authentication redirect URLs.
4. Deploy. `vercel.json` sends unknown paths back to `index.html` so refresh works on client routes.
5. Sign in, upload a short audio file, and confirm a real transcript only after the AI secrets are set. Confirm a second normal user cannot open `/admin`.

## Manual test checklist

Use two accounts. Promote only one with the SQL above. Do not put production keys in automated tests.

- Register, log in, log out, and reset a password from the email link.
- A new account lands on the user dashboard. The admin account lands on `/admin`.
- A normal user who opens `/admin` sees the unauthorized page.
- Deny the microphone and confirm the record page explains it. Record, pause or resume when the browser allows it, preview, discard, and save.
- Upload a valid audio file and see measured upload progress. Reject a non-audio file and a file over the limit. Cancel an upload before processing.
- With AI secrets set, follow a job from preparing through completed and open the note. With secrets missing, the job fails with a configuration message and does not show a transcript.
- Edit, rename, save, search, filter, sort, export TXT, export PDF, and delete a note.
- Regenerate a summary from a saved transcript. Confirm suggested tasks before adding them, unless auto-create is enabled in settings.
- Ask the note chat a question that the note can answer and one it cannot. The second answer should say the information is not in the note.
- Create, edit, complete, reopen, and delete a task. Overdue and upcoming sections follow the due date.
- Delete a recording from history and confirm whether the note is removed.
- Deactivate a user from the admin dashboard and confirm that account can no longer use the app. Activate it again.
- Delete an account only after typing DELETE. Confirm the auth user and stored audio are removed.
- Check a phone-width layout: the sidebar becomes a menu and the bottom navigation is usable.

## Privacy checks you can run in the SQL editor

After signing in as a normal user, the API should refuse another user’s rows. As an admin, this query is expected to work, and it still must not be used to browse note text from the admin screen:

```sql
select id, email, role, account_status from public.profiles order by created_at desc;
```

The admin UI does not query `notes`, `note_chat_messages`, or storage objects for other people.

## Project layout

- `src/pages` screens and routes
- `src/components` shared interface pieces
- `src/services` browser calls to Postgres, Storage, and Edge Functions
- `supabase/migrations` tables, triggers, RLS, and the private bucket
- `supabase/functions` server-side transcription, notes, chat, admin actions, and deletion

## Checklist

Implemented:

- Landing, registration, login, password reset, dashboards, recording, upload, processing, editor, notes, chat, tasks, history, settings, issue reports, admin, 404, and unauthorized routes
- User and Admin roles only, with the admin role assigned outside registration
- Private `voice-recordings` bucket, owner-only storage policies, and signed playback URLs
- Row Level Security on user-owned tables and database triggers that block role and status changes
- Edge Functions for processing, chat, admin operations, audio cleanup, and account deletion
- OpenAI adapters selected by secrets, with validation before notes are saved
- TXT and PDF export of the signed-in user’s loaded note
- In-app overdue and upcoming tasks

Required credentials:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- Hosted `SUPABASE_SERVICE_ROLE_KEY` (provided to Edge Functions by Supabase, never to Vite)
- `GEMINI_API_KEY` as an Edge Function secret
- Optional OpenAI: `SPEECH_TO_TEXT_API_KEY`, `LLM_API_KEY`
- Optional: `STT_PROVIDER`, `LLM_PROVIDER`, `STT_MODEL`, `LLM_MODEL`

Setup still required on your Supabase project:

- Create the project, run the migration, deploy functions, set secrets, and add auth redirect URLs
- Promote the first admin with the SQL statement above

Tests still outstanding until those credentials exist:

- A live transcription, summary, and chat round trip
- Storage and RLS checks between two real accounts
- Account deactivation and deletion against a hosted project
- Microphone recording in your own browser

Automated tests in this repo cover validation and export helpers only.
# ai-note-proj-
# ai-note-proj-
# ai-note-proj-
