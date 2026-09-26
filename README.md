# MMM42 Interview Bot

An AI interview platform that asks about the specific claims on a candidate's resume that matter for the job, adapts each question with a rule simple enough to say out loud, cites the candidate's exact words for every score, audits its own evaluation for unfairness, and reports integrity signals as a Low / Medium / High concern level for human review. It never gives a cheating verdict.

**Start with [`CLAUDE.md`](CLAUDE.md).** It holds the pillars, owners, data contract, rules, hour plan and cut list.

## Quick start

```bash
cp .env.example .env    # fill in Supabase + Gemini keys
yarn install            # or npm install
yarn dev                # open http://localhost:3000 in Chrome (Web Speech API)
```

- Shared types: `src/types/pipeline.ts`
- Sample interview (dev fixture and demo fallback): `src/fixtures/golden-interview.ts`. Regenerate it with `npm run fixture:golden`.
- Database schema: `supabase_schema.sql`

## Stack

Next.js 16 · Supabase · Gemini 2.5 Flash · browser Web Speech API · MediaPipe Face Landmarker · Tailwind + shadcn

## License

MIT. Built on [FoloUp](https://github.com/FoloUp/FoloUp) (MIT, © 2025 FoloUp); see `LICENSE`.
