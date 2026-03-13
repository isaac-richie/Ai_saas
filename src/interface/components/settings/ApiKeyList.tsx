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
import { Trash, Loader2 } from "lucide-react"
import { AddKeyDialog } from "./AddKeyDialog"
import { deleteApiKey, listApiKeys } from "@/core/actions/api-keys"
import { useEffect, useRef, useState } from "react"
import { Database } from "@/core/types/db"

type Provider = Database["public"]["Tables"]["providers"]["Row"] & {
    isConnected: boolean
    lastUpdated: string | null
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

    return (
        <div ref={tableRef} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0d] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
            <Table>
                <TableHeader>
                    <TableRow className="border-white/10">
                        <TableHead className="text-white/50">Provider</TableHead>
                        <TableHead className="text-white/50">Status</TableHead>
                        <TableHead className="text-white/50">Last Updated</TableHead>
                        <TableHead className="text-right text-white/50">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow>
                            <TableCell colSpan={4} className="py-8 text-center text-white/55">Loading providers...</TableCell>
                        </TableRow>
                    ) : providers.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={4} className="py-8 text-center text-white/55">No providers found.</TableCell>
                        </TableRow>
                    ) : (
                        providers.map((provider) => (
                            <TableRow key={provider.id} className="provider-row border-white/10">
                                <TableCell className="font-medium">{provider.name}</TableCell>
                                <TableCell>
                                    {provider.isConnected ? (
                                        <Badge className="border border-white/15 bg-white/10 text-white hover:bg-white/20">Connected</Badge>
                                    ) : (
                                        <Badge className="border border-white/10 bg-white/5 text-white/90">Not Connected</Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-white/55">
                                    {provider.lastUpdated ? new Date(provider.lastUpdated).toLocaleDateString() : "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                    {provider.isConnected ? (
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
