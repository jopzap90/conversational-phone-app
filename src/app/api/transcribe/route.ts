import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

/**
 * Whisper STT with fixed Portuguese language for reliable pt-BR practice.
 * Use when browser SpeechRecognition is unavailable or inaccurate.
 */
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

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey });
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: file as File,
      model: "whisper-1",
      language: "pt", // Brazilian/European both use pt; prompt handles BR tone
    });
    const text = transcription.text?.trim() ?? "";
    return NextResponse.json({ text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
