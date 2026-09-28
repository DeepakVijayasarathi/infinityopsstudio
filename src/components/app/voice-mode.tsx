"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Mic, MicOff, Settings2, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { listen, listVoices, parseCommand, speak, stopSpeaking, toSpeech, voiceSupport, type VoiceSupport } from "@/lib/voice";

export type VoiceAction = { id: string; title: string; description: string; action: { type: string; [k: string]: unknown }; state?: "running" | "done" | "dismissed" | "error"; result?: { message: string; href?: string } };
export type VoiceMsg = { id: string; role: "user" | "assistant"; content: string; actions?: VoiceAction[] };

export type VoiceSettings = { lang: string; voiceName: string | null; speakReplies: boolean; wakeWord: boolean };
export const DEFAULT_VOICE: VoiceSettings = { lang: "en-IN", voiceName: null, speakReplies: true, wakeWord: false };
const SETTINGS_KEY = "ios:voice";

export function loadVoiceSettings(): VoiceSettings {
  try {
    return { ...DEFAULT_VOICE, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<VoiceSettings>) };
  } catch {
    return DEFAULT_VOICE;
  }
}
export function saveVoiceSettings(s: VoiceSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

const LANGS = [
  { value: "en-IN", label: "English (India)" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "hi-IN", label: "हिन्दी" },
  { value: "ta-IN", label: "தமிழ்" },
];

type Phase = "idle" | "listening" | "thinking" | "speaking";

const pending = (m?: VoiceMsg) => m?.actions?.filter((a) => !a.state) ?? [];

/** What to say after an answer, so the next step is obvious by ear. */
function followUp(actions: VoiceAction[]): string {
  if (!actions.length) return "";
  const first = actions[0]!;
  if (first.action.type === "navigate") return ` Say yes to ${first.title.toLowerCase()}.`;
  if (actions.length === 1) return ` I can ${first.title.charAt(0).toLowerCase()}${first.title.slice(1)}. Shall I go ahead?`;
  return ` I have ${actions.length} actions ready, starting with: ${first.title}. Say yes for the first, or approve all.`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  messages: VoiceMsg[];
  send: (text: string) => Promise<VoiceMsg | null>;
  approve: (msg: VoiceMsg, p: VoiceAction) => Promise<{ message: string; href?: string } | null>;
  dismiss: (msg: VoiceMsg, p: VoiceAction) => void;
  settings: VoiceSettings;
  onSettings: (s: VoiceSettings) => void;
  /** Words already spoken after the wake word, to handle straight away. */
  initialCommand?: string | null;
};

export function VoiceMode({ open, onClose, messages, send, approve, dismiss, settings, onSettings, initialCommand }: Props) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [heard, setHeard] = React.useState("");
  const [caption, setCaption] = React.useState("");
  const [support, setSupport] = React.useState<VoiceSupport>({ ok: true });
  const [showSettings, setShowSettings] = React.useState(false);
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([]);
  const stopRef = React.useRef<() => void>(() => undefined);
  const openRef = React.useRef(open);
  const silentRounds = React.useRef(0);
  const latest = React.useRef({ messages, settings });
  latest.current = { messages, settings };
  openRef.current = open;

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  const say = React.useCallback((text: string, then?: () => void) => {
    const s = latest.current.settings;
    setCaption(text);
    if (!s.speakReplies) {
      then?.();
      return;
    }
    setPhase("speaking");
    speak(text, { lang: s.lang, voiceName: s.voiceName, onEnd: () => openRef.current && then?.() });
  }, []);

  // `startListening` and `handle` call each other; the ref breaks the cycle.
  const handleRef = React.useRef<(text: string) => void>(() => undefined);

  const startListening = React.useCallback(() => {
    if (!openRef.current) return;
    stopRef.current();
    stopSpeaking();
    setHeard("");
    setPhase("listening");
    let got = false;
    stopRef.current = listen({
      lang: latest.current.settings.lang,
      onInterim: setHeard,
      onFinal: (t) => {
        got = true;
        silentRounds.current = 0;
        setHeard(t);
        handleRef.current(t);
      },
      onError: (e) => {
        if (e === "not-allowed" || e === "service-not-allowed") {
          setCaption("Microphone access is blocked. Allow it in your browser's site settings, then tap the orb.");
          setPhase("idle");
        }
      },
      onEnd: () => {
        if (got || !openRef.current) return;
        // Keep the ear open through short pauses, then rest until tapped.
        silentRounds.current += 1;
        if (silentRounds.current < 3) startListening();
        else setPhase("idle");
      },
    });
  }, []);

  const approveAndReport = React.useCallback(
    async (msg: VoiceMsg, list: VoiceAction[]) => {
      setPhase("thinking");
      const results: string[] = [];
      for (const p of list) {
        const r = await approve(msg, p);
        if (r) results.push(r.message);
        if (p.action.type === "navigate") {
          onClose();
          return;
        }
      }
      say(results.join(" ") || "Done.", startListening);
    },
    [approve, onClose, say, startListening],
  );

  const handle = React.useCallback(
    async (text: string) => {
      stopRef.current();
      const cmd = parseCommand(text);
      const last = [...latest.current.messages].reverse().find((m) => m.role === "assistant");
      const waiting = pending(last);

      if (cmd?.kind === "stop") {
        stopSpeaking();
        return startListening();
      }
      if (cmd?.kind === "sleep") return say("Goodbye.", onClose);
      if (cmd?.kind === "approve" && waiting.length && last) return approveAndReport(last, cmd.all ? waiting : [waiting[0]!]);
      if (cmd?.kind === "dismiss" && waiting.length && last) {
        waiting.forEach((p) => dismiss(last, p));
        return say("Okay, I won't do that.", startListening);
      }

      setPhase("thinking");
      setCaption("");
      const reply = await send(text);
      if (!openRef.current) return;
      if (!reply) return say("Sorry, something went wrong. Please try again.", startListening);
      say(toSpeech(reply.content) + followUp(pending(reply)), startListening);
    },
    [approveAndReport, dismiss, onClose, say, send, startListening],
  );
  handleRef.current = (t) => void handle(t);

  // Open: greet (or act on what followed the wake word), then listen. Close: stop everything.
  React.useEffect(() => {
    if (!open) return;
    const s = voiceSupport();
    setSupport(s);
    silentRounds.current = 0;
    if (!s.ok) return;
    if (initialCommand) {
      setHeard(initialCommand);
      void handle(initialCommand);
    } else say("Hi, how can I help?", startListening);
    return () => {
      stopRef.current();
      stopSpeaking();
      setPhase("idle");
      setHeard("");
      setCaption("");
    };
    // Only on open/close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setVoices(listVoices().filter((v) => v.lang.split("-")[0] === settings.lang.split("-")[0]));
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [open, settings.lang]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " " && (e.target as HTMLElement).tagName !== "SELECT" && (e.target as HTMLElement).tagName !== "BUTTON") {
        e.preventDefault();
        onOrb();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onOrb() {
    if (phase === "listening") {
      stopRef.current();
      setPhase("idle");
    } else {
      silentRounds.current = 0;
      startListening();
    }
  }

  if (!open) return null;

  const status = { idle: "Tap the orb or press Space to talk", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking — tap to interrupt" }[phase];
  const waiting = pending(lastAssistant);

  return (
    <div role="dialog" aria-modal="true" aria-label="Voice assistant" className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[radial-gradient(ellipse_at_center,#10204a_0%,#070b1d_55%,#03050d_100%)] text-white">
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        <p className="text-sm font-medium tracking-wide text-cyan-200/90">Copilot · Voice</p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onSettings({ ...settings, speakReplies: !settings.speakReplies })} className="grid size-9 place-items-center rounded-full text-white/80 hover:bg-white/10" aria-label={settings.speakReplies ? "Mute voice replies" : "Speak replies"} aria-pressed={settings.speakReplies}>
            {settings.speakReplies ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
          </button>
          <button type="button" onClick={() => setShowSettings((v) => !v)} className="grid size-9 place-items-center rounded-full text-white/80 hover:bg-white/10" aria-label="Voice settings" aria-expanded={showSettings}>
            <Settings2 className="size-5" />
          </button>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full text-white/80 hover:bg-white/10" aria-label="Close voice mode">
            <X className="size-5" />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="mx-4 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm backdrop-blur sm:absolute sm:right-6 sm:top-14 sm:mx-0 sm:w-80">
          <label className="block">
            <span className="mb-1 block text-white/70">Language</span>
            <select value={settings.lang} onChange={(e) => onSettings({ ...settings, lang: e.target.value, voiceName: null })} className="w-full rounded-lg border border-white/15 bg-[#0b1230] px-2 py-2">
              {LANGS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-white/70">Voice</span>
            <select value={settings.voiceName ?? ""} onChange={(e) => onSettings({ ...settings, voiceName: e.target.value || null })} className="w-full rounded-lg border border-white/15 bg-[#0b1230] px-2 py-2">
              <option value="">Automatic</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={settings.wakeWord} onChange={(e) => onSettings({ ...settings, wakeWord: e.target.checked })} />
            <span>
              <span className="block">Wake word “Hey Jarvis”</span>
              <span className="text-xs text-white/60">Say “Hey Jarvis” or “Hey Copilot” on any page while this tab is open. Your browser shows the microphone as in use.</span>
            </span>
          </label>
          <p className="text-xs text-white/50">Speech is recognised by your browser (Chrome and Edge use their online speech service). Only the text reaches InfinityOps.</p>
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
        {!support.ok ? (
          <div className="max-w-md space-y-3">
            <MicOff className="mx-auto size-10 text-white/60" />
            <p className="text-lg font-medium">{support.reason === "insecure" ? "Voice needs a secure (https) connection" : "This browser doesn't support voice"}</p>
            <p className="text-sm text-white/70">
              {support.reason === "insecure" ? "Browsers only allow the microphone on https:// sites. Open the app on your domain with HTTPS (deploy with DOMAIN=yourdomain.com), then try again." : "Use Chrome, Edge or Safari for voice. You can still type to Copilot."}
            </p>
          </div>
        ) : (
          <>
            <button type="button" onClick={onOrb} aria-label={phase === "listening" ? "Stop listening" : "Start talking"} className="relative grid size-56 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/60 sm:size-64">
              {phase === "listening" && <span className="absolute inset-4 animate-ping rounded-full bg-cyan-400/20" aria-hidden />}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#22d3ee,#3b82f6,#8b5cf6,#22d3ee)] opacity-80 blur-2xl transition-transform duration-500",
                  phase === "thinking" ? "animate-spin [animation-duration:2.5s]" : "animate-voice-breathe",
                  phase === "listening" && "scale-110",
                )}
              />
              <span aria-hidden className="absolute inset-6 rounded-full border border-cyan-200/30 bg-[radial-gradient(circle_at_35%_30%,#7dd3fc_0%,#2563eb_45%,#1e1b4b_100%)] shadow-[0_0_80px_rgba(56,189,248,0.45)]" />
              <span aria-hidden className="relative flex h-16 items-center gap-1.5">
                {phase === "speaking" ? (
                  [0, 1, 2, 3, 4].map((i) => <span key={i} className="h-full w-2 origin-center animate-voice-bar rounded-full bg-white/90" style={{ animationDelay: `${i * 0.12}s` }} />)
                ) : phase === "thinking" ? (
                  <span className="size-3 animate-pulse rounded-full bg-white" />
                ) : (
                  <Mic className={cn("size-12", phase === "listening" ? "text-white" : "text-white/80")} />
                )}
              </span>
            </button>

            <div className="min-h-24 max-w-2xl space-y-3" aria-live="polite">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-200/80">{status}</p>
              {heard && <p className="text-lg text-white/70">“{heard}”</p>}
              {caption && <p className="text-xl leading-relaxed text-white sm:text-2xl">{caption}</p>}
            </div>

            {waiting.length > 0 && lastAssistant && (
              <div className="flex w-full max-w-xl flex-col gap-2">
                {waiting.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-left backdrop-blur">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.title}</span>
                      <span className="block truncate text-xs text-white/60">{p.description}</span>
                    </span>
                    <button type="button" onClick={() => dismiss(lastAssistant, p)} className="rounded-lg px-2 py-1 text-xs text-white/70 hover:bg-white/10">
                      Dismiss
                    </button>
                    <button type="button" onClick={() => void approveAndReport(lastAssistant, [p])} className="inline-flex items-center gap-1 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300">
                      <Check className="size-3.5" /> {p.action.type === "navigate" ? "Open" : "Approve"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {lastAssistant?.actions?.some((a) => a.state === "done" && a.result?.href) && (
              <div className="flex flex-wrap justify-center gap-2 text-sm">
                {lastAssistant.actions
                  .filter((a) => a.state === "done" && a.result?.href)
                  .map((a) => (
                    <Link key={a.id} href={a.result!.href!} onClick={onClose} className="rounded-full border border-cyan-300/40 px-3 py-1 text-cyan-100 hover:bg-cyan-300/10">
                      Open: {a.title}
                    </Link>
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      <p className="pb-6 text-center text-xs text-white/50">
        Try: “How are we doing this month?” · “Which leads should I call today?” · “Draft 3 LinkedIn posts about our new offer” — then say “yes” to approve. Say “goodbye” to close.
      </p>
    </div>
  );
}
