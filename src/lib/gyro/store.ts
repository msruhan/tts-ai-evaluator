import { promises as fs } from "fs";
import path from "path";
import type { GyroMemory, GyroMemorySkill } from "./types";
import { formatGyroSkillsForPrompt, GYRO_REVIEWER_SKILLS } from "./avalanch-reviewer-skills";

const MAX_SKILLS = 40;
const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_FILE = path.join(DATA_DIR, "gyro-memory.json");

const EMPTY: GyroMemory = { skills: [], sources: [], playbook: "" };

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readGyroMemory(): Promise<GyroMemory> {
  try {
    await ensureDir();
    const raw = await fs.readFile(MEMORY_FILE, "utf8");
    const parsed = JSON.parse(raw) as GyroMemory;
    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills.slice(-MAX_SKILLS) : [],
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      playbook: String(parsed.playbook || "").slice(0, 1200),
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function writeGyroMemory(memory: GyroMemory): Promise<void> {
  await ensureDir();
  const next: GyroMemory = {
    skills: (memory.skills || []).slice(-MAX_SKILLS),
    sources: memory.sources || [],
    playbook: String(memory.playbook || "").slice(0, 1200),
  };
  await fs.writeFile(MEMORY_FILE, JSON.stringify(next, null, 2), "utf8");
}

export async function addGyroSkills(
  skills: string[],
  sourceName = "reviewer",
): Promise<number> {
  const incoming = skills.map((s) => s.trim()).filter((s) => s.length >= 12).slice(0, 5);
  if (!incoming.length) return 0;
  const mem = await readGyroMemory();
  const seen = new Set(mem.skills.map((s) => s.skill.toLowerCase()));
  const now = new Date().toISOString();
  const add: GyroMemorySkill[] = [];
  for (const skill of incoming) {
    if (seen.has(skill.toLowerCase())) continue;
    seen.add(skill.toLowerCase());
    add.push({
      id: `gyro-${Date.now()}-${add.length}`,
      skill: skill.slice(0, 160),
      sourceName,
      createdAt: now,
    });
  }
  if (!add.length) return 0;
  const skillsAll = [...mem.skills, ...add].slice(-MAX_SKILLS);
  const sources = [...mem.sources];
  const hit = sources.find((s) => s.name === sourceName);
  const count = skillsAll.filter((s) => s.sourceName === sourceName).length;
  if (hit) hit.skillCount = count;
  else sources.push({ name: sourceName, skillCount: count, addedAt: now });
  const playbook =
    mem.playbook.trim() ||
    skillsAll
      .slice(-8)
      .map((s) => s.skill)
      .join(" ")
      .slice(0, 1200);
  await writeGyroMemory({ skills: skillsAll, sources, playbook });
  return add.length;
}

export function formatGyroMemoryForPrompt(memory: GyroMemory): string {
  const playbook = memory.playbook?.trim();
  const extra = (memory.skills || [])
    .slice(-8)
    .map((s) => s.skill)
    .filter((s) => s && !playbook?.includes(s));
  const body = [playbook, extra.join(" | ")].filter(Boolean).join("\n").slice(0, 900);
  if (!body) return "";
  return `\nGyro reviewer memory (use if relevant; page/task evidence wins if conflict):\n${body}\n`;
}

export function formatGyroGuideForPrompt(memory: GyroMemory): string {
  return `${formatGyroSkillsForPrompt()}${formatGyroMemoryForPrompt(memory)}\nFoundation skill count: ${GYRO_REVIEWER_SKILLS.length}.`;
}
