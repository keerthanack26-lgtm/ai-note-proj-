// Builds one self-contained file per Edge Function so each can be pasted into the
// Supabase dashboard editor when the CLI is not available. Output: supabase/dashboard-deploy/.
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

const FUNCTIONS = ['process-audio', 'chat-with-note', 'admin-operations', 'cleanup-audio', 'delete-account']

await mkdir('supabase/dashboard-deploy', { recursive: true })
for (const name of FUNCTIONS) {
  await build({
    entryPoints: [`supabase/functions/${name}/index.js`],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'esnext',
    external: ['npm:*', 'jsr:*', 'https://*'],
    outfile: `supabase/dashboard-deploy/${name}.js`,
    logLevel: 'warning',
  })
  console.log(`bundled ${name}`)
}
