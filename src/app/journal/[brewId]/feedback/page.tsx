import { FlavorFeedbackForm } from "@/components/flavor-feedback-form";
export default async function FlavorFeedbackPage({ params }: { params: Promise<{ brewId: string }> }) { const { brewId } = await params; return <FlavorFeedbackForm brewId={brewId} />; }
