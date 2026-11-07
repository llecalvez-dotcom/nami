import type { Metadata } from "next";
import { WorldMapScreen } from "@/components/map/world-map-screen";

export const metadata: Metadata = { title: "World map · Nami" };

export default function MapPage() {
  return <WorldMapScreen />;
}
