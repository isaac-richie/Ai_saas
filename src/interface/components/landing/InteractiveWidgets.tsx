"use client"

import { Check, Users, X } from "lucide-react"
import { motion } from "framer-motion"

type ComparisonRowProps = {
    label: string
    oldWay: string
    newWay: string
}

function ComparisonRow({ label, oldWay, newWay }: ComparisonRowProps) {
    return (
        <motion.div
            whileHover={{ scale: 1.01 }}
            className="group relative grid grid-cols-[1fr_0.9fr_1.2fr] items-center border-b border-white/10 text-xs"
        >
            <motion.div
                className="pointer-events-none absolute inset-0 rounded-lg bg-white/[0.03] opacity-0 group-hover:opacity-100"
                layoutId="comparison-highlight"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
            <div className="z-10 border-r border-white/10 px-3 py-2 font-medium text-white/75">{label}</div>
            <div className="z-10 border-r border-white/10 px-3 py-2 text-white/55">
                <span className="inline-flex items-center gap-1"><X className="h-3.5 w-3.5 text-red-300" /> {oldWay}</span>
            </div>
            <div className="z-10 px-3 py-2 text-white/90">
                <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-300" /> {newWay}</span>
            </div>
        </motion.div>
    )
}

export function InteractiveComparisonCard() {
    return (
        <article className="overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.055] to-white/[0.015] backdrop-blur-xl">
            <div className="grid grid-cols-[1fr_0.9fr_1.2fr] border-b border-white/10 text-xs">
                <div className="border-r border-white/10 px-3 py-2 text-white/40" />
                <div className="border-r border-white/10 px-3 py-2 text-white/55">Old way</div>
                <div className="px-3 py-2 font-medium text-cyan-300">Visiowave</div>
            </div>
            <ComparisonRow label="Credits" oldWay="Expire" newWay="One-time keys" />
            <ComparisonRow label="Model access" oldWay="Limited" newWay="Multi-provider" />
            <ComparisonRow label="Prompt quality" oldWay="Generic" newWay="Cinematic presets" />
            <ComparisonRow label="Organization" oldWay="Single box" newWay="Project workflow" />
        </article>
    )
}

const votes = [
    { label: "Neon Dreams", value: 78 },
    { label: "Cyber Pulse", value: 62 },
    { label: "Future Echo", value: 49 },
]

export function InteractiveCommunityCard() {
    return (
        <article className="rounded-3xl border border-cyan-400/25 bg-gradient-to-b from-cyan-500/10 via-cyan-500/5 to-transparent p-4 shadow-[0_0_0_1px_rgba(103,232,249,0.07)] backdrop-blur-xl">
            <p className="text-sm font-semibold text-white">
                <Users className="mr-2 inline h-4 w-4 text-cyan-300" />
                Community Collabs — <span className="text-cyan-300">Coming Soon</span>
            </p>
            <ul className="mt-3 space-y-2 text-sm text-white/75">
                {votes.map((vote) => (
                    <li key={vote.label}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                            <span>{vote.label}</span>
                            <span>{vote.value}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full border border-white/10 bg-white/10">
                            <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: `${vote.value}%` }}
                                viewport={{ once: true, amount: 0.6 }}
                                transition={{ duration: 0.9, ease: "easeOut" }}
                                className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-cyan-200 to-orange-200 shadow-[0_0_14px_rgba(34,211,238,0.5)]"
                            />
                        </div>
                    </li>
                ))}
            </ul>
            <p className="mt-3 text-xs text-white/55">Your votes: 2/2 (Free) | Upgrade for 10 votes/day</p>
            <div className="mt-3 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-center text-xs text-white/45">Vote Now - Coming Soon</div>
        </article>
    )
}
