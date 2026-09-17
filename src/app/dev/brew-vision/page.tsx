import { BrewVisionQaPanel } from "@/components/dev/brew-vision-qa-panel";

export default function BrewVisionQaPage() {
  if (process.env.NODE_ENV !== "development") {
    return <main className="state-page"><p className="eyebrow">Unavailable</p><h1>Vision QA unavailable in production.</h1><p>Camera and calibration controls are disabled outside development.</p></main>;
  }
  return <BrewVisionQaPanel />;
}
