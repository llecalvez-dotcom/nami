import { Suspense } from "react";
import { PanelScreen } from "@/components/panel/panel-screen";

// Nami in the Chrome side panel (extension/): one conversation, one microphone; the agent works in the tab next to it.
export default function PanelPage() {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
      <PanelScreen />
    </Suspense>
  );
}
