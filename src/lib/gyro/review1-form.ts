/** Output Review 1 — Avalanch / Outlier product-quality form (Live Deep Research). */

export type Review1Field = {
  id: string;
  /** English form title as on Outlier */
  title: string;
  /** Full English question prompt from Outlier */
  promptEn: string;
  /** Short Indonesian explanation so reviewer can verify meaning */
  explainId: string;
  /** Selected option */
  rating: string;
  /** Indonesian justification / comment for this field */
  explanationId: string;
  /** Allowed options shown to the model (exact Outlier labels) */
  options: string[];
  /** Multi-select (select all that apply) */
  multi?: boolean;
  /** Free-text answer in rating field */
  freeText?: boolean;
};

export type Review1Result = {
  deepResearchTriggered: "Yes" | "No";
  /** Note: No ≠ automatic fail */
  deepResearchNoteId: string;
  fields: Review1Field[];
  qualityCheckAccurate: "Yes" | "No";
  grammarCheck: "Yes" | "No";
};

const ISSUE3 = ["No Issues", "Minor Issue(s)", "Major Issue(s)"] as const;
const ISSUES = ["No Issues", "Minor Issues", "Major Issues"] as const;

export const REVIEW1_FIELD_DEFS: Omit<
  Review1Field,
  "rating" | "explanationId"
