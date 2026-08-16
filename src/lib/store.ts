import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type {
  EvalLanguage,
  EvaluationRecord,
  EvaluationResult,
  EvaluationSummary,
  EvaluatorMemory,
  LanguageErrorNotes,
  MemorySkill,
  ReviewVerdict,
  ReviewerComment,
} from "./types";
import { formatAvalanchSkillsForPrompt } from "./avalanch-skills";
import {
  explainSupabaseError,
  getSupabaseAdmin,
  isSupabaseConfigured,
} from "./supabase";

const MAX_MEMORY_SKILLS = 40;
const DATA_DIR = path.join(process.cwd(), "data");
const EVALUATIONS_DIR = path.join(DATA_DIR, "evaluations");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");

type EvaluationRow = {
  id: string;
  created_at: string;
  title: string;
  text_prompt: string;
  language: string;
  listener_note: string | null;
  language_errors: LanguageErrorNotes | null;
  model: string;
  file_names: EvaluationRecord["fileNames"];
  result: EvaluationResult;
  reviews: ReviewerComment[] | null;
};

type MemorySkillRow = {
  id: string;
  created_at: string;
  source_evaluation_id: string | null;
  verdict: ReviewVerdict;
  skill: string;
};

function cleanLanguageErrors(
  notes?: LanguageErrorNotes,
): LanguageErrorNotes | undefined {
  if (!notes) return undefined;
  const cleaned: LanguageErrorNotes = {};
  for (const key of ["reference", "audioA", "audioB"] as const) {
    const value = notes[key]?.trim();
    if (value && value !== "none") cleaned[key] = value;
  }
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function makeTitle(textPrompt: string) {
  const cleaned = textPrompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Evaluasi tanpa prompt";
  return cleaned.length > 56 ? `${cleaned.slice(0, 56)}…` : cleaned;
}

function useSupabase() {
  return isSupabaseConfigured();
}

async function ensureLocalDirs() {
  await fs.mkdir(EVALUATIONS_DIR, { recursive: true });
}

function localEvaluationPath(id: string) {
  return path.join(EVALUATIONS_DIR, `${id}.json`);
}

function rowToRecord(row: EvaluationRow): EvaluationRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    title: row.title,
    textPrompt: row.text_prompt,
    language: (row.language as EvalLanguage) || "id",
    listenerNote: row.listener_note || undefined,
    languageErrors: row.language_errors || undefined,
    model: row.model,
    fileNames: row.file_names,
    result: row.result,
    reviews: row.reviews || [],
  };
}

function skillRowToSkill(row: MemorySkillRow): MemorySkill {
  return {
    id: row.id,
    createdAt: row.created_at,
    sourceEvaluationId: row.source_evaluation_id || "",
    verdict: row.verdict,
    skill: row.skill,
  };
}

export function getStorageMode(): "supabase" | "local" {
  return useSupabase() ? "supabase" : "local";
}

export async function listEvaluations(): Promise<EvaluationSummary[]> {
  if (useSupabase()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("evaluations")
      .select("id, created_at, title, model, language, result, reviews")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(
        explainSupabaseError(`Gagal memuat history: ${error.message}`),
      );
    }

    return (data || []).map((row) => {
      const result = row.result as EvaluationResult;
      const reviews = (row.reviews as ReviewerComment[] | null) || [];
      return {
        id: row.id as string,
        createdAt: row.created_at as string,
        title: row.title as string,
        model: row.model as string,
        language: ((row.language as EvalLanguage) || "id") as EvalLanguage,
        preference: result.naturalness_overall_preference,
        reviewCount: reviews.length,
      };
    });
  }

  await ensureLocalDirs();
  const files = await fs.readdir(EVALUATIONS_DIR);
  const records: EvaluationSummary[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(EVALUATIONS_DIR, file), "utf8");
      const record = JSON.parse(raw) as EvaluationRecord;
      records.push({
        id: record.id,
        createdAt: record.createdAt,
        title: record.title,
        model: record.model,
        language: record.language || "id",
        preference: record.result.naturalness_overall_preference,
        reviewCount: record.reviews?.length || 0,
      });
    } catch {
      // skip corrupt files
    }
  }

  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getEvaluation(
  id: string,
): Promise<EvaluationRecord | null> {
  if (useSupabase()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("evaluations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(
        explainSupabaseError(`Gagal memuat evaluasi: ${error.message}`),
      );
    }
    if (!data) return null;
    return rowToRecord(data as EvaluationRow);
  }

  await ensureLocalDirs();
  try {
    const raw = await fs.readFile(localEvaluationPath(id), "utf8");
    return JSON.parse(raw) as EvaluationRecord;
  } catch {
    return null;
  }
}

export async function saveEvaluation(
  input: Omit<EvaluationRecord, "id" | "createdAt" | "title" | "reviews"> & {
    title?: string;
  },
): Promise<EvaluationRecord> {
  const record: EvaluationRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    title: input.title || makeTitle(input.textPrompt),
    textPrompt: input.textPrompt,
    language: input.language || "id",
    listenerNote: input.listenerNote?.trim() || undefined,
    languageErrors: cleanLanguageErrors(input.languageErrors),
    model: input.model,
    fileNames: input.fileNames,
    result: input.result,
    reviews: [],
  };

  if (useSupabase()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("evaluations")
      .insert({
        id: record.id,
        created_at: record.createdAt,
        title: record.title,
        text_prompt: record.textPrompt,
        language: record.language,
        listener_note: record.listenerNote || null,
        language_errors: record.languageErrors || null,
        model: record.model,
        file_names: record.fileNames,
        result: record.result,
        reviews: record.reviews,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(
        explainSupabaseError(`Gagal menyimpan evaluasi: ${error.message}`),
      );
    }
    return rowToRecord(data as EvaluationRow);
  }

  await ensureLocalDirs();
  await fs.writeFile(
    localEvaluationPath(record.id),
    JSON.stringify(record, null, 2),
    "utf8",
  );
  return record;
}

