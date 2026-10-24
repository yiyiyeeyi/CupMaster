import { describe, expect, it, vi } from "vitest";
import type { BrewGuidanceEvent } from "@/domain/brew-runtime";
import { WebGuidanceVoiceAdapter, WebVoiceStartAdapter } from "./web-guidance-voice";

function event(id: string, message = "開始注水"): BrewGuidanceEvent {
  return {
    id, sequence: 1, runNumber: 1, timestampMs: 0, moment: "step_start",
    stageId: "bloom", stageOrder: 1, stageName: "Bloom", message,
  };
}

describe("WebGuidanceVoiceAdapter", () => {
  it("speaks Chinese guidance once, supports replay and enable/disable", () => {
    const synthesis = { speak: vi.fn(), cancel: vi.fn(), speaking: false };
    const adapter = new WebGuidanceVoiceAdapter({
      synthesis,
      createUtterance: (text) => ({ text, lang: "" } as SpeechSynthesisUtterance),
    });
    adapter.speak(event("one"));
    adapter.speak(event("one"));
    expect(synthesis.speak).toHaveBeenCalledTimes(1);
    expect(synthesis.speak.mock.calls[0]?.[0]).toMatchObject({ text: "開始注水", lang: "zh-TW" });
    expect(adapter.replay()).toBe(true);
    expect(synthesis.speak).toHaveBeenCalledTimes(2);
    adapter.setEnabled(false);
    adapter.speak(event("two", "繼續注水"));
    expect(synthesis.speak).toHaveBeenCalledTimes(2);
    adapter.setEnabled(true);
    expect(adapter.replay()).toBe(true);
    expect(synthesis.speak).toHaveBeenCalledTimes(3);
  });

  it("cancels system speech during disposal", () => {
    const synthesis = { speak: vi.fn(), cancel: vi.fn(), speaking: false };
    new WebGuidanceVoiceAdapter({
      synthesis,
      createUtterance: (text) => ({ text, lang: "" } as SpeechSynthesisUtterance),
    }).dispose();
    expect(synthesis.cancel).toHaveBeenCalledOnce();
  });
});

describe("WebVoiceStartAdapter", () => {
  it("recognizes the final Chinese start command once through the session boundary", () => {
    class RecognitionMock {
      static instance: RecognitionMock | null = null;
      lang = "";
      continuous = false;
      interimResults = true;
      onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
      constructor() { RecognitionMock.instance = this; }
      emit(transcript: string) { this.onresult?.({ results: [{ isFinal: true, 0: { transcript } }] }); }
    }
    const command = vi.fn();
    const adapter = new WebVoiceStartAdapter(command, RecognitionMock);
    expect(adapter.start()).toBe(true);
    expect(adapter.start()).toBe(false);
    const recognition = RecognitionMock.instance!;
    recognition.emit("請 開始");
    expect(command).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(recognition.abort).toHaveBeenCalledOnce();
  });
});
