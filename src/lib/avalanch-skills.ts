/**
 * Foundational Avalanch TTS evaluation skills.
 * Distilled from avalanch_tts_evaluation_guideline.pdf
 * Always injected into the evaluator prompt (before reviewer memory).
 */
export const AVALANCH_SKILLS: string[] = [
  "Reference voice is ONLY for Persona Likeness / Speaker Similarity. Do NOT use reference to judge Audio & Recording Quality, Pronunciation Faithfulness, Pacing, Intonation, or Nativeness.",
  "Pacing or intonation must NOT be marked worse just because they differ from the reference. A clip may match the reference but still sound unnatural; a clip may sound more natural but less similar to the reference.",
  "Ground all decisions in what is actually heard in the audio. Do not overweight raw transcripts/STT artifacts caused by noise or misrecognition without clear audio evidence.",
  "Listen fully: reference (for identity) → read prompt → Audio A end-to-end → Audio B end-to-end → rate dimensions → write rationales → pick naturalness winner → write justification → check consistency.",
  "Audio & Recording Quality: judge only signal issues (noise, clipping, distortion, artifacts, compression). Ignore pronunciation, naturalness, and speaker similarity here.",
  "Pronunciation Faithfulness: judge accurate clear pronunciation (vowel/consonant errors, odd stress, proper nouns/loanwords, missing sounds, word changes, hesitation/retakes).",
  "Pacing: judge natural comfortable rhythm (too fast/slow, odd pauses, robotic rhythm, hard-to-follow flow). Speed may differ from reference if still natural.",
  "Intonation: judge pitch movement and emphasis (question contour, statement ending, contrastive stress, variety, flat/monotone delivery).",
  "If the main issue is a flat question, be specific: e.g. 'the question intonation is too flat', 'the question does not sound like a natural spoken question', 'the delivery lacks a natural questioning contour'. Do not stop at vague 'intonation is flat'.",
  "Persona Likeness: compare pitch, timbre, speaking style, and voice identity ONLY against the reference. Similarity is NOT proof of naturalness.",
  "Nativeness: judge native-like impression (learner accent, unnatural stress, non-native rhythm, cross-language sound drift). A sample can win Persona Likeness but lose Nativeness if the reference is not fully native.",
  "Rationale for A / Rationale for B: 10–100 words, natural English, specific, 2–4 decisive observations about THAT clip alone. Do NOT compare to the other clip. Do NOT write 'Audio A' or 'Audio B' in the final text.",
  "In rationales, do NOT start with or refer to 'the speaker' (ambiguous). Prefer clip-focused wording such as 'The sound…', 'The delivery…', 'The speech…', 'The voice…', 'This clip…'.",
  "Bad: 'The speaker delivers the text with natural flow…'. Better: 'The sound / delivery has a natural conversational flow…' or 'The speech sounds natural overall…'.",
  "Rationales MUST include concrete audio evidence when possible: timestamps (e.g. near 0:23), specific words/phrases from the prompt, mispronunciation examples (e.g. 'situasi' as 'situesi'), and named issues like flat question contour on a particular sentence. Avoid only vague claims like 'sounds unnatural'.",
  "Good rationale evidence patterns: 'mild voice drift near 0:23'; 'slight background noise at the beginning'; 'intonation should rise on [word] instead of falling'; 'pronunciation of [ABC] sounded stilted'; 'pacing feels rushed around [phrase]'.",
  "Safe rationale structure: overall naturalness impression → pronunciation/pacing with word/time evidence → intonation if relevant (name the question/statement) → similarity to reference if relevant → short closing impression.",
  "Justification: 10–50 words in natural English; explain the naturalness winner via a real tipping point. You may note shared flaws, then the extra flaw that makes one lose. Do not name 'Audio A/B'; use phrases like 'the one I picked' / 'the other one'.",
  "Consistency: if one clip clearly wins pronunciation, pacing, intonation, and nativeness, it should usually win overall naturalness. Persona Likeness can diverge from naturalness. Both Good/Both Bad do not auto-pick a winner. If the winner seems to fight the ratings, justification must explain the heavier flaw.",
  "Prioritize short, evidence-based, human-sounding reasons. Keep rationales and justification concise; do not ramble.",
  "For conversational interruption/cut-off issues when dominant, prefer specific interruption wording over vague generic labels.",
  "If ranking overall preference for practical voice utility conversations, weight order is: (1) naturalness/engagement, (2) utility, (3) audio quality once baseline quality is adequate.",
];

export function formatAvalanchSkillsForPrompt(): string {
  const lines = AVALANCH_SKILLS.map((skill, index) => `${index + 1}. ${skill}`);
  return `Avalanch TTS Evaluation Skills (mandatory foundation):
${lines.join("\n")}`;
}
