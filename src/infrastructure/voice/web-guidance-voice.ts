import type { BrewGuidanceEvent } from "@/domain/brew-runtime";

export interface GuidanceVoiceSnapshot {
  supported: boolean;
  enabled: boolean;
  speaking: boolean;
  lastMessage: string | null;
}

export interface GuidanceVoicePort {
  speak(event: Readonly<BrewGuidanceEvent>): void;
  replay(): boolean;
  setEnabled(enabled: boolean): void;
  getSnapshot(): GuidanceVoiceSnapshot;
  cancel(): void;
  dispose(): void;
}

interface SpeechSynthesisPort {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  speaking: boolean;
}

export interface WebGuidanceVoiceOptions {
  synthesis?: SpeechSynthesisPort;
  createUtterance?: (text: string) => SpeechSynthesisUtterance;
  language?: string;
  enabled?: boolean;
}

function browserSynthesis(): SpeechSynthesisPort | undefined {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : undefined;
}

function browserUtterance(text: string): SpeechSynthesisUtterance {
  return new SpeechSynthesisUtterance(text);
}

export class WebGuidanceVoiceAdapter implements GuidanceVoicePort {
  private readonly synthesis: SpeechSynthesisPort | undefined;
  private readonly createUtterance: ((text: string) => SpeechSynthesisUtterance) | undefined;
  private readonly language: string;
  private readonly consumedIds = new Set<string>();
  private enabled: boolean;
  private lastMessage: string | null = null;

  constructor(options: WebGuidanceVoiceOptions = {}) {
    this.synthesis = options.synthesis ?? browserSynthesis();
    this.createUtterance = options.createUtterance
      ?? (typeof SpeechSynthesisUtterance === "function" ? browserUtterance : undefined);
    this.language = options.language ?? "zh-TW";
    this.enabled = options.enabled ?? true;
  }

  speak(event: Readonly<BrewGuidanceEvent>): void {
    if (this.consumedIds.has(event.id)) return;
    this.consumedIds.add(event.id);
    this.lastMessage = event.message;
    if (this.enabled) this.speakMessage(event.message);
  }

  replay(): boolean {
    if (!this.enabled || this.lastMessage === null) return false;
    return this.speakMessage(this.lastMessage);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.cancel();
  }

  getSnapshot(): GuidanceVoiceSnapshot {
    return {
      supported: this.synthesis !== undefined && this.createUtterance !== undefined,
      enabled: this.enabled,
      speaking: this.synthesis?.speaking ?? false,
      lastMessage: this.lastMessage,
    };
  }

  cancel(): void {
    this.synthesis?.cancel();
  }

  dispose(): void {
    this.cancel();
  }

  private speakMessage(message: string): boolean {
    if (this.synthesis === undefined || this.createUtterance === undefined) return false;
    const utterance = this.createUtterance(message);
    utterance.lang = this.language;
    this.synthesis.cancel();
    this.synthesis.speak(utterance);
    return true;
  }
}

export interface VoiceStartPort {
  supported: boolean;
  active: boolean;
  start(): boolean;
  stop(): void;
  dispose(): void;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionPort {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionPort;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function recognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function isWebVoiceStartSupported(): boolean {
  return recognitionConstructor() !== undefined;
}

export class WebVoiceStartAdapter implements VoiceStartPort {
  readonly supported: boolean;
  active = false;
  private readonly recognition: SpeechRecognitionPort | null;

  constructor(onStartCommand: () => void, Constructor: SpeechRecognitionConstructor | undefined = recognitionConstructor()) {
    this.supported = Constructor !== undefined;
    this.recognition = Constructor === undefined ? null : new Constructor();
    if (this.recognition !== null) {
      this.recognition.lang = "zh-TW";
      this.recognition.continuous = true;
      this.recognition.interimResults = false;
      this.recognition.onresult = (event) => {
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result?.isFinal && result[0]?.transcript.replace(/\s/g, "").includes("開始")) {
            this.stop();
            onStartCommand();
            break;
          }
        }
      };
      this.recognition.onend = () => { this.active = false; };
      this.recognition.onerror = () => { this.active = false; };
    }
  }

  start(): boolean {
    if (this.recognition === null || this.active) return false;
    try {
      this.recognition.start();
      this.active = true;
      return true;
    } catch {
      this.active = false;
      return false;
    }
  }

  stop(): void {
    if (this.recognition === null || !this.active) return;
    this.recognition.stop();
    this.active = false;
  }

  dispose(): void {
    if (this.recognition !== null) {
      this.recognition.onresult = null;
      this.recognition.onend = null;
      this.recognition.onerror = null;
      this.recognition.abort();
    }
    this.active = false;
  }
}
