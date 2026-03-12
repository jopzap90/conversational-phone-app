import { NextRequest, NextResponse } from "next/server";
import OpenAI, { APIError } from "openai";
import type { Caller } from "@/lib/callers";
import {
  buildCallSystemPrompt,
  buildSystemPrompt,
  DEFAULT_MODEL,
  MAX_HISTORY_MESSAGES,
  type LanguageMode,
} from "@/lib/persona";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant"; content: string };

function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  return messages.slice(-MAX_HISTORY_MESSAGES);
}

function isCaller(obj: unknown): obj is Caller {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    (o.gender === "male" || o.gender === "female") &&
    typeof o.ttsVoice === "string"
  );
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing OPENAI_API_KEY. On Vercel: Project → Settings → Environment Variables → add OPENAI_API_KEY, then Redeploy. Local .env.local is not deployed.",
      },
      { status: 500 }
    );
  }

  let body: {
    messages?: ChatMessage[];
    mode?: LanguageMode;
    caller?: Caller;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const mode: LanguageMode =
    body.mode === "immersion" ? "immersion" : "supportive";

  const systemPrompt = isCaller(body.caller)
    ? buildCallSystemPrompt(body.caller)
    : buildSystemPrompt(mode);

  const history = trimHistory(
    messages.filter(
      (m): m is ChatMessage =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
  );

  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ],
      max_tokens: 500,
      temperature: 0.85,
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!text) {
      return NextResponse.json(
        { error: "Empty response from model" },
        { status: 502 }
      );
    }
    return NextResponse.json({ reply: text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Chat failed";
    let httpStatus = 502;
    if (e instanceof APIError && typeof e.status === "number") {
      httpStatus = e.status;
    } else if (/^429\b|quota|rate limit/i.test(message)) {
      httpStatus = 429;
    }
    return NextResponse.json({ error: message }, { status: httpStatus });
  }
}
