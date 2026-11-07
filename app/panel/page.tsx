import { Suspense } from "react";
import { PanelScreen } from "@/components/panel/panel-screen";

// Nami in the Chrome side panel (extension/): one conversation, one microphone; the agent works in the tab next to it.
export default function PanelPage() {
  return (
    <>
      {/* Gambetta (Fontshare, FFL licence: free to use, never redistributed, so never in this public repository). */}
      <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=gambetta@400,401,500,501&display=swap" precedence="default" />
      <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
        <PanelScreen />
      </Suspense>
    </>
  );
}
