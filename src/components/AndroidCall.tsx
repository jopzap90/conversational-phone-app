"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Caller } from "@/lib/callers";
import { pickRandomCaller } from "@/lib/callers";

// #region agent log
const eventBufferRef = { current: [] as string[] };
const DEBUG_LOG = (
  message: string,
  data: Record<string, unknown> & { hypothesisId?: string }
) => {
  const entry = `${message} ${JSON.stringify(data)}`;
  eventBufferRef.current = [...eventBufferRef.current.slice(-4), entry];
  const hypothesisId = data.hypothesisId || "unknown";
  if (typeof window !== "undefined") {
    // #region server fallback (writes to local NDJSON file)
    fetch("/api/client-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "9b2c32",
        runId: "pre-mobile",
        hypothesisId,
        location: "AndroidCall.tsx",
        message,
        data: {
          ...data,
          userAgent:
            typeof navigator !== "undefined"
              ? navigator.userAgent.slice(0, 80)
              : "",
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    fetch(
      "http://127.0.0.1:7625/ingest/eb0e6ea3-571e-43ca-b6ad-ffedc9fab7d9",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "9b2c32",
        },
        body: JSON.stringify({
          sessionId: "9b2c32",
          location: "AndroidCall.tsx",
          message,
          data: {
            ...data,
            userAgent:
              typeof navigator !== "undefined"
                ? navigator.userAgent.slice(0, 80)
                : "",
          },
          timestamp: Date.now(),
        }),
      }
    ).catch(() => {});
  }
};
// #endregion

type Message = { role: "user" | "assistant"; content: string };
type Phase = "ringing" | "incall" | "ended";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Simple two-tone ring using Web Audio. Only start after user gesture (autoplay policy). */
function useRinging(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  useEffect(() => {
    if (!active) {
      stop();
      return;
    }
    // Resume/create after gesture — if suspended, interval beeps still fail until resumed
    const ctx = new AudioContext();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    ctxRef.current = ctx;

    const beep = () => {
      if (ctx.state === "closed") return;
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const g = ctx.createGain();
      o1.frequency.value = 440;
      o2.frequency.value = 480;
      o1.connect(g);
      o2.connect(g);
      g.connect(ctx.destination);
      g.gain.value = 0.08;
      o1.start();
      o2.start();
      o1.stop(ctx.currentTime + 0.15);
      o2.stop(ctx.currentTime + 0.15);
    };

    beep();
    intervalRef.current = setInterval(beep, 2200);

    return stop;
  }, [active, stop]);

  return stop;
}

async function speakTts(text: string, voice: string): Promise<void> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || "TTS failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Audio play failed"));
      audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function transcribeAudio(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", blob, "audio.webm");
  const res = await fetch("/api/transcribe", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Transcribe failed");
  return (data.text as string) || "";
}

async function chatReply(
  messages: Message[],
  caller: Caller
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, caller }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Chat failed");
  return data.reply as string;
}

