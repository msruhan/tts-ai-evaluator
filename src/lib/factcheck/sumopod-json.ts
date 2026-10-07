import OpenAI from "openai";
import { getSumopodModel } from "../sumopod";

const BASE_URL = process.env.SUMOPOD_BASE_URL || "https://ai.sumopod.com/v1";

export async function runSumopodOnce(prompt: string, schema: object, timeoutMs: number): Promise<string> {
  const apiKey = process.env.SUMOPOD_API_KEY;
  if (!apiKey) throw new Error("SUMOPOD_API_KEY belum diset di .env.local.");

  const client = new OpenAI({ apiKey, baseURL: BASE_URL, timeout: timeoutMs, maxRetries: 0 });
  const response = await client.chat.completions.create({
    model: process.env.FACTCHECK_SUMOPOD_MODEL?.trim() || getSumopodModel(),
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: "You are a careful factuality reviewer. Use only the information in the user message. Answer only with JSON matching the provided schema.",
      },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "factcheck_output", strict: true, schema: schema as Record<string, unknown> },
    },
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Sumopod tidak mengembalikan hasil.");
  return text;
}