>[] = [
  {
    id: "ui_usability",
    title: "(1) UI Usability",
    promptEn:
      "Were there any issues interacting with the product's visual UI that either did not meet your expectations or were unclear in a way that made the interaction more difficult?",
    explainId:
      "Apakah UI visual Gemini Live jelas dan mudah dipakai, atau justru membingungkan?",
    options: [...ISSUE3],
  },
  {
    id: "ui_usability_explanation",
    title: "(1.b) UI Usability Issue Explanation",
    promptEn:
      'Please provide in your own words what aspects of the visual UI, if any, made the interaction more difficult. Example: "0:34–0:41 I tapped the camera icon twice and nothing happened…"',
    explainId:
      "Jelaskan (Bahasa Indonesia) bagian UI mana yang bermasalah, idealnya dengan timestamp. Jika No Issues, tulis bahwa UI jelas.",
    options: ["(free text)"],
    freeText: true,
  },
  {
    id: "live_screen_captions",
    title: "(2) Live Screen Captions Quality",
    promptEn:
      "Were there any issues with how the model transcribed what you said within Live screen captions?",
    explainId:
      "Apakah caption/transkripsi di layar Live akurat terhadap ucapan user?",
    options: [...ISSUES],
  },
  {
    id: "audio_understanding",
    title: "(3) Audio Understanding (AUDIO IN)",
    promptEn:
      "Were there any issues with the GenAI chatbot not understanding what you said or mishearing either you or any other relevant audio input (including across different languages if used, user's tone of voice and non-verbal cues, as well as relevant environmental or non-speech sounds)?",
    explainId:
      "Apakah model memahami ucapan user (dan audio relevan lain) dengan benar, tanpa salah dengar yang menghambat goal?",
    options: [...ISSUE3],
  },
  {
    id: "visual_understanding",
    title: "(4) Visual Understanding",
    promptEn:
      "Were there any issues with the AI Assistant's ability to understand and make use of visual input - whether video, images, screenshare, or user annotations - provided to the AI Assistant?",
    explainId:
      "Apakah model paham input visual (screen share/kamera/gambar) dan memakainya dalam jawaban? Pilih Not Relevant jika tidak ada visual.",
    options: [...ISSUE3, "Not Relevant"],
  },
  {
    id: "visual_overlay_quality",
    title: "(5) Visual Overlay Quality",
    promptEn:
      "How well did the GenAI Chatbot make use of visual overlays during the conversation – triggering, highlighting, tracking, timing/persistence? Overlays = bounding boxes, arrows, glows, or other AR-style overlays.",
    explainId:
      "Kualitas overlay visual: tepat waktu, akurat, membantu? N/A jika overlay tidak dipakai dan tidak diharapkan.",
    options: [...ISSUE3, "N/A - Not Applicable"],
  },
  {
    id: "extension_correctness",
    title: "(6) Extension Correctness",
    promptEn:
      "How well did the GenAI chatbot fulfill requested and relevant actions through extensions?",
    explainId:
      "Apakah aksi extension/tool (mis. Deep Research / retrieval) benar dan konsisten? Not relevant jika tidak perlu extension.",
    options: [...ISSUES, "Not relevant"],
  },
  {
    id: "voice_quality",
    title: "(7) Voice Quality, Accent, and Language",
    promptEn:
      "How was the overall voice quality of the response? Consider intonation, pronunciation, volume, speed, non-speech sounds, emotionality, and whether it sounds like a Representative Native Speaker of the region (no unexpected language/accent switches).",
    explainId:
      "Kualitas suara model: intonasi, pengucapan, aksen native Indonesia, naturalness, tanpa drift bahasa/aksen.",
    options: [...ISSUE3],
  },
  {
    id: "voice_standout_positives",
    title: "(7.c) Voice Quality – Standout Positives",
    promptEn:
      "Did the voice do anything that particularly impressed you or felt notably better than you'd expect from a voice assistant? Select all that apply.",
    explainId:
      "Hal positif menonjol pada suara (boleh multi). Jika tidak ada: N/A – nothing stood out.",
    multi: true,
    options: [
      "Exceptionally natural prosody – rhythm, stress, and intonation felt indistinguishable from human speech for sustained passages.",
      "Emotionally attuned delivery – the emotional tone actively enhanced the interaction; it felt like the model understood the emotional register.",
      "Natural backchannel sounds – backchannels (\"mhmm,\" \"got it,\" \"right\") sounded natural, were well-timed, and enhanced the feeling of being listened to.",
      "Seamless voice consistency across modes – identity held across main responses, acknowledgments, backchannels, and recovery from interruptions.",
      "Locale-authentic non-speech sounds – laughter and filler sounds (\"um,\" \"uh\") felt authentic rather than robotic or formulaic.",
      "Other (describe)",
      "N/A – nothing stood out",
    ],
  },
  {
    id: "emotional_calibration",
    title: "(8) Emotional Calibration",
    promptEn:
      "Was the model's response – in its wording and framing – well-calibrated to the user's expressed or implied emotional state? (WHAT was said, not how the voice sounded.)",
    explainId:
      "Apakah wording model sesuai keadaan emosional user (tidak berlebihan / tidak mengabaikan)? N/A jika emosi netral.",
    options: [...ISSUES, "N/A"],
  },
  {
    id: "collaborativity",
    title: "(9) Collaborativity – Elicitations, Suggestions & Next Steps",
    promptEn:
      "How well did the GenAI's questions, suggestions, next steps, and handling of corrections help you achieve your goal?",
    explainId:
      "Seberapa kolaboratif model membantu mencapai goal (pertanyaan/saran/next step yang relevan)?",
    options: [...ISSUES, "N/A"],
  },
  {
    id: "contextual_awareness",
    title: "(10) Contextual Awareness",
    promptEn:
      "How well did the GenAI chatbot use available context – from this conversation and the user's real-world situation – to produce a well-grounded response?",
    explainId:
      "Apakah model memakai konteks percakapan & situasi nyata (screen/produk yang dibahas) dengan baik?",
    options: [...ISSUES],
  },
  {
    id: "personalization_quality",
    title: "(11) Personalization Quality",
    promptEn:
      "How well were the responses tailored based on the user's personal data, style preferences, etc. that the AI Chatbot has learnt OUTSIDE of the current session?",
    explainId:
      "Personalisasi dari data di luar sesi ini. N/A jika task tidak membutuhkan personalisasi.",
    options: [...ISSUES, "N/A"],
  },
  {
    id: "conversation_flow",
    title: "(12) Conversation Flow, Timing, & Interruptions",
    promptEn:
      'How smooth was the "back-and-forth" of the interaction? Consider listening/speaking switches, interruptions, background noise, timeouts, and working acknowledgments. Natural brief overlap ≠ true interruption.',
    explainId:
      "Kelancaran giliran bicara, interrupt, timing, dan rasa natural percakapan.",
    options: [...ISSUE3],
  },
  {
    id: "conversation_flow_standout",
    title: "(12.c) Conversation Flow – Standout Positives",
    promptEn:
      "Did the conversation flow do anything that particularly impressed you? Select all that apply.",
    explainId:
      "Hal positif menonjol pada alur percakapan. Jika tidak ada: N/A – nothing stood out.",
    multi: true,
    options: [
      "Emotionally intelligent interruption handling – recognized the right moment to stop talking or yield the floor.",
      "Natural conversational overlap – brief overlap felt like natural human conversation; model yielded quickly.",
      "Appropriate restraint / reading the room – correctly chose not to speak when a response wasn't needed.",
      "Well-paced delegation acknowledgment – when delegating to a background process, pacing felt natural.",
      "Graceful recovery from mutual interruption – after simultaneous speech, model broke silence naturally.",
      "Effective background-task conversation – while a tool/search ran, model maintained natural relevant conversation.",
      "Other (describe)",
      "N/A – nothing stood out",
    ],
  },
  {
    id: "easy_to_listen",
    title: "(13) Easy to Listen to, Conversational Responses",
    promptEn:
      "Is the response's structure, word choice, and style appropriate for an audio-only experience? Lead with main point, short segments, linear build, signposts, recaps when needed.",
    explainId:
      "Apakah struktur jawaban mudah didengar (poin utama dulu, segmen pendek, tidak bertele-tele)?",
    options: ["Very Good", "Good", "Fair", "Poor", "Very Poor"],
  },
  {
    id: "content_relevance",
    title: "(14) Content Relevance",
    promptEn:
      "How relevant is the content provided by the GenAI chatbot as you worked with it to accomplish your goal?",
    explainId:
      "Seberapa relevan konten jawaban terhadap goal user (tanpa noise yang mengalihkan)?",
    options: [...ISSUE3],
  },
  {
    id: "response_depth",
    title: "(15) Response Depth & Insightfulness",
    promptEn:
      "How well-calibrated, insightful, and complete was the information provided? The best responses are calibrated: thorough and insightful when the topic demands it, concise and direct when it doesn't. Scale: 1=Very Poor, 3=Adequate, 5=Excellent.",
    explainId:
      "Kedalaman & kalibrasi insight (skala 1–5): 1 Very Poor · 3 Adequate · 5 Excellent.",
    options: ["1", "2", "3", "4", "5"],
  },
  {
    id: "truthfulness",
    title: "(16) Truthfulness",
    promptEn:
      "How truthful were the GenAI chatbot responses? Flag blatant lies, obvious hallucinations, or glaring factual errors relevant to the goal. You do not need to rigorously fact-check every detail.",
    explainId:
      "Seberapa jujur/akurat jawaban model? Fokus klaim relevan ke goal — tandai halusinasi/fakta jelas salah.",
    options: [...ISSUE3, "N/A - Not Applicable"],
  },
  {
    id: "goal_completion",
    title: "(17) Goal Completion",
    promptEn:
      "To what extent did the GenAI chatbot successfully help you achieve your primary objective?",
    explainId:
      "Sejauh mana model membantu mencapai objektif utama user?",
    options: [...ISSUE3, "N/A"],
  },
  {
    id: "user_effort_efficiency",
    title: "(18) User Effort & Task Efficiency",
    promptEn:
      "Considering the inherent complexity of the scenario, were there any issues with the GenAI chatbot guiding you toward achieving your goal?",
    explainId:
      "Apakah model membimbing ke goal dengan efisien, atau justru menambah usaha user?",
    options: [...ISSUES, "N/A"],
  },
  {
    id: "visual_triggering",
    title: "(19) Visual Triggering",
    promptEn:
      "Did the model correctly decide when to show or offer a visual (card/image/text visual, EXCLUDING captions), and handle modality switches smoothly?",
    explainId:
      "Apakah model tepat memutuskan kapan menampilkan visual (bukan caption), dan transisi voice→visual mulus?",
    options: [...ISSUES, "N/A"],
  },
  {
    id: "visual_format_quality",
    title: "(20) Visual Format & Quality",
    promptEn:
      "Did the visual present the information in the most clear and effective way (layout, legibility, quality)?",
    explainId:
      "Apakah format visual jelas dan efektif sehingga mudah dipahami?",
    options: [...ISSUES, "N/A"],
  },
  {
    id: "audio_visual_content",
    title: "(21) Audio-Visual Content",
    promptEn:
      "How well did the content of the voice response and the content of the on-screen visual work together?",
    explainId:
      "Seberapa baik isi suara dan visual saling melengkapi (bukan saling mengganggu)?",
    options: [...ISSUES, "N/A"],
  },
  {
    id: "audio_visual_timing",
    title: "(22) Audio-Visual Timing",
    promptEn:
      "Did the visual appear, update, or disappear when it was relevant to the voice response?",
    explainId:
      "Apakah visual muncul/update/hilang tepat waktu relatif terhadap respons suara?",
    options: [...ISSUES, "N/A"],
  },
  {
    id: "self_awareness",
    title: "(23) Self-Awareness",
    promptEn:
      "Were there any issues with the GenAI chatbot's ability to understand and effectively communicate its own capabilities and limitations (features, UI, device)?",
    explainId:
      "Apakah model paham dan menjelaskan kemampuan/batasannya dengan benar tanpa menghambat goal?",
    options: [...ISSUE3],
  },
  {
    id: "visual_input_solicitation",
    title: "(24) Visual Input Solicitation",
    promptEn:
      "Were there any issues with the GenAI chatbot's ability to proactively determine the need for visual input and respond appropriately (Mobile: prompt share; Glasses: turn on camera)?",
    explainId:
      "Apakah model proaktif meminta/menyalakan input visual saat dibutuhkan? Not Relevant jika tidak relevan.",
    options: [...ISSUE3, "Not Relevant"],
  },
  {
    id: "overall_satisfaction",
    title: "(26) Overall Satisfaction",
    promptEn:
      "Overall, how satisfied are you with your experience engaging with this voice-based conversational AI product to help achieve your goal?",
    explainId:
      "Kepuasan keseluruhan terhadap pengalaman voice AI untuk mencapai goal.",
    options: [
      "Very dissatisfied",
      "Somewhat dissatisfied",
      "Neither satisfied nor dissatisfied",
      "Somewhat satisfied",
      "Very satisfied",
    ],
  },
  {
    id: "overall_satisfaction_open",
    title: "(26.b) Overall Satisfaction Open Text",
    promptEn:
      "Please provide in your own words what aspects of the interactions led you to choose the rating. Include anything that worked particularly well or was particularly frustrating (ideally with timestamps).",
    explainId:
      "Jelaskan (Bahasa Indonesia) alasan rating kepuasan — yang bagus/frustrasi, idealnya dengan timestamp.",
    options: ["(free text)"],
    freeText: true,
  },
  {
    id: "transcript_quality_post",
    title: "(30) Post-Rating Task: Transcript Quality",
    promptEn:
      "Were there any issues with how the model transcribed what you said in the post-session chat transcript?",
    explainId:
      "Apakah ada masalah pada cara model mentranskripsikan ucapan Anda di transcript chat setelah sesi?",
    options: [...ISSUES],
  },
];

