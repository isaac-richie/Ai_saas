"use client";

import { useEffect, useMemo, useState } from "react";
import { listApiKeys } from "@/core/actions/api-keys";
import {
  getPreferredProviderSlug,
  setPreferredProviderSlug,
} from "@/core/actions/provider-preferences";
import { Database } from "@/core/types/db";
import { Button } from "@/interface/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/interface/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/interface/components/ui/select";

type SupportedProviderSlug = "openai" | "runway";

type Provider = Database["public"]["Tables"]["providers"]["Row"] & {
  isConnected: boolean;
  lastUpdated: string | null;
};

function isProviderList(input: unknown): input is Provider[] {
  if (!Array.isArray(input)) return false;
  return input.every((item) => !!item && typeof item === "object" && "slug" in item && "isConnected" in item);
}

export function PreferredProviderCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferred, setPreferred] = useState<string>("auto");
  const [connectedSupported, setConnectedSupported] = useState<SupportedProviderSlug[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const [keysRes, prefRes] = await Promise.all([listApiKeys(), getPreferredProviderSlug()]);
      if (!active) return;

      if (isProviderList(keysRes.data)) {
        const connected = keysRes.data
          .filter((provider) => provider.isConnected)
          .map((provider) => provider.slug)
          .filter((slug): slug is SupportedProviderSlug => slug === "openai" || slug === "runway");

        setConnectedSupported(connected);
      }

      if (typeof prefRes.data === "string") {
        setPreferred(prefRes.data);
      } else {
        setPreferred("auto");
      }

      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const options = useMemo(() => {
    return connectedSupported.map((slug) => ({
      slug,
      label: slug === "openai" ? "OpenAI" : "Runway",
    }));
  }, [connectedSupported]);

  const onSave = async () => {
    setSaving(true);
    setMessage(null);

    const nextValue = preferred === "auto" ? null : preferred;
    const result = await setPreferredProviderSlug(nextValue);

    if (result.error) {
      setMessage(result.error);
    } else {
      setMessage("Preference saved.");
    }

    setSaving(false);
  };

  return (
    <Card data-reveal="card" className="rounded-2xl border border-white/10 bg-[#0b0b0d] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
      <CardHeader>
        <CardTitle className="text-base">Preferred Generation Provider</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-white/50">
          Auto mode uses available connected providers in fallback order. Set a preferred provider to prioritize it.
        </p>

        <Select value={preferred} onValueChange={setPreferred} disabled={loading}>
          <SelectTrigger className="w-full rounded-xl border-white/10 bg-white/5 text-white">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#111114] text-white">
            <SelectItem value="auto">Auto (Recommended)</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.slug} value={option.slug}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={onSave} disabled={saving || loading} className="rounded-xl border border-white/10 bg-white/10 text-white hover:bg-white/15">
          {saving ? "Saving..." : "Save Preference"}
        </Button>

        {message && <p className="text-xs text-white/55">{message}</p>}
      </CardContent>
    </Card>
  );
}
