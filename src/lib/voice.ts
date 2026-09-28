/**
 * Browser-native voice: speech recognition (Web Speech API) and speech synthesis.
 * No API keys and nothing sent to our servers except the recognised text. Note that
 * Chrome and Edge recognise speech with the browser vendor's online service.
 */

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceSupport = { ok: true } | { ok: false; reason: "insecure" | "unsupported" };

/** Microphones only work on https:// (or localhost), and not every browser has speech recognition. */
export function voiceSupport(): VoiceSupport {
  if (typeof window === "undefined") return { ok: false, reason: "unsupported" };
  if (!window.isSecureContext) return { ok: false, reason: "insecure" };
  if (!recognitionCtor()) return { ok: false, reason: "unsupported" };
  return { ok: true };
}

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

export type ListenHandlers = {
  lang: string;
  continuous?: boolean;
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
};

/** Starts listening; returns a function that stops it. */
export function listen(h: ListenHandlers): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    h.onError?.("unsupported");
    return () => undefined;
  }
  const r = new Ctor();
  r.lang = h.lang;
  r.continuous = !!h.continuous;
  r.interimResults = true;
  r.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]!;
      const text = res[0].transcript.trim();
      if (res.isFinal) {
        if (text) h.onFinal(text);
      } else interim += `${text} `;
    }
    if (interim.trim()) h.onInterim?.(interim.trim());
  };
  r.onerror = (e) => h.onError?.(e.error);
  r.onend = () => h.onEnd?.();
  try {
    r.start();
  } catch {
    h.onError?.("start-failed");
  }
  return () => {
    r.onend = null;
    try {
      r.abort();
    } catch {
      /* already stopped */
    }
  };
}

// Voices that suit a calm "assistant" persona, best first; falls back to any voice in the language.
const PREFERRED = ["Google UK English Male", "Microsoft Ryan Online (Natural) - English (United Kingdom)", "Daniel", "Microsoft George - English (United Kingdom)", "Google US English", "Alex"];

export function listVoices(): SpeechSynthesisVoice[] {
  return canSpeak() ? window.speechSynthesis.getVoices() : [];
}

export function pickVoice(lang: string, name?: string | null): SpeechSynthesisVoice | null {
  const voices = listVoices();
  if (name) {
    const v = voices.find((x) => x.name === name);
    if (v) return v;
  }
  const base = lang.split("-")[0]!;
  if (base === "en") {
    for (const n of PREFERRED) {
      const v = voices.find((x) => x.name === n);
      if (v) return v;
    }
  }
  return voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(base)) ?? null;
}

export function speak(text: string, opts: { lang: string; voiceName?: string | null; rate?: number; onEnd?: () => void }) {
  if (!canSpeak() || !text.trim()) {
    opts.onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(opts.lang, opts.voiceName);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? opts.lang;
  u.rate = opts.rate ?? 1.02;
  u.pitch = 0.95;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    opts.onEnd?.();
  };
  u.onend = finish;
  u.onerror = finish;
  synth.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** Turns a Markdown answer into something pleasant to hear: no tables, links, symbols or long lists. */
export function toSpeech(markdown: string, maxChars = 420): string {
  let hadTable = false;
  const lines = markdown
    .replace(/```[\s\S]*?```/g, "")
    .split("\n")
    .filter((l) => {
      if (/^\s*\|/.test(l)) {
        hadTable = true;
        return false;
      }
      return !/^\s*(---+|===+)\s*$/.test(l);
    })
    .map((l) =>
      l
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/^\s*#{1,6}\s+/, "")
        .replace(/^\s*[-*+]\s+/, "")
        .replace(/^\s*\d+\.\s+/, "")
        .replace(/[*_`~>#]/g, "")
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
        .trim(),
    )
    .filter(Boolean);

  let out = "";
  for (const l of lines) {
    const sentence = /[.!?:;]$/.test(l) ? l : `${l}.`;
    if ((out + " " + sentence).length > maxChars) {
      out += out ? " I've put the rest on screen." : sentence.slice(0, maxChars);
      return out.trim();
    }
    out += ` ${sentence}`;
  }
  if (hadTable) out += " The details are on screen.";
  return out.replace(/\s+/g, " ").trim();
}

export type VoiceCommand = { kind: "approve"; all: boolean } | { kind: "dismiss" } | { kind: "stop" } | { kind: "sleep" } | null;

/** Short spoken replies that control the conversation rather than asking Copilot something. */
export function parseCommand(text: string): VoiceCommand {
  const t = text.toLowerCase().replace(/[.,!?]/g, "").trim();
  if (/^(stop|quiet|shut up|be quiet|stop talking|enough)$/.test(t)) return { kind: "stop" };
  if (/^(goodbye|bye|close|exit|that's all|thats all|thank you that's all|go to sleep|sleep)$/.test(t)) return { kind: "sleep" };
  if (/^(yes|yeah|yep|sure|ok|okay|approve|approved|do it|go ahead|confirm|proceed|make it so|yes please|yes do it|sounds good|go for it)( please)?$/.test(t)) return { kind: "approve", all: false };
  if (/^(approve|do|run) (all|everything|all of them|them all)$|^(yes )?(do|approve) (all|both|everything)$/.test(t)) return { kind: "approve", all: true };
  if (/^(no|nope|cancel|dismiss|skip|don't|do not|never mind|nevermind|not now)( it| that| thanks)?$/.test(t)) return { kind: "dismiss" };
  return null;
}

/** Finds a wake word ("Jarvis", "hey copilot", …) and returns what was said after it, or null. */
export function afterWakeWord(text: string, words: string[]): string | null {
  const t = text.toLowerCase();
  for (const w of words) {
    const i = t.indexOf(w.toLowerCase());
    if (i >= 0) return text.slice(i + w.length).replace(/^[\s,.!?]+/, "").trim();
  }
  return null;
}
