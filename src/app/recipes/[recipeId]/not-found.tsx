import Link from "next/link";
export default function RecipeNotFound() { return <main className="state-page"><p className="eyebrow">Recipe not found</p><h1>That recipe is not on the shelf.</h1><p>It may have moved or the link may be incomplete. Your profile and brewing data are unchanged.</p><Link className="primary-button" href="/discover">Back to Discover</Link></main>; }
