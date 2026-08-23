# Task Gyro Accordion — Design Spec

**Date:** 2026-08-23  
**Status:** Approved — implementing  
**Repo:** `tts-ai-evaluator`  
**Menu label:** Task Gyro Accordion  
**Product:** Avalanch / Gemini Live Deep Research reviewer workstation (per `CURSOR_AVALANCH_REVIEWER_PROMPT.md`)

---

## 1. Goals

- Add an isolated reviewer tool for Avalanch Deep Research evaluation workflows.
- Label in UI: **Task Gyro Accordion**.
- Generate structured review output via **SumoPod AI**.
- Keep TTS evaluator (`/`) untouched in behavior and storage.
- Separate **skills / memory** from TTS Avalanch skills.

Success looks like: paste task + transcript + notes → choose rubric v1 or v2 → Generate → Summary / Answers / JSON → Copy for submission.

---

## 2. Non-goals (v1)

- Full history sidebar parity with TTS (optional later).
- OCR of uploaded screenshots (files are context/attachments only; reviewer still pastes text).
- Auto-submit to Avalanch platform.
- Sharing memory or skills with TTS evaluation.

---

## 3. Navigation & isolation

| Concern | Decision |
|---|---|
| Route | `/task-gyro-accordion` |
| Entry | Link from TTS app header/sidebar: “Task Gyro Accordion” |
| Back link | On Gyro page: “← Evaluasi TTS” → `/` |
| Data | Dedicated store keys / files / tables prefixed `gyro_` |
| Skills | `gyro` Avalanch Reviewer skills only — never load TTS `AVALANCH_SKILLS` |
| Memory | Separate playbook/skills for Gyro reviewer feedback |
| API | `POST /api/gyro/review`, `GET/POST /api/gyro/memory` (as needed) |

---

## 4. UI structure

Dark-neutral internal workstation. Dense, readable, one accent for primary actions.

### 4.1 Header
- Title: Task Gyro Accordion
- Subtitle: Avalanch Deep Research review workstation
- Demo data button (fills sample task/transcript/notes)

### 4.2 Task Context Panel
- Rubric version: `v1` | `v2`
- Task language
- Multimodal: yes / no / unknown
- P1, P2, P3 tags
- Task text / prompt / instructions (large textarea)
- User goal / scene summary
- Transcript text (large textarea)
- Task image upload (show filename; optional attach to model if vision-capable)
- Transcript `.txt` upload (read into transcript field)

### 4.3 Reviewer Notes Panel
Tri-state selects:
- Deep Research triggered?
- Captions visible?
- Visual overlay used?
- Personalization observed?

Issue toggles (multi):
- noise, overlay, PII, echo, transcript mismatch / ASR, interruptions, visual blur, accent mismatch

Larger fields:
- Reviewer comments
- Corrections made to submitted turns

### 4.4 Output Workspace
- Tabs: Summary | Answers | JSON
- Buttons: Generate | Copy Output
- Preformatted output area
- Active tab clearly marked

### 4.5 Layout
- Desktop: Task Context | Reviewer Notes side-by-side; Output prominent below or right
- Mobile: stacked sections

---

## 5. Rubric modes

### Version 1 — Q1–Q22 layout / workflow
Covers layout coherence, scene, user goal, before/while/after instructions, P1/P2/P3, Deep Research request vs trigger, audio/PII/accent/recording, scenario completion.

Output: ordered Q1–Q22 answers + short summary.

### Version 2 — Product quality
Fields including (as applicable): UI usability, live screen captions, audio understanding, visual understanding, visual overlay, extension correctness, voice quality, emotional calibration, collaborativity, contextual awareness, personalization, flow/interruptions, easy to listen to, content relevance, response depth, truthfulness, goal completion, efficiency, visual triggering, visual format & quality, audio-visual content, audio-visual timing, self-awareness, visual input solicitation, overall satisfaction, transcript quality.

Output adapts to selected version only.

---

## 6. Generation behavior (SumoPod)

- Endpoint: `POST /api/gyro/review`
- Model/env: reuse `SUMOPOD_*` (same gateway as TTS; **different system prompt + skills**)
- Inputs: task context + notes + optional image data URLs
- Inject `gyro` foundation skills + compact gyro memory playbook
- Rules:
  1. Ground in provided inputs only
  2. Do not invent evidence
  3. Distinguish Deep Research **requested** vs **triggered**
  4. Transcript corrections mainly affect transcript-related fields
  5. Multimodal off → do not invent visual issues
  6. Concise reviewer-style wording
  7. Prefer exact rubric labels
  8. Unclear → neutral / unknown, not false certainty
- Response: JSON schema with `summary`, `answers` (array of `{id, label, value}`), and raw structured object for JSON tab

---

## 7. Storage design

Local mode (no Supabase):
- `data/gyro-memory.json` — `{ skills, sources, playbook }`
- Foundation skills in code: `src/lib/gyro/avalanch-reviewer-skills.ts`

Supabase mode (if env present):
- Separate table or JSON column namespace `gyro_memory` — **not** TTS `memory`

Never read/write TTS evaluation history from Gyro APIs.

---

## 8. File / module map (planned)

```
src/app/task-gyro-accordion/page.tsx
src/components/gyro/GyroApp.tsx
src/components/gyro/TaskContextPanel.tsx
src/components/gyro/ReviewerNotesPanel.tsx
src/components/gyro/OutputWorkspace.tsx
src/lib/gyro/types.ts
src/lib/gyro/avalanch-reviewer-skills.ts
src/lib/gyro/sumopod-review.ts
src/lib/gyro/store.ts
src/app/api/gyro/review/route.ts
src/app/api/gyro/memory/route.ts
```

TTS `EvaluatorApp` only gets a navigation link; no logic merge.

---

## 9. Acceptance criteria

- [ ] Open `/task-gyro-accordion` from TTS UI
- [ ] Paste task text + transcript; upload files show names
- [ ] Set notes / toggles; choose rubric v1 or v2
- [ ] Generate produces Summary / Answers / JSON
- [ ] Copy works for active tab
- [ ] Demo data fills usable sample
- [ ] Gyro memory/skills never appear in TTS memory counts
- [ ] TTS evaluate flow still works unchanged

---

## 10. Implementation order

1. Types + foundation skills + isolated store
2. API `/api/gyro/review` (+ memory read for prompt)
3. UI panels + page route + nav links
4. Demo data + copy UX polish
5. Manual smoke test locally

---

## Decisions log

- Menu name: **Task Gyro Accordion** (product = Avalanch Reviewer from prompt)
- Generate: **SumoPod AI**
- Placement: **isolated route** `/task-gyro-accordion`
- Memory/skills: **fully separate** from TTS
