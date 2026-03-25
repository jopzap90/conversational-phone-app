import { NextRequest, NextResponse } from "next/server";
import { appendFileSync } from "fs";

const DEBUG_LOG =
  "/Users/johnphilippezapido/Desktop/My Apps/phone-app-for-language-learning/.cursor/debug-9b2c32.log";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const b = body as Partial<{
    hypothesisId: string;
    location: string;
    message: string;
    data: Record<string, unknown>;
    runId: string;
    sessionId: string;
  }>;

  const line =
    JSON.stringify({
      sessionId: b.sessionId || "9b2c32",
      timestamp: Date.now(),
      id: `clientlog_${Math.random().toString(16).slice(2)}`,
      hypothesisId: b.hypothesisId || "unknown",
      location: b.location || "client-log",
      message: b.message || "log",
      data: b.data || {},
      runId: b.runId || "pre-fix",
    }) + "\n";

  try {
    appendFileSync(DEBUG_LOG, line);
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true });
}

