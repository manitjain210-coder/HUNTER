import type { Metadata } from "next";
import "@fontsource-variable/public-sans";
import "@fontsource-variable/bricolage-grotesque";
import "./globals.css";
import { AppShell } from "@/components/shell";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Backdrop } from "@/components/backdrop";

// Fonts are self-hosted from npm (@fontsource), so builds and the app work offline.
export const metadata: Metadata = {
  title: { default: "Khana Bridge", template: "%s · Khana Bridge" },
  description: "Everyone deserves to eat. Discounted near-expiry groceries and coordinated surplus-food donation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className="canvas font-sans">
      <body className="!bg-transparent">
        <Backdrop />
        <TooltipProvider delayDuration={250}>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
