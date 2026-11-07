import { Suspense } from "react";
import { HomeScreen } from "@/components/home/home-screen";

export default function Home() {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
      <HomeScreen />
    </Suspense>
  );
}
