import type { Metadata } from "next";
import { TripsScreen } from "@/components/trip/trips-screen";

export const metadata: Metadata = { title: "Your trips · Nami" };

export default function TripsPage() {
  return <TripsScreen />;
}
