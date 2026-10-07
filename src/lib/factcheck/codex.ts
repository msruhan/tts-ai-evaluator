import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runSumopodOnce } from "./sumopod-json";

const CHATGPT_BUNDLED_CODEX =
  "/Applications/ChatGPT.app/Contents/Resources/codex";
const DEFAULT_TIMEOUT_MS = 120_000;
const PROMPT_PREFIX =
  "Do not run any commands, tools, or web searches. Use only the information in this prompt. Answer only with JSON matching the provided schema.\n\n";

async function isExecutable(file: string) {
  try {
    await access(file, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

let cachedBin: string | null = null;

export async function resolveCodexBin(): Promise<string> {
  if (cachedBin) return cachedBin;
  const configured = process.env.CODEX_BIN?.trim();
  if (configured) {
    if (await isExecutable(configured)) return (cachedBin = configured);
    throw new Error(`CODEX_BIN tidak bisa dieksekusi: ${configured}`);
  }
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, "codex");
    if (await isExecutable(candidate)) return (cachedBin = candidate);
  }
  if (await isExecutable(CHATGPT_BUNDLED_CODEX)) {
    return (cachedBin = CHATGPT_BUNDLED_CODEX);
  }
  throw new Error(
    "Codex CLI tidak ditemukan. Install Codex / ChatGPT desktop dan login, atau set CODEX_BIN di .env.local.",
  );
}

export function assertLocalRuntime() {
  if (process.env.VERCEL) {
    throw new Error(
      "Fact Check hanya jalan lokal (npm run dev) dengan Codex CLI yang sudah login.",
    );
  }
}

type RunOptions = { timeoutMs?: number; label?: string };

async function runOnce(
  bin: string,
  prompt: string,
  schema: object,
  timeoutMs: number,
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "factcheck-codex-"));
  const schemaFile = path.join(dir, "schema.json");
  const outFile = path.join(dir, "out.json");
  try {
    await writeFile(schemaFile, JSON.stringify(schema));
    const args = [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "-s",
      "read-only",
      "-C",
      dir,
      "--color",
      "never",
      "--output-schema",
      schemaFile,
      "-o",
      outFile,
      "-c",
      `model_reasoning_effort="${process.env.CODEX_REASONING_EFFORT?.trim() || "low"}"`,
    ];
    const model = process.env.CODEX_MODEL?.trim();
    if (model) args.push("-m", model);
    args.push("-");

    const stderr = await new Promise<string>((resolve, reject) => {
      const child = spawn(bin, args, { cwd: dir, env: process.env });
      let errBuf = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`Codex timeout setelah ${Math.round(timeoutMs / 1000)} detik.`));
      }, timeoutMs);
      child.stdout.on("data", () => {});
      child.stderr.on("data", (chunk: Buffer) => {
        errBuf = (errBuf + chunk.toString()).slice(-4000);
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(errBuf);
        else
          reject(
            new Error(`Codex exit ${code}: ${errBuf.slice(-500).trim()}`),
          );
      });
      child.stdin.end(PROMPT_PREFIX + prompt);
    });

    const out = (await readFile(outFile, "utf8").catch(() => "")).trim();
    if (!out) {
      throw new Error(`Codex tidak menulis hasil. ${stderr.slice(-500).trim()}`);
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Codex mengembalikan JSON yang tidak valid.");
  }
}

type Provider = "codex" | "sumopod" | "auto";

function readProvider(): Provider {
  const value = process.env.FACTCHECK_LLM?.trim().toLowerCase();
  return value === "sumopod" || value === "auto" ? value : "codex";
}

async function withRetry<T>(run: () => Promise<string>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseJsonLoose(await run()) as T;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function message(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export async function runCodexJson<T>(
  prompt: string,
  schema: object,
  opts: RunOptions = {},
): Promise<T> {
  const provider = readProvider();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const label = opts.label ? ` (${opts.label})` : "";
  const viaSumopod = () => withRetry<T>(() => runSumopodOnce(prompt, schema, timeoutMs));

  if (provider === "sumopod") {
    try {
      return await viaSumopod();
    } catch (err) {
      throw new Error(`Panggilan Sumopod gagal${label}: ${message(err)}`);
    }
  }

  let codexError: unknown;
  try {
    assertLocalRuntime();
    const bin = await resolveCodexBin();
    return await withRetry<T>(() => runOnce(bin, prompt, schema, timeoutMs));
  } catch (err) {
    codexError = err;
  }
  if (provider === "auto") {
    try {
      return await viaSumopod();
    } catch (err) {
      throw new Error(
        `Panggilan AI gagal${label}. Codex: ${message(codexError)} · Sumopod: ${message(err)}`,
      );
    }
  }
  throw new Error(`Panggilan Codex gagal${label}: ${message(codexError)}`);
}
