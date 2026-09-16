"use client";
export default function DiscoverError({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="state-page"><p className="eyebrow">Discover</p><h1>Recipes could not be loaded.</h1><p>Your profile is safe. Try loading the recipe list again.</p><button className="primary-button" onClick={reset} type="button">Retry</button></main>; }
