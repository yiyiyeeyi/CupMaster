import Link from "next/link";
import { guidedBrewCopy as copy } from "./guided-brew-copy";

export function BrewHub() {
  return <main className="brew-hub"><h1>{copy.newBrewReady}</h1><Link className="primary-button" href="/discover">{copy.chooseRecipe}</Link></main>;
}
