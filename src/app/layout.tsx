import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/interface/providers/theme-provider";
import { AppShell } from "@/interface/components/layout/AppShell";
import { Toaster } from "@/interface/components/ui/sonner";

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
          <AppShell>{children}</AppShell>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
