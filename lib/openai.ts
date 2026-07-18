import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || process.env.CALL_ASSIST_DEMO_MODE === "true") return null;
  client ??= new OpenAI({ apiKey });
  return client;
}

export const PLANNING_MODEL =
  process.env.OPENAI_PLANNING_MODEL ?? "gpt-5.6-sol";

