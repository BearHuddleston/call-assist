import OpenAI from "openai";

let client: OpenAI | null = null;

export function getPlanningMode(): "ai" | "demo" {
  return process.env.OPENAI_API_KEY && process.env.CALL_ASSIST_DEMO_MODE !== "true"
    ? "ai"
    : "demo";
}

export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || getPlanningMode() === "demo") return null;
  client ??= new OpenAI({ apiKey });
  return client;
}

export const PLANNING_MODEL =
  process.env.OPENAI_PLANNING_MODEL ?? "gpt-5.6-sol";

export const PLANNING_REASONING_EFFORT =
  process.env.OPENAI_PLANNING_REASONING_EFFORT === "medium" ? "medium" : "low";