export async function deleteEvaluation(id: string): Promise<boolean> {
  if (useSupabase()) {
    const supabase = getSupabaseAdmin();
    const { error, count } = await supabase
      .from("evaluations")
      .delete({ count: "exact" })
      .eq("id", id);

    if (error) {
      throw new Error(
        explainSupabaseError(`Gagal menghapus evaluasi: ${error.message}`),
      );
    }
    return (count || 0) > 0;
  }

  try {
    await fs.unlink(localEvaluationPath(id));
    return true;
  } catch {
    return false;
  }
}

export async function readMemory(): Promise<EvaluatorMemory> {
  if (useSupabase()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("memory_skills")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(MAX_MEMORY_SKILLS);

    if (error) {
      throw new Error(
        explainSupabaseError(`Gagal memuat memory: ${error.message}`),
      );
    }

    const skills = ((data || []) as MemorySkillRow[]).map(skillRowToSkill);
    return {
      updatedAt: skills[0]?.createdAt || new Date().toISOString(),
      skills,
    };
  }

  await ensureLocalDirs();
  try {
    const raw = await fs.readFile(MEMORY_FILE, "utf8");
    return JSON.parse(raw) as EvaluatorMemory;
  } catch {
    return { updatedAt: new Date().toISOString(), skills: [] };
  }
}

async function writeLocalMemory(memory: EvaluatorMemory) {
  await ensureLocalDirs();
  await fs.writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2), "utf8");
}

export async function addReview(
  evaluationId: string,
  input: { verdict: ReviewVerdict; comment: string },
): Promise<{ record: EvaluationRecord; skill: MemorySkill }> {
  const record = await getEvaluation(evaluationId);
  if (!record) {
    throw new Error("Evaluasi tidak ditemukan.");
  }

  const comment = input.comment.trim();
  if (!comment) {
    throw new Error("Komentar reviewer wajib diisi.");
  }
  if (!["agree", "partial", "disagree"].includes(input.verdict)) {
    throw new Error("Verdict reviewer tidak valid.");
  }

  const review: ReviewerComment = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    verdict: input.verdict,
    comment,
  };
  const reviews = [...(record.reviews || []), review];

  const skill: MemorySkill = {
    id: randomUUID(),
    createdAt: review.createdAt,
    sourceEvaluationId: record.id,
    verdict: review.verdict,
    skill: comment,
  };

  if (useSupabase()) {
    const supabase = getSupabaseAdmin();
    const { data: updated, error: updateError } = await supabase
      .from("evaluations")
      .update({ reviews })
      .eq("id", evaluationId)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(
        explainSupabaseError(`Gagal menyimpan review: ${updateError.message}`),
      );
    }

    const { data: skillRow, error: skillError } = await supabase
      .from("memory_skills")
      .insert({
        id: skill.id,
        created_at: skill.createdAt,
        source_evaluation_id: record.id,
        verdict: skill.verdict,
        skill: skill.skill,
      })
      .select("*")
      .single();

    if (skillError) {
      throw new Error(
        explainSupabaseError(
          `Gagal menyimpan memory skill: ${skillError.message}`,
        ),
      );
    }

    const { data: overflow } = await supabase
      .from("memory_skills")
      .select("id")
      .order("created_at", { ascending: false })
      .range(MAX_MEMORY_SKILLS, MAX_MEMORY_SKILLS + 200);

    if (overflow?.length) {
      const ids = overflow.map((row) => row.id as string);
      await supabase.from("memory_skills").delete().in("id", ids);
    }

    return {
      record: rowToRecord(updated as EvaluationRow),
      skill: skillRowToSkill(skillRow as MemorySkillRow),
    };
  }

  record.reviews = reviews;
  await ensureLocalDirs();
  await fs.writeFile(
    localEvaluationPath(record.id),
    JSON.stringify(record, null, 2),
    "utf8",
  );

  const memory = await readMemory();
  memory.skills = [skill, ...memory.skills].slice(0, MAX_MEMORY_SKILLS);
  memory.updatedAt = new Date().toISOString();
  await writeLocalMemory(memory);

  return { record, skill };
}

export function formatMemoryForPrompt(memory: EvaluatorMemory): string {
  const parts = [formatAvalanchSkillsForPrompt()];

  if (memory.skills.length) {
    const lines = memory.skills.slice(0, 20).map((item, index) => {
      const tag =
        item.verdict === "agree"
          ? "AGREE"
          : item.verdict === "partial"
            ? "PARTIAL"
            : "DISAGREE";
      return `${index + 1}. [${tag}] ${item.skill}`;
    });

    parts.push(
      `Additional reviewer memory (learned corrections — apply carefully):
${lines.join("\n")}`,
    );
  }

  return parts.join("\n\n");
}
