import type { Metadata } from "next";
import { SkyScene } from "@/components/scene/sky-scene";
import { THEME_INIT } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nami · Don't just plan my trip. Make it happen.",
  description: "Nami prepares your trip: entry papers, flights, hotels. You check, you validate.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="day" suppressHydrationWarning className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SkyScene />
        {children}
      </body>
    </html>
  );
}
