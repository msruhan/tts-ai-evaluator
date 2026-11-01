export type ChecklistGroup = "fix" | "growth" | "closing";

export type FeedbackChecklistItem = {
  id: string;
  group: ChecklistGroup;
  label: string;
  text: string;
};

export const FEEDBACK_CHECKLIST: FeedbackChecklistItem[] = [
  {
    id: "intro",
    group: "fix",
    label: "Alur intro",
    text: "Prepare your desktop and task description document (goal document), minimize all other apps, start recording in TaskRecorder, minimize the TR window, say “I will be beginning my task soon. Here is the workflow I have in mind,” wait a few seconds, then minimize the task description document and begin the task.",
  },
  {
    id: "exact-match",
    group: "fix",
    label: "Goal, TR, dan Request harus sama",
    text: "These must match EACH OTHER exactly: Goal in Describe Idea, Task Description in the TR window, and Request section in metadata.",
  },
  {
    id: "www",
    group: "fix",
    label: "Where, What, and Why",
    text: 'For every action — minimize, close, click a button, scroll, copy-paste, save — follow Where, What, and Why before you do it. For example: "I will move my mouse to the top left corner of the window, click on the yellow color icon to minimize the window." Do not use “Click this,” “Click here,” or “You can see.” Do not use “this,” “that,” or “here.”',
  },
  {
    id: "name-control",
    group: "fix",
    label: "Sebut kontrol dan lokasinya",
    text: "Narration (what and where): name the control and its location instead of “this” or “here”, for example “I click inside the body text box in the centre of the slide,” or “I click Designer on the far right of the Home ribbon.”",
  },
  {
    id: "input-files",
    group: "fix",
    label: "Input files di zip",
    text: "Input files: Any original input files you prepared before recording need to be included in the zip file.",
  },
  {
    id: "output-file",
    group: "fix",
    label: "Output file saat rekaman",
    text: "Output file: Export/download the final output file during the recording; it would make your deliverables clearer.",
  },
  {
    id: "artifact-file",
    group: "fix",
    label: "Artifact file",
    text: "Artifact file: If you download anything during recording but it is not a final work yet, it can be saved as an artifact.",
  },
  {
    id: "epilogue",
    group: "fix",
    label: "Epilogue",
    text: "Check the new Epilogue requirements in the Guideline; please include it in your next recording.",
  },
  {
    id: "scroll",
    group: "growth",
    label: "Scroll pakai scrollbar",
    text: "Scrolling: You used the mouse/trackpad to scroll. For future recordings, please use the scrollbar on the right side of the application window. Prioritize visible UI interactions whenever possible.",
  },
  {
    id: "copy-paste",
    group: "growth",
    label: "Copy/paste lewat menu Edit",
    text: "Copy/Paste: You used keyboard shortcuts to copy and paste. Please prioritize UI-based actions by navigating to the Edit menu and selecting Copy or Paste instead.",
  },
  {
    id: "save",
    group: "growth",
    label: "Save lewat menu File",
    text: "Saving: You used the Cmd+S keyboard shortcut to save the document. For future recordings, please prioritize visible UI interactions by navigating to the File menu in the top-left menu bar and selecting Save.",
  },
  {
    id: "closing-aqc",
    group: "closing",
    label: "Tutup dengan AutoQC + checklist",
    text: "Before resubmitting, please rerun both AutoQC checks and review the Workflow Checklist in the Writer Guidelines to ensure everything is covered. Once the issues are resolved, your submission should be ready for approval. Looking forward to your updated version!",
  },
];

const NEXT_AFTER_RERECORD = [
  "recommended intro workflow:",
  "growth note:",
  "growth notes:",
];

function findHeading(lines: string[], heading: string) {
  const target = heading.toLowerCase();
  return lines.findIndex((line) => line.trim().toLowerCase().startsWith(target));
}

function insertSection(feedback: string, heading: string, block: string, nextHeadings: string[]) {
  if (feedback.includes(block)) return feedback;
  const lines = feedback.split("\n");
  const headingIdx = findHeading(lines, heading);
  if (headingIdx < 0) {
    let at = lines.length;
    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i].trim().toLowerCase();
      if (nextHeadings.some((next) => trimmed.startsWith(next))) {
        at = i;
        break;
      }
    }
    const before = lines.slice(0, at);
    while (before.length && before[before.length - 1].trim() === "") before.pop();
    const after = lines.slice(at);
    return [...before, "", heading, block, "", ...after].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  let end = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim().toLowerCase();
    if (nextHeadings.some((next) => trimmed.startsWith(next))) {
      end = i;
      break;
    }
  }
  const before = lines.slice(0, end);
  while (before.length > headingIdx + 1 && before[before.length - 1].trim() === "") before.pop();
  const after = lines.slice(end);
  return [...before, block, "", ...after].join("\n").replace(/\n{3,}/g, "\n\n");
}

function splitCloser(feedback: string) {
  const parts = feedback.trim().split(/\n\s*\n/);
  if (parts.length < 2) return { body: feedback.trim(), closer: "" };
  const last = parts[parts.length - 1].trim();
  if (
    /^(require re-record|what's working|what’s working|growth note|recommended intro)/i.test(last) ||
    last.startsWith("-")
  ) {
    return { body: feedback.trim(), closer: "" };
  }
  return { body: parts.slice(0, -1).join("\n\n").trim(), closer: last };
}

function dropApproved(feedback: string) {
  return feedback
    .split(/\n\s*\n/)
    .filter((part) => !/^approved\b/i.test(part.trim()))
    .join("\n\n")
    .trim();
}

export function applyFeedbackChecklist(feedback: string, selectedIds: string[]) {
  const source = String(feedback || "").trim();
  if (!source) return source;
  const selected = new Set(selectedIds);
  const items = FEEDBACK_CHECKLIST.filter((item) => selected.has(item.id));
  if (!items.length) return source;

  const fixes = items.filter((item) => item.group === "fix");
  const growth = items.filter((item) => item.group === "growth");
  const closing = items.filter((item) => item.group === "closing");
  const { body, closer } = splitCloser(fixes.length ? dropApproved(source) : source);

  let out = body;
  if (fixes.length) {
    out = insertSection(
      out,
      "Require re-Record:",
      fixes.map((item) => `- ${item.text}`).join("\n"),
      NEXT_AFTER_RERECORD,
    );
  }
  if (growth.length) {
    out = insertSection(
      out,
      "Growth note:",
      growth.map((item) => `- ${item.text}`).join("\n"),
      [],
    );
  }

  const ending = closing[0]?.text || closer;
  return ending ? `${out.trim()}\n\n${ending}` : out.trim();
}