export default function AndroidCall() {
  // Caller only after mount avoids hydration mismatch (React #418): server vs client random differed.
  const [caller, setCaller] = useState<Caller | null>(null);
  const [phase, setPhase] = useState<Phase>("ringing");
  const [error, setError] = useState<string | null>(null);
  const [callSeconds, setCallSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  /** Ring sound only after user gesture (tap) — satisfies AudioContext autoplay policy. */
  const [ringUnlocked, setRingUnlocked] = useState(false);
  const messagesRef = useRef<Message[]>([]);
  const abortRef = useRef(false);

  useEffect(() => {
    setCaller(pickRandomCaller());
  }, []);

  // Log visibility changes during call (mobile often hides page when phone to ear)
  useEffect(() => {
    if (phase !== "incall" || typeof document === "undefined") return;
    const onVisibility = () => {
      // #region agent log
      DEBUG_LOG("visibility change", {
        hypothesisId: "H5",
        visibility: document.visibilityState,
        phase,
      });
      // #endregion
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [phase]);

  const stopRing = useRinging(phase === "ringing" && ringUnlocked && caller !== null);

  // Call timer
  useEffect(() => {
    if (phase !== "incall") return;
    const t = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const hangUp = useCallback(() => {
    // #region agent log
    DEBUG_LOG("hangUp called", { hypothesisId: "H1", phase });
    // #endregion
    abortRef.current = true;
    stopRing();
    setPhase("ended");
    setBusy(false);
    messagesRef.current = [];
  }, [stopRing, phase]);

  const unlockRing = useCallback(() => setRingUnlocked(true), []);

  const answer = useCallback(async () => {
    if (!caller || busy) return;
    abortRef.current = false;
    setBusy(true);
    setError(null);
    stopRing();
    setPhase("incall");
    setCallSeconds(0);
    messagesRef.current = [];

    try {
      // Opening line — model speaks first as the caller
      const openingUser =
        "(Acabei de atender. Você ligou. Diga uma saudação natural de ligação, bem curta, em português paulista.)";
      messagesRef.current = [{ role: "user", content: openingUser }];
      let reply = await chatReply(messagesRef.current, caller);
      messagesRef.current.push({ role: "assistant", content: reply });
      await speakTts(reply, caller.ttsVoice);
      // #region agent log
      DEBUG_LOG("opening TTS done, entering loop", { hypothesisId: "H3" });
      // #endregion

      // Voice loop until hang up
      let loopCount = 0;
      while (!abortRef.current) {
        loopCount += 1;
        // #region agent log
        DEBUG_LOG("voice loop iteration start", {
          hypothesisId: "H4",
          loopCount,
          visibility: typeof document !== "undefined" ? document.visibilityState : "",
        });
        // #endregion
        setBusy(true);
        let stream: MediaStream | null = null;
        let recorder: MediaRecorder | null = null;
        let chunks: BlobPart[] = [];
        let blobType = "audio/webm";

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });

          // Some mobile browsers don't support `audio/webm` consistently; fall back to
          // MediaRecorder defaults when needed.
          const preferredMimeType = "audio/webm";
          const canUseWebm =
            typeof MediaRecorder !== "undefined" &&
            typeof MediaRecorder.isTypeSupported === "function" &&
            MediaRecorder.isTypeSupported(preferredMimeType);

          recorder = new MediaRecorder(
            stream,
            canUseWebm ? { mimeType: preferredMimeType } : undefined
          );
          blobType = recorder.mimeType || blobType;

          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size) chunks.push(e.data);
          };

          // Critical: attach `onstop` before calling `stop()`, otherwise some mobile
          // browsers can fire `stop` before the handler is registered (leading to a hang).
          const stopPromise = new Promise<void>((resolve, reject) => {
            recorder!.onstop = () => resolve();
            recorder!.onerror = () =>
              reject(recorder?.error ?? new Error("MediaRecorder error"));
          });

          recorder.start();
          await new Promise((r) => setTimeout(r, 5000));

          try {
            recorder.stop();
          } catch {
            // We'll still fail via the safety timeout below if needed.
          }

          await Promise.race([
            stopPromise,
            new Promise<void>((_, reject) =>
              setTimeout(
                () => reject(new Error("Recording timeout")),
                7000
              )
            ),
          ]);
        } finally {
          stream?.getTracks().forEach((t) => t.stop());
        }

        if (abortRef.current) break;

        const blob = new Blob(chunks, { type: blobType });
        const text = await transcribeAudio(blob);
        if (abortRef.current) break;
        if (!text.trim()) continue;

        messagesRef.current.push({ role: "user", content: text });
        reply = await chatReply(messagesRef.current, caller);
        if (abortRef.current) break;
        messagesRef.current.push({ role: "assistant", content: reply });
        await speakTts(reply, caller.ttsVoice);
      }
    } catch (e) {
      // #region agent log
      DEBUG_LOG("answer() catch", {
        hypothesisId: "H2",
        errMessage: e instanceof Error ? e.message : String(e),
        errName: e instanceof Error ? e.name : "",
        abortCurrent: abortRef.current,
      });
      // #endregion
      if (!abortRef.current) {
        const msg = e instanceof Error ? e.message : "Erro na ligação";
        const trail =
          eventBufferRef.current.length > 0
            ? ` [últimos: ${eventBufferRef.current.join(" | ")}]`
            : "";
        setError(msg + trail);
      }
    } finally {
      setBusy(false);
    }
  }, [caller, busy, stopRing]);

  const decline = useCallback(() => {
    hangUp();
  }, [hangUp]);

  const newCall = useCallback(() => {
    setCaller(pickRandomCaller());
    setPhase("ringing");
    setCallSeconds(0);
    setError(null);
    setRingUnlocked(false);
  }, []);

  // —— Android-style incoming call ——
  if (phase === "ringing") {
    const c = caller;
    return (
      <div
        className="flex min-h-screen flex-col bg-[#0d1117] text-white"
        onPointerDown={unlockRing}
        role="presentation"
      >
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div
            className={`mb-6 flex h-28 w-28 items-center justify-center rounded-full text-4xl font-medium text-white ${
              c?.gender === "male" ? "bg-[#1a5f7a]" : c ? "bg-[#7a1a5f]" : "bg-slate-600"
            }`}
          >
            {c ? c.name[0] : "?"}
          </div>
          <h1 className="text-2xl font-normal">{c ? c.name : "Chamada"}</h1>
          <p className="mt-2 text-sm text-white/60">
            {c ? "Ligação recebida" : "Preparando…"}
          </p>
          {!ringUnlocked && c && (
            <p className="mt-2 text-xs text-white/40">
              Toque na tela para ativar o toque
            </p>
          )}
          {error && (
            <p className="mt-4 text-center text-sm text-red-400">{error}</p>
          )}
        </div>
        <div className="flex items-center justify-center gap-16 pb-16 pt-8">
          <button
            type="button"
            onClick={decline}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e53935] shadow-lg"
            aria-label="Recusar"
          >
            <svg
              className="h-7 w-7 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.29 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={answer}
            disabled={busy || !c}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#43a047] shadow-lg disabled:opacity-50"
            aria-label="Atender"
          >
            <svg
              className="h-7 w-7 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // —— Call ended ——
  if (phase === "ended") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d1117] px-6 text-white">
        <p className="text-white/70">Ligação encerrada</p>
        <button
          type="button"
          onClick={newCall}
          className="mt-8 rounded-full bg-[#43a047] px-8 py-3 font-medium text-white"
        >
          Nova ligação
        </button>
      </div>
    );
  }

  // —— In-call (Android-style) ——
  if (!caller) return null;
  return (
    <div className="flex min-h-screen flex-col bg-[#0d1117] text-white">
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div
          className={`mb-6 flex h-24 w-24 items-center justify-center rounded-full text-3xl font-medium ${
            caller.gender === "male" ? "bg-[#1a5f7a]" : "bg-[#7a1a5f]"
          }`}
        >
          {caller.name[0]}
        </div>
        <h1 className="text-xl font-normal">{caller.name}</h1>
        <p className="mt-2 font-mono text-sm text-white/60">
          {formatDuration(callSeconds)}
        </p>
        {busy && (
          <p className="mt-4 text-sm text-white/50">Ouvindo…</p>
        )}
        {error && (
          <p className="mt-4 text-center text-sm text-red-400">{error}</p>
        )}
      </div>
      <div className="flex justify-center pb-16 pt-8">
        <button
          type="button"
          onClick={hangUp}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e53935] shadow-lg"
          aria-label="Desligar"
        >
          <svg
            className="h-8 w-8 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.29 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
