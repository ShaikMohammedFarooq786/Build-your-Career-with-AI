# AI CareerMatch

A standalone resume and job matching workspace built with React, Vite, and Express. The repository was empty when implementation began; no existing application, pages, or database were replaced.

## Run locally

Use Node.js 22.13+ (tested with Node 24) and npm. In PowerShell use `npm.cmd` if script execution policy prevents `npm` from running.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. The API runs on port 3001. Both processes start with one command. Keep port 3001 for development because the Vite proxy targets it.

The app works without an AI key. To enable AI, copy `.env.example` to `.env`, set `OPENAI_API_KEY`, and restart the server. `OPENAI_MODEL` is configurable and defaults to `gpt-4.1-mini`. Keys are server-only and `.env` is ignored by Git. No API key was provided during implementation; live provider requests have not been tested.

```sh
npm run build
npm start
```

This serves the built application and API together at **http://127.0.0.1:3001**. For production, set `NODE_ENV=production`. The default host is loopback. Before a public deployment, add authentication and per-user quotas to the paid AI routes; this standalone app is designed for personal local use.

## Workflow

1. Upload a PDF/DOCX (up to 5 MB), or paste resume text. Review/correct extraction. Resume analysis also works without a job description.
2. Paste the target job description and choose **Analyze & match**.
3. Inspect matched skills, missing evidence, job excerpts, and experience/qualification review flags.
4. Explore prioritized skill gaps and generate a 7/14/30-day plan. Mark daily tasks complete and export the plan.
5. Practice HR, technical, and project interview questions. With AI configured, evaluate each answer and generate a final interview summary.
6. Review wording and structure suggestions in Resume Studio. Apply individual edits to a separate draft, reset them, or download plain text.

The **sample workspace** uses explicitly labeled fictional data. It never populates the dashboard automatically. Editing the resume or job description invalidates dependent results, roadmaps, and interviews. The workspace is held in memory; refreshing clears it. Uploaded files are not persisted, and no database is used. AI actions send the supplied resume/job/answer text to OpenAI; ordinary upload, extraction, and matching do not. The UI identifies local outputs and AI outputs separately.

## Explainable matching

`server/analysis.js` implements the agent stages:

**Resume Agent → Job Analysis Agent → Matching Agent → Skill Gap Agent → Career Planning Agent → Interview Agent**

These are explicit service functions, not autonomous agents with external tools. AI augments summary, planning, interviews, and conservative edits without controlling match arithmetic.

- A curated catalog recognizes explicit technical/soft skills and common aliases using token boundaries. Each skill retains a source excerpt and counts once.
- Required skills have weight **3**, unspecified skills **2**, preferred skills **1**.
- `match % = round(matched skill weights / all recognized job skill weights × 100)`.
- If no job skills are recognized, the percentage is **unavailable**, not zero or 100.
- The UI displays earned/possible points, per-skill evidence, and the full formula. This is skill coverage, **not hiring likelihood**.
- Experience is only taken from an explicit “N years of experience” statement. Tenure is not guessed from dates or overlapping positions. Qualification equivalence and experience relevance require manual review and do not affect the skill score.

Extraction is intentionally conservative. It may miss niche skills, negated or mixed-context sentences, unusual section headings, and alternative qualification/experience phrasing. A missing skill means **not evidenced in the supplied resume**, not that the person lacks it. Review source text before relying on results. Standard headings such as Education, Experience, Projects, and Certifications work best. Scanned PDFs require OCR outside the app or pasted text. PDF uploads are limited to 30 pages; text inputs to 40,000 characters. Resume exports are plain text, not reconstructed PDF/DOCX files.

## AI service and grounding

`server/ai.js` uses the [OpenAI Responses API structured-output format](https://developers.openai.com/api/docs/guides/structured-outputs), with server-side Zod validation, timeout handling, and `store: false`. Input documents are treated as untrusted data. Prompts forbid invented qualifications, companies, achievements, and numeric assessment scores.

Strength observations require exact source excerpts. Applicable AI edits must quote an exact original span, preserve numeric values, and pass a conservative content-word check. Edits always require user review and never overwrite the source document. Generative summaries and interview feedback are still suggestions and may be imperfect; the UI labels them for review. There is no synthetic AI feedback when the provider is unavailable.

PDF extraction uses [pdf-parse](https://github.com/mehmet-kozan/pdf-parse); DOCX extraction uses [Mammoth raw-text extraction](https://github.com/mwilliamson/mammoth.js). Parsing runs in a separate process with a 20-second timeout, a V8 heap bound, and a two-document concurrency cap. Only text is rendered, never uploaded document HTML. Native libraries can allocate outside the V8 heap; deployment-level resource limits are appropriate for public use.

## API

All routes are under `/api`, use JSON errors, and have input validation and rate limiting.

| Route | Input | Result |
| --- | --- | --- |
| `GET /health` | — | Server/AI availability |
| `POST /resume/upload` | Multipart `resume` file | Extracted text and resume sections |
| `POST /resume/analyze` | `resumeText` | Rule-based resume analysis |
| `POST /analyze` | `resumeText`, `jobText` | Resume, job, match, gaps, suggestions |
| `POST /ai/analysis` | `resumeText`, optional `jobText` | AI summary, evidence, improvement advice |
| `POST /plan` | Resume/job, `duration` (7/14/30), `useAI` | Daily roadmap |
| `POST /interview` | Resume/job, `useAI` | HR/technical/project questions |
| `POST /interview/feedback` | Resume/job, `question`, `answer` | AI evaluation |
| `POST /interview/summary` | Resume/job, `responses` | AI final summary |

## Validation

```sh
npm test
npm run build
npm run test:e2e
```

Unit/API tests cover deterministic weighting, alias boundaries, unknown evidence, durations, provider contracts, fabricated-edit filtering, real PDF/DOCX extraction, upload limits, origin validation, and missing-key behavior. Browser tests use installed Google Chrome for desktop and mobile viewport runs, exercising the full local workflow, downloads, review-before-apply, input invalidation, and upload errors. Install Chrome if it is not already available. Test artifacts are ignored by Git.
