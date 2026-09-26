# Recruiter console handoff

Branch: `feat/admin-console`. The console is additive. It adds new routes and components, one navbar link, a test and a tsconfig. It does not change the shared contract (`src/types/pipeline*.ts`), pipeline routes, B's modules, or C's interview screens.

## Workflow

1. **Create a job** (`/admin/jobs`): enter a title and paste the job description. "Load sample data" adds the labeled sample job and the recorded golden interview, so the console can be demoed with no setup.
2. **Schedule** (`/admin/schedule`): enter the candidate's name, optional email, date/time and length, then choose one of two sources:
   - **Their resume (PDF):** calls the existing `POST /api/pipeline/plan` with the resume and the job's description. This needs Gemini mode.
   - **Demo candidate:** a `mock-*` / `mock-whiteboard-*` attempt that uses A2's labeled demo engine. This needs `LLM_MODE=mock`.
3. **Invite** (`/admin/candidates/<id>`): copy the link, open an email draft (`mailto:`), download a calendar file (`.ics`), or open the page as the candidate. The page also shows the planned topics and their opening questions.
4. **The candidate interviews** at `/invite/<interviewId>?at=<ISO>`. The page opens 10 minutes before the scheduled time; this gate is enforced in the browser only. It reuses C's `ClaimsView`, `MonitoringDisclosure` and `InterviewScreen` unchanged. The candidate sees a thank-you screen and never sees the recruiter report.
5. **Review** (`/admin/jobs/<id>`): see the ranking by evidence, the "strongest evidence so far" card, a side-by-side comparison of up to 3 candidates, a pipeline board and a CSV export.
6. **Decide** (`/admin/candidates/<id>`): the page shows the fit summary, topic-by-topic scores with quotes, a follow-up guide ("what to ask in your interview", which can be copied or printed), the full cited report, notes, and the decision (Advance / On hold / Not moving forward). The console never decides for the recruiter.

## Rules (say them out loud)

- **Fit** = Σ(jdWeight × cited score / 3) over every planned topic ÷ Σ jdWeight. Topics that were not reached count as 0, so coverage is always shown next to fit. Ranking order is fit, then coverage, then fewer scores needing review. Exact ties share a position.
- **Integrity** is shown beside the fit and is never an input to it. It is a concern level to prompt human review, not a cheating determination. `tests/admin-console.test.cjs` asserts that changing the integrity level changes neither fit nor rank.
- **Follow-up guide** questions come only from the planned question ladder:
  - Must ask: topics that were not reached, or were answered without a cited score.
  - Verify: scores ≤1, and mixed or thin evidence.
  - Optional depth: strong topics. Uses the rungs the AI did not reach, or "defend your choice" filled with a real quote.
  - `{{term}}` templates are skipped because the term would have to come from the live answer.
  - Audit concerns, drop-off notes, saved artifacts and a non-Low integrity level appear as neutral "Before you start" checks.

## Storage (labeled mock)

- Jobs, candidate names, emails, notes and decisions are stored in this browser's `localStorage` (`mmm42:admin:v1`). Finished reports (client projection) are cached under `mmm42:admin:report:<interviewId>`, so rankings survive a restart of the in-memory pipeline server.
- Candidate names never reach the pipeline, which keeps scoring blind. Pipeline records still use `candidateLabel`.
- Status comes from polling `GET /api/pipeline/session` every 20 seconds (plus a Refresh button). When an interview finishes, `GET/POST /api/pipeline/report` runs once. If report generation fails, it is retried only when the recruiter asks, to avoid repeated evaluator/auditor calls.
- Replacing this with durable storage means swapping `src/components/admin/admin-store.ts` (same hook and actions).

## Files

- `src/lib/admin/{types,insights,invite}.ts`: pure logic, tested.
- `src/components/admin/*`: store, sync hook, shell and pages.
- `src/components/invite/invite-interview.tsx`: the candidate side.
- `src/app/(pipeline)/admin/**`, `src/app/(pipeline)/invite/[interviewId]/page.tsx`: routes.
- `src/components/pipeline/navbar.tsx`: one "Recruiters" link.

## Checks

```sh
npx tsc -p tsconfig.admin.json && node --test tests/admin-console.test.cjs
npx biome check src/components/admin src/components/invite src/lib/admin "src/app/(pipeline)/admin" "src/app/(pipeline)/invite"
```

## Sign-in

- `/login` has two choices. **Candidate** needs no password. **Recruiter** needs the team passcode `ADMIN_PASSCODE`; in dev, if it's unset, the passcode is `recruiter`.
- A recruiter gets an httpOnly cookie holding the SHA-256 of the passcode. Changing the passcode signs everyone out.
- `/admin` is checked in `src/proxy.ts` and again in the admin layout.
- The Recruiters tab only shows for recruiters. Candidate pages (`/interview`, `/invite`, `/practice`) stay open.
- This is a shared-passcode role gate, not user accounts. Real auth stays cut (CLAUDE.md §12). Pipeline API routes are not gated.

## Known limits

- The recruiter gate is a shared passcode: no per-user accounts and no rate limiting on sign-in.
- The scheduled time lives in the link and is not enforced by the server.
- Data is per browser, and a demo attempt only runs while the server is in mock mode.
