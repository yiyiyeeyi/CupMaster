export function PageIntro({ title, description }: { title: string; description: string }) {
  return <main className="page-intro"><p className="eyebrow">CupMaster</p><h1>{title}</h1><p>{description}</p></main>;
}
