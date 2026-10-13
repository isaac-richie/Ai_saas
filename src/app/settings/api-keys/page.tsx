'use client'

import type * as React from 'react'
import { useState, useEffect } from 'react'
import { Plus, Check, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

// Define types since we are using TypeScript
type Provider = {
    id: string;
    name: string;
    type: string;
    best_for: string;
    api_access_via: string;
};

type UserKey = {
    provider_id: string;
    last_used_at?: string;
};

export default function ApiKeysPage() {
    const [providers, setProviders] = useState<Provider[]>([])
    const [userKeys, setUserKeys] = useState<UserKey[]>([])
    const [showAddModal, setShowAddModal] = useState(false)
    const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
    const [newApiKey, setNewApiKey] = useState('')
    const [nickname, setNickname] = useState('')
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        try {
            // In a real app the /api/providers endpoint will need to be created as per the build plan
            const [providersRes, keysRes] = await Promise.all([
                fetch('/api/providers').catch(() => null),
                fetch('/api/api-keys')
            ])

            const providersJson = providersRes && providersRes.ok ? await providersRes.json() : { data: [] };
            const keysJson = keysRes.ok ? await keysRes.json() : { data: [] };

            setProviders(providersJson.data || [])
            setUserKeys(keysJson.data || [])
        } catch {
            toast.error("Failed to fetch keys or providers");
        }
    }

    const handleAddKey = async () => {
        if (!selectedProvider) return;

        setLoading(true)
        try {
            const res = await fetch('/api/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider_id: selectedProvider.id,
                    api_key: newApiKey,
                    nickname
                })
            })

            if (res.ok) {
                setShowAddModal(false)
                setNewApiKey('')
                setNickname('')
                toast.success("API key saved successfully!")
                fetchData()
            } else {
                const errorData = await res.json();
                toast.error(`Error saving key: ${errorData.error || 'Unknown error'}`);
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="workspace-page max-w-4xl">
            <header className="workspace-heading">
                <div>
                    <p className="workspace-eyebrow">PROVIDER ACCESS</p>
                    <h1>API keys</h1>
                    <p className="workspace-description">Connect your AI provider accounts. Keys are encrypted and scoped to you.</p>
                </div>
                <div className="workspace-actions">
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="workspace-primary-link"
                    >
                        <Plus size={17} /> Add API key
                    </button>
                </div>
            </header>

            <div className="lux-stagger space-y-3">
                {providers.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gold-400/20 [background:radial-gradient(70%_120%_at_50%_0%,rgba(217,192,138,0.06),transparent_60%),#0f110f] py-12 text-center text-sm text-[#a3a59a]">
                        No providers found. Make sure the database is seeded.
                    </div>
                ) : providers.map((provider, index) => {
                    const userKey = userKeys.find(k => k.provider_id === provider.id)

                    return (
                        <div key={provider.id} style={{ "--i": index } as React.CSSProperties} className="lux-lift lux-spotlight rounded-2xl border border-gold-400/[0.12] bg-obsidian-800 p-5 text-[#eeeae1]">
                            <div className="relative flex justify-between items-start">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-lg font-normal tracking-tight">{provider.name}</h3>
                                        <span className="rounded-full border border-gold-400/20 bg-gold-400/[0.06] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-gold-200/80">
                                            {provider.type}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm text-[#a3a59a]">{provider.best_for}</p>

                                    {userKey ? (
                                        <div className="mt-3 flex items-center gap-3">
                                            <div className="flex items-center gap-2 text-[#b6ddd3]">
                                                <Check size={16} />
                                                <span className="text-sm font-medium">Connected</span>
                                            </div>
                                            {userKey.last_used_at && (
                                                <span className="text-xs text-[#8f9086]">
                                                    Last used: {new Date(userKey.last_used_at).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                setSelectedProvider(provider)
                                                setShowAddModal(true)
                                            }}
                                            className="workspace-text-link mt-3"
                                        >
                                            Connect API key →
                                        </button>
                                    )}
                                </div>

                                <a
                                    href={provider.api_access_via}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Open ${provider.name} API access`}
                                    className="grid size-9 place-items-center rounded-full border border-gold-400/15 text-[#8f9086] transition-all duration-300 hover:border-gold-400/40 hover:text-gold-200"
                                >
                                    <ExternalLink size={16} />
                                </a>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Add Key Modal */}
            {showAddModal && (
                <div className="lux-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
                    <div className="lux-rise lux-hairline w-full max-w-md rounded-3xl [background:linear-gradient(180deg,rgba(217,192,138,0.06),transparent_40%),#111311] p-7 text-[#eeeae1] shadow-[0_40px_90px_-40px_#000]">
                        <p className="workspace-eyebrow">NEW CONNECTION</p>
                        <h2 className="mb-5 mt-3 text-2xl font-light tracking-[-0.03em]">
                            Add API key {selectedProvider && <span className="lux-serif text-gold-300">for {selectedProvider.name}</span>}
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-[#a3a59a]">API key</label>
                                <input
                                    type="password"
                                    value={newApiKey}
                                    onChange={(e) => setNewApiKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="h-11 w-full border px-3 text-sm"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-[#a3a59a]">
                                    Nickname (optional)
                                </label>
                                <input
                                    type="text"
                                    value={nickname}
                                    onChange={(e) => setNickname(e.target.value)}
                                    placeholder="Production key"
                                    className="h-11 w-full border px-3 text-sm"
                                />
                            </div>
                        </div>

                        <div className="mt-7 flex gap-3">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="workspace-secondary-link flex-1"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddKey}
                                disabled={!newApiKey || loading}
                                className="workspace-primary-link flex-1 disabled:pointer-events-none disabled:opacity-50"
                            >
                                {loading ? 'Saving...' : 'Save key'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
