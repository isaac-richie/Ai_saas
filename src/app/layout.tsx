import type { Metadata } from "next";
import { Sora, Syne } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/interface/providers/theme-provider";
import { AppShell } from "@/interface/components/layout/AppShell";
import { Toaster } from "@/interface/components/ui/sonner";

const bodyFont = Sora({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const displayFont = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

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
      <body className={`${bodyFont.variable} ${displayFont.variable} font-sans antialiased`}>
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
