"use client"

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/interface/components/ui/table"
import { Badge } from "@/interface/components/ui/badge"
import { Button } from "@/interface/components/ui/button"
import { Trash, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { AddKeyDialog } from "./AddKeyDialog"
import { deleteApiKey, listApiKeys, testApiKeyConnection } from "@/core/actions/api-keys"
import { useEffect, useRef, useState } from "react"
import { Database } from "@/core/types/db"
import { toast } from "sonner"

type Provider = Database["public"]["Tables"]["providers"]["Row"] & {
    isConnected: boolean
    lastUpdated: string | null
    testStatus?: string
    lastTestedAt?: string | null
}

function isProviderList(input: unknown): input is Provider[] {
    if (!Array.isArray(input)) return false
    return input.every((item) => {
        return !!item && typeof item === "object" && "id" in item && "isConnected" in item
    })
}

export function ApiKeyList() {
    const [providers, setProviders] = useState<Provider[]>([])
    const [loading, setLoading] = useState(true)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [testingId, setTestingId] = useState<string | null>(null)
    const tableRef = useRef<HTMLDivElement>(null)

    const fetchKeys = async (withSpinner = false) => {
        if (withSpinner) setLoading(true)
        const res = await listApiKeys()

        if (isProviderList(res.data)) {
            setProviders(res.data)
        }

        setLoading(false)
    }

    useEffect(() => {
        void fetchKeys()
    }, [])

    useEffect(() => {
        if (loading || providers.length === 0 || !tableRef.current) return
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

        let active = true
        let revert: (() => void) | undefined

        ;(async () => {
            const mod = await import("gsap")
            const gsap = mod.gsap
            if (!active || !tableRef.current) return

            const ctx = gsap.context(() => {
                gsap.fromTo(
                    ".provider-row",
                    { y: 14, opacity: 0 },
                    { y: 0, opacity: 1, duration: 0.4, stagger: 0.06, ease: "power2.out" }
                )
            }, tableRef)

            revert = () => ctx.revert()
        })()

        return () => {
            active = false
            if (revert) revert()
        }
    }, [providers, loading])

    const handleDelete = async (providerId: string) => {
        if (confirm("Are you sure you want to delete this API key? AI features for this provider will stop working.")) {
            setDeletingId(providerId)
            await deleteApiKey(providerId)
            setDeletingId(null)
            await fetchKeys()
        }
    }

    const handleTest = async (providerId: string) => {
        setTestingId(providerId)
        const res = await testApiKeyConnection(providerId)
        setTestingId(null)
        if (res.error) {
            toast.error(res.error)
        } else {
            toast.success(res.message || "Connection verified")
        }
        await fetchKeys()
    }

    const renderTestBadge = (status?: string) => {
        if (status === "valid") {
            return (
                <Badge className="border border-emerald-400/35 bg-emerald-500/15 text-emerald-100">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Validated
                </Badge>
            )
        }
        if (status === "invalid") {
            return (
                <Badge className="border border-red-400/35 bg-red-500/15 text-red-100">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Invalid
                </Badge>
            )
        }
        return <Badge className="border border-white/10 bg-white/5 text-white/80">Untested</Badge>
    }

    return (
        <div ref={tableRef} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f1012] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
            <Table>
                <TableHeader>
                    <TableRow className="border-white/10">
                        <TableHead className="text-white/50">Provider</TableHead>
                        <TableHead className="text-white/50">Status</TableHead>
                        <TableHead className="text-white/50">Last Updated</TableHead>
                        <TableHead className="text-white/50">Connection Test</TableHead>
                        <TableHead className="text-right text-white/50">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-white/55">Loading providers...</TableCell>
                        </TableRow>
                    ) : providers.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-white/55">No providers found.</TableCell>
                        </TableRow>
                    ) : (
                        providers.map((provider) => (
                            <TableRow key={provider.id} className="provider-row border-white/10">
                                <TableCell className="font-medium">{provider.name}</TableCell>
                                <TableCell>
                                    {provider.isConnected ? (
                                        <Badge className="border border-emerald-400/35 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25">Connected</Badge>
                                    ) : (
                                        <Badge className="border border-white/10 bg-white/5 text-white/90">Not Connected</Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-white/55">
                                    {provider.lastUpdated ? new Date(provider.lastUpdated).toLocaleDateString() : "-"}
                                </TableCell>
                                <TableCell className="text-white/55">
                                    <div className="space-y-1">
                                        {renderTestBadge(provider.testStatus)}
                                        <div className="text-[11px] text-white/45">
                                            {provider.lastTestedAt ? new Date(provider.lastTestedAt).toLocaleString() : "Not tested"}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    {provider.isConnected ? (
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleTest(provider.id)}
                                                disabled={testingId === provider.id}
                                                className="rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                                            >
                                                {testingId === provider.id ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
                                                Test
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(provider.id)}
                                                disabled={deletingId === provider.id}
                                            >
                                                {deletingId === provider.id ? (
                                                    <Loader2 className="size-4 animate-spin" />
                                                ) : (
                                                    <Trash className="size-4 text-white/50" />
                                                )}
                                            </Button>
                                        </div>
                                    ) : (
                                        <AddKeyDialog
                                            providerId={provider.id}
                                            providerName={provider.name}
                                            onSuccess={() => void fetchKeys(true)}
                                        />
                                    )}
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
