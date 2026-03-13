'use client'
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
        <div className="p-8 max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold">API Keys</h1>
                    <p className="text-gray-600 mt-1">Connect your AI provider accounts</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                    <Plus size={20} /> Add API Key
                </button>
            </div>

            <div className="space-y-4">
                {providers.length === 0 ? (
                    <div className="text-center py-10 border rounded-lg text-gray-500">
                        No providers found. Make sure the database is seeded.
                    </div>
                ) : providers.map(provider => {
                    const userKey = userKeys.find(k => k.provider_id === provider.id)

                    return (
                        <div key={provider.id} className="border rounded-lg p-4 hover:shadow-md transition bg-white text-black">
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3">
                                        <h3 className="font-bold text-lg">{provider.name}</h3>
                                        <span className="text-xs px-2 py-1 rounded bg-gray-100">
                                            {provider.type}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1">{provider.best_for}</p>

                                    {userKey ? (
                                        <div className="mt-3 flex items-center gap-3">
                                            <div className="flex items-center gap-2 text-green-600">
                                                <Check size={16} />
                                                <span className="text-sm font-medium">Connected</span>
                                            </div>
                                            {userKey.last_used_at && (
                                                <span className="text-xs text-gray-500">
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
                                            className="mt-3 text-blue-600 text-sm font-medium hover:underline"
                                        >
                                            Connect API key →
                                        </button>
                                    )}
                                </div>

                                <a
                                    href={provider.api_access_via}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <ExternalLink size={18} />
                                </a>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Add Key Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full text-black">
                        <h2 className="text-xl font-bold mb-4">
                            Add API Key {selectedProvider && `for ${selectedProvider.name}`}
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">API Key</label>
                                <input
                                    type="password"
                                    value={newApiKey}
                                    onChange={(e) => setNewApiKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Nickname (optional)
                                </label>
                                <input
                                    type="text"
                                    value={nickname}
                                    onChange={(e) => setNickname(e.target.value)}
                                    placeholder="Production key"
                                    className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="flex-1 px-4 py-2 border rounded hover:bg-gray-50 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddKey}
                                disabled={!newApiKey || loading}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition"
                            >
                                {loading ? 'Saving...' : 'Save Key'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
