import { PublicGenerationClient } from "./PublicGenerationClient";

export default async function PublicGenerationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicGenerationClient id={id} />;
}
