import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./cinema.css";
import "./workspace.css";
import { ThemeProvider } from "@/interface/providers/theme-provider";
import { AppShell } from "@/interface/components/layout/AppShell";
import { Toaster } from "@/interface/components/ui/sonner";
import { DeploymentRecovery } from "@/interface/components/system/DeploymentRecovery";

// viewport-fit=cover lets the phone tab bar sit clear of the home indicator via safe-area insets.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#080908" }

export const metadata: Metadata = {
  title: {
    default: "Visiowave Studios",
    template: "%s | Visiowave Studios",
  },
  description: "Prompt to cinematic video. Direct, generate, and ship AI film in one studio.",
  icons: {
    icon: "/icon.jpeg",
    apple: "/apple-icon.jpeg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <DeploymentRecovery />
          <AppShell>{children}</AppShell>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