export function emptyReview1(): Review1Result {
  return {
    deepResearchTriggered: "No",
    deepResearchNoteId:
      "Deep Research tidak terpicu bukan otomatis fail — catat fakta dari transcript.",
    fields: REVIEW1_FIELD_DEFS.map((d) => ({
      ...d,
      rating: "",
      explanationId: "",
    })),
    qualityCheckAccurate: "Yes",
    grammarCheck: "Yes",
  };
}

/** Client-safe formatter (no Node/fs imports). */
export function formatReview1Text(r: Review1Result): string {
  const lines: string[] = [];
  lines.push("=== OUTPUT REVIEW 1 — Product Quality Form ===");
  lines.push("");
  lines.push("Deep research was triggered? (jika No, BUKAN otomatis fail)");
  lines.push(`Jawaban: ${r.deepResearchTriggered}`);
  lines.push(`Penjelasan: ${r.deepResearchNoteId}`);
  lines.push("");
  for (const f of r.fields) {
    lines.push(f.title);
    if (f.promptEn) lines.push(`Prompt: ${f.promptEn}`);
    lines.push(`Arti: ${f.explainId}`);
    if (f.id === "response_depth") {
      lines.push("Skala: 1 Very Poor / 3 Adequate / 5 Excellent");
    } else {
      lines.push(`Opsi resmi: ${f.options.join(" / ")}`);
    }
    lines.push(`Pilihan: ${f.rating}`);
    lines.push(`Penjelasan ID: ${f.explanationId}`);
    lines.push("");
    if (f.id === "response_depth") {
      lines.push("Quality check 1 — jawaban akurat berbasis video/transcript?");
      lines.push(`Jawaban: ${r.qualityCheckAccurate}`);
      lines.push("");
      lines.push("Grammar check 1 — ejaan/grammar bersih?");
      lines.push(`Jawaban: ${r.grammarCheck}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
