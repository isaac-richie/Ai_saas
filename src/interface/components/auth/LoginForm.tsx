"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import Link from "next/link"
import { ArrowRight, Chrome, Zap } from "lucide-react"
import { login } from "@/core/actions/auth"
import { LoginInput, loginSchema } from "@/core/types/auth"
import { createClient } from "@/infrastructure/supabase/client"
import { Button } from "@/interface/components/ui/button"
import { Input } from "@/interface/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/interface/components/ui/form"
import { motion, Variants, AnimatePresence } from "framer-motion"
import { MagneticButton } from "@/interface/components/ui/MagneticButton"
import { humanizeAuthError } from "@/interface/components/auth/auth-error-message"

const containerVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.6,
            ease: [0.16, 1, 0.3, 1],
            when: "beforeChildren",
            staggerChildren: 0.1,
        },
    },
}

const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: { opacity: 1, x: 0 },
}

export function LoginForm({ nextPath = "/dashboard" }: { nextPath?: string }) {
    const [error, setError] = useState<string | null>(null)
    const [otpInfo, setOtpInfo] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const [oauthPending, setOauthPending] = useState(false)
    const [otpPending, setOtpPending] = useState(false)
    const router = useRouter()

    useEffect(() => {
        if (!error) return
        const timeoutId = window.setTimeout(() => setError(null), 3000)
        return () => window.clearTimeout(timeoutId)
    }, [error])

    const form = useForm<LoginInput>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    })

    async function onSubmit(data: LoginInput) {
        setError(null)
        setOtpInfo(null)
        startTransition(async () => {
            const result = await login(data, nextPath)
            if (result?.error) {
                setError(humanizeAuthError(result.error))
            }
        })
    }

    async function onGoogleSignIn() {
        try {
            setError(null)
            setOtpInfo(null)
            setOauthPending(true)
            const supabase = createClient()
            const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
                },
            })
            if (error) setError(humanizeAuthError(error.message))
        } finally {
            setOauthPending(false)
        }
    }

    async function onSendOtpSignIn() {
        const email = form.getValues("email")?.trim().toLowerCase()
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError("Enter a valid email before requesting OTP.")
            return
        }

        try {
            setError(null)
            setOtpInfo(null)
            setOtpPending(true)
            const supabase = createClient()
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    shouldCreateUser: false,
                },
            })

            if (error) {
                setError(humanizeAuthError(error.message))
                return
            }

            setOtpInfo("OTP sent. Enter the 6-digit code to continue.")
            router.push(`/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}&mode=signin`)
        } finally {
            setOtpPending(false)
        }
    }

    const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
    const handleMouseMove = (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = (e.clientX - rect.left) / rect.width - 0.5
        const y = (e.clientY - rect.top) / rect.height - 0.5
        setMousePos({ x, y })
    }

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="w-full perspective-1000"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setMousePos({ x: 0, y: 0 })}
            style={{
                perspective: "1000px"
            }}
        >
            <motion.div 
                className="relative space-y-6 sm:space-y-10 bg-black/40 p-6 sm:p-10 backdrop-blur-3xl border border-white/5 shadow-2xl overflow-hidden group"
                animate={{
                    rotateY: mousePos.x * 6, // Reduced from 12 for cleaner mobile experience
                    rotateX: -mousePos.y * 6,
                }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
                {/* Visual HUD Artillery */}
                <div className="absolute top-0 left-0 h-4 w-4 border-t border-l border-cyan-500/40" />
                <div className="absolute top-0 right-0 h-4 w-4 border-t border-r border-cyan-500/40" />
                <div className="absolute bottom-0 left-0 h-4 w-4 border-b border-l border-cyan-500/40" />
                <div className="absolute bottom-0 right-0 h-4 w-4 border-b border-r border-cyan-500/40" />

                {/* Scanning Light Beam */}
                <motion.div 
                    className="absolute inset-0 z-10 pointer-events-none"
                    animate={{
                        background: [
                            "linear-gradient(rgba(34,211,238,0) 0%, rgba(34,211,238,0.05) 50%, rgba(34,211,238,0) 100%) translateY(-100%)",
                            "linear-gradient(rgba(34,211,238,0) 0%, rgba(34,211,238,0.05) 50%, rgba(34,211,238,0) 100%) translateY(200%)"
                        ]
                    }}
                    transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: "linear",
                        delay: 2
                    }}
                />

                <div className="relative z-20 space-y-6">
                    <motion.div variants={itemVariants} className="flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.5em] text-cyan-500/60">
                        <div className="h-px w-12 bg-cyan-500/20" />
                        DIRECTOR ACCESS
                    </motion.div>
                    
                    <motion.div variants={itemVariants} className="space-y-2">
                        <h2 className="text-3xl sm:text-4xl font-black tracking-tighter text-white font-display">Welcome Back</h2>
                        <p className="text-xs sm:text-sm text-white/40 tracking-wide font-light font-sans">
                            Sign in to continue building cinematic projects.
                        </p>
                    </motion.div>
                </div>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 sm:space-y-10">
                        {error && (
                            <motion.div 
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ 
                                    opacity: 1, 
                                    x: 0,
                                    transition: {
                                        type: "spring",
                                        stiffness: 500,
                                        damping: 30
                                    }
                                }}
                                className="border-l-2 border-cyan-500/50 bg-cyan-500/5 p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200 shadow-xl"
                            >
                                {error}
                            </motion.div>
                        )}
                        {otpInfo && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ 
                                    opacity: 1, 
                                    x: 0,
                                    transition: {
                                        type: "spring",
                                        stiffness: 500,
                                        damping: 30
                                    }
                                }}
                                className="border-l-2 border-cyan-500/50 bg-cyan-500/5 p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200 shadow-xl"
                            >
                                <span className="text-cyan-500 mr-2">[ SYNC ]</span>
                                {otpInfo}
                            </motion.div>
                        )}
                        
                        <div className="space-y-8">
                            <motion.div variants={itemVariants}>
                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem className="space-y-3">
                                            <FormLabel className="text-[10px] font-mono font-bold uppercase tracking-[0.4em] text-white/30">Email</FormLabel>
                                            <FormControl>
                                                <div className="relative group">
                                                    <Input 
                                                        placeholder="operator@visiowave.studio" 
                                                        className="h-12 rounded-none border-0 border-b border-white/5 bg-transparent px-0 text-sm text-white/80 placeholder:text-white/10 focus:border-cyan-500/80 focus-visible:ring-0 transition-all duration-500 font-mono tracking-widest selection:bg-cyan-500/30 autofill:shadow-[inset_0_0_0px_1000px_#050505] autofill:text-white"
                                                        {...field} 
                                                    />
                                                    <div className="absolute bottom-0 left-0 h-px w-0 bg-cyan-500 transition-all duration-700 group-focus-within:w-full" />
                                                </div>
                                            </FormControl>
                                            <FormMessage className="text-[10px] uppercase tracking-widest text-white/30" />
                                        </FormItem>
                                    )}
                                />
                            </motion.div>
                            
                            <motion.div variants={itemVariants}>
                                <FormField
                                    control={form.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <FormLabel className="text-[10px] font-mono font-bold uppercase tracking-[0.4em] text-white/20">Password</FormLabel>
                                                <Link href="/forgot-password" className="text-[9px] font-mono font-bold uppercase tracking-widest text-white/20 hover:text-cyan-500 transition-colors">
                                                    Lost Key?
                                                </Link>
                                            </div>
                                            <FormControl>
                                                <div className="relative group">
                                                    <Input 
                                                        type="password" 
                                                        placeholder="••••••••••••" 
                                                        className="h-12 rounded-none border-0 border-b border-white/5 bg-transparent px-0 text-sm text-white/80 placeholder:text-white/10 focus:border-cyan-500/80 focus-visible:ring-0 transition-all duration-500 font-mono tracking-widest selection:bg-cyan-500/30 autofill:shadow-[inset_0_0_0px_1000px_#050505] autofill:text-white"
                                                        {...field} 
                                                    />
                                                    <div className="absolute bottom-0 left-0 h-px w-0 bg-cyan-500 transition-all duration-700 group-focus-within:w-full" />
                                                </div>
                                            </FormControl>
                                            <FormMessage className="text-[10px] uppercase tracking-widest text-white/30" />
                                        </FormItem>
                                    )}
                                />
                            </motion.div>
                        </div>

                        <motion.div variants={itemVariants} className="pt-6 relative">
                            <AnimatePresence>
                                {isPending && (
                                    <motion.div 
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="absolute -top-12 left-0 w-full space-y-2 pointer-events-none"
                                    >
                                        <div className="flex justify-between text-[8px] font-mono font-bold tracking-[0.2em] text-cyan-500/60 uppercase">
                                            <span>Syncing Operator Identity</span>
                                            <span>INITIALIZING...</span>
                                        </div>
                                        <div className="h-[2px] w-full bg-white/5 overflow-hidden">
                                            <motion.div 
                                                className="h-full bg-cyan-500"
                                                initial={{ width: "0%" }}
                                                animate={{ width: "100%" }}
                                                transition={{ duration: 2, ease: "easeInOut", repeat: Infinity }}
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <MagneticButton className="w-full">
                                <Button 
                                    type="submit" 
                                    className="h-14 w-full rounded-none border border-white/10 bg-white text-black text-[11px] font-black uppercase tracking-[0.6em] hover:bg-cyan-400 hover:border-cyan-400 focus-visible:ring-cyan-500/20 transition-all active:scale-[0.98] shadow-2xl shadow-cyan-500/10" 
                                    disabled={isPending}
                                >
                                    {isPending ? "INITIALIZING..." : "Login"}
                                    {!isPending && <ArrowRight className="ml-4 h-5 w-5" />}
                                </Button>
                            </MagneticButton>
                        </motion.div>

                        <motion.div variants={itemVariants} className="grid grid-cols-1 gap-6 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="h-12 rounded-none border-white/10 bg-black text-[9px] font-black uppercase tracking-[0.5em] text-white/30 hover:bg-white hover:text-black hover:border-white focus-visible:ring-white/10 transition-all shadow-xl group/node"
                                onClick={onSendOtpSignIn}
                                disabled={otpPending || isPending || oauthPending}
                            >
                                <Zap className="mr-3 h-4 w-4 text-cyan-400 group-hover/node:text-black transition-colors" />
                                {otpPending ? "SENDING OTP..." : "Sign in with Email OTP"}
                            </Button>
                             <Button
                                type="button"
                                variant="outline"
                                className="h-12 rounded-none border-white/10 bg-black text-[9px] font-black uppercase tracking-[0.5em] text-white/30 hover:bg-white hover:text-black hover:border-white focus-visible:ring-white/10 transition-all shadow-xl group/node"
                                onClick={onGoogleSignIn}
                                disabled={oauthPending || otpPending}
                            >
                                <Chrome className="mr-3 h-4 w-4 group-hover/node:rotate-90 transition-transform duration-500" />
                                {oauthPending ? "REDIRECTING..." : "Continue with Google"}
                            </Button>
                        </motion.div>
                    </form>
                </Form>

                <motion.div variants={itemVariants} className="pt-12 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/20">
                        Don&apos;t have an account?{" "}
                        <Link href="/signup" className="text-cyan-500 hover:text-cyan-400 transition-colors ml-2 underline underline-offset-4">
                            Sign up
                        </Link>
                    </p>
                </motion.div>
            </motion.div>
        </motion.div>
    )
}
