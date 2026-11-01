import assert from "node:assert/strict";
import { test } from "node:test";
import { applyFeedbackChecklist } from "../checklist.ts";
import { pickFeedbackVoice, writerFeedbackTemplate } from "../guidelines.ts";

const base = `11/01 @01:33 GMT (UTC+0), Review 1, Masruhan K

Hi Audace,

Thanks for the Lighthouse export.

What's working:
- The final report is in the zip.

Approved. The files match the request.

Growth note:
- Nothing major — keep this bar.

Thanks again.`;

test("checked fix replaces Approved and lands under Require re-Record", () => {
  const out = applyFeedbackChecklist(base, ["exact-match"]);
  assert.doesNotMatch(out, /^Approved\./m);
  assert.match(out, /Require re-Record:\n- These must match EACH OTHER exactly/);
  assert.match(out, /Thanks again\.$/);
});

test("unchecked templates stay out of the feedback", () => {
  const out = applyFeedbackChecklist(base, ["scroll"]);
  assert.match(out, /Approved\./);
  assert.match(out, /- Scrolling: You used the mouse/);
  assert.doesNotMatch(out, /Copy\/Paste/);
});

test("checked closing replaces the last paragraph", () => {
  const out = applyFeedbackChecklist(base, ["closing-aqc"]);
  assert.match(out, /rerun both AutoQC checks/);
  assert.doesNotMatch(out, /Thanks again\./);
});

test("each voice draw changes the greeting instructions", () => {
  const first = writerFeedbackTemplate("Audace", pickFeedbackVoice(0));
  const second = writerFeedbackTemplate("Audace", pickFeedbackVoice(1));
  assert.match(first, /Start with "Hi Audace,"/);
  assert.match(second, /Start with "Hey Audace,"/);
  assert.notEqual(first, second);
});
