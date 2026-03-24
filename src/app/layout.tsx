import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/interface/providers/theme-provider";
import { AppShell } from "@/interface/components/layout/AppShell";
import { Toaster } from "@/interface/components/ui/sonner";

export const metadata: Metadata = {
  title: "AI Cinematography Dashboard",
  description: "Production-ready dashboard for AI Cinematography",
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
          <AppShell>{children}</AppShell>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
