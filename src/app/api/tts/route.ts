import { NextRequest, NextResponse } from "next/server";
import OpenAI, { APIError } from "openai";

export const runtime = "nodejs";

const VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing OPENAI_API_KEY. Add it in Vercel Environment Variables and redeploy.",
      },
      { status: 500 }
    );
  }

  let body: { text?: string; voice?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const voice =
    VOICES.includes(body.voice as (typeof VOICES)[number]) ?
      (body.voice as (typeof VOICES)[number])
    : "nova";

  const openai = new OpenAI({ apiKey });
  try {
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: text,
      // Portuguese is inferred from input; no separate accent param in API
    });
    const buf = Buffer.from(await mp3.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buf.length),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "TTS failed";
    let httpStatus = 502;
    if (e instanceof APIError && typeof e.status === "number") {
      httpStatus = e.status;
    }
    return NextResponse.json({ error: message }, { status: httpStatus });
  }
}
