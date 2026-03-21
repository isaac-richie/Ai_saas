import { ApiKeyList } from "@/interface/components/settings/ApiKeyList";
import { PreferredProviderCard } from "@/interface/components/settings/PreferredProviderCard";
import { Badge } from "@/interface/components/ui/badge";
import { Card, CardContent } from "@/interface/components/ui/card";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Settings | AI Cinematography Dashboard",
    description: "Manage your API keys and preferences",
};

export default function SettingsPage() {
    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 py-2 md:py-4">
            <section data-reveal="hero" className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0d] p-6 text-white shadow-[0_24px_50px_-38px_rgba(0,0,0,0.95)] md:p-8">
                <div className="pointer-events-none absolute inset-0">
                    <div className="absolute -left-24 -top-14 h-60 w-60 rounded-full bg-[#d9a066]/15 blur-[80px]" />
                    <div className="absolute -right-20 top-1/3 h-60 w-60 rounded-full bg-[#6e8a8f]/10 blur-[90px]" />
                    <div className="data-grid-bg absolute inset-0 opacity-[0.22]" />
                </div>
                <div className="relative">
                    <Badge className="mb-3 rounded-full border border-white/10 bg-white/10 text-white/90">Security</Badge>
                    <h1 className="text-3xl font-semibold tracking-tight">Provider Connections</h1>
                    <p className="mt-2 max-w-2xl text-sm text-white/50 md:text-base">
                        Connect your own API keys to run generations through your preferred model providers.
                    </p>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
                <Card data-reveal="card" className="rounded-2xl border border-white/10 bg-[#0f1012] text-white shadow-[0_20px_38px_-34px_rgba(0,0,0,0.9)]">
                    <CardContent className="flex items-start gap-3 p-5 text-sm text-white/50">
                        <ShieldCheck className="mt-0.5 h-5 w-5 text-white/50" />
                        Keys are encrypted before storage and scoped per user account.
                    </CardContent>
                </Card>
                <Card data-reveal="card" className="rounded-2xl border border-white/10 bg-[#0f1012] text-white shadow-[0_20px_38px_-34px_rgba(0,0,0,0.9)]">
                    <CardContent className="flex items-start gap-3 p-5 text-sm text-white/50">
                        <KeyRound className="mt-0.5 h-5 w-5 text-white/50" />
                        Connect only providers you actively use to simplify generation routing.
                    </CardContent>
                </Card>
            </section>

            <PreferredProviderCard />

            <section data-reveal="card" className="space-y-3">
                <h2 className="text-lg font-semibold">AI Providers</h2>
                <ApiKeyList />
            </section>
        </div>
    );
}
