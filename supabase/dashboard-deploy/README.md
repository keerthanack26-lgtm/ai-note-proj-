# Deploy the Edge Functions from the Supabase dashboard

Use this when the Supabase CLI is not signed in to the account that owns the project. Each `.js` file here is a self-contained copy of one function. Regenerate them after editing the source with:

```bash
npm run bundle:functions
```

## Steps (repeat for all five files)

1. Open https://supabase.com/dashboard/project/bxdnsyphkffensaojowa/functions
2. Click **Deploy a new function** and choose **Via Editor**.
3. In **Function name**, type the file name without `.js`, exactly:
   - `process-audio`
   - `chat-with-note`
   - `admin-operations`
   - `cleanup-audio`
   - `delete-account`
4. Delete the sample code in the editor, open the matching file from this folder in Cursor, select all, copy, and paste it into the editor.
5. Click **Deploy function**.

Leave "Verify JWT" on (the default). The functions also check the user themselves.

## Secrets

`GEMINI_API_KEY` must exist under **Edge Functions → Secrets**. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

## Check it worked

In the app, open **History**, click **Processing** next to a recording, then **Resume**. The stages should move from Preparing to Completed. If the Gemini secret is missing, the job fails with a clear configuration message instead.
