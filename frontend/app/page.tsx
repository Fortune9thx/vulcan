import { Suspense } from "react";
import { VulcanExperience } from "@/components/VulcanExperience";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <VulcanExperience />
    </Suspense>
  );
}
