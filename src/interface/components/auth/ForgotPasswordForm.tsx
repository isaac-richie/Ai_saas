"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { ArrowLeft, Mail, RadioTower } from "lucide-react"
import { motion, Variants } from "framer-motion"
import { requestPasswordReset } from "@/core/actions/auth"
import { ForgotPasswordInput, forgotPasswordSchema } from "@/core/types/auth"
import { humanizeAuthError } from "@/interface/components/auth/auth-error-message"
import { Button } from "@/interface/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/interface/components/ui/form"
import { Input } from "@/interface/components/ui/input"
import { MagneticButton } from "@/interface/components/ui/MagneticButton"

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

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  })

  useEffect(() => {
    if (!error) return
    const timeoutId = window.setTimeout(() => setError(null), 4000)
    return () => window.clearTimeout(timeoutId)
  }, [error])

  function onSubmit(data: ForgotPasswordInput) {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await requestPasswordReset(data)
      if (result?.error) {
        setError(humanizeAuthError(result.error))
      } else if (result?.success) {
        setSuccess(result.message)
      }
    })
  }

  const handleMouseMove = (event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5
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
      style={{ perspective: "1000px" }}
    >
      <motion.div
        className="group relative space-y-8 overflow-hidden border border-white/5 bg-black/40 p-6 shadow-2xl backdrop-blur-3xl sm:p-10"
        animate={{
          rotateY: mousePos.x * 6,
          rotateX: -mousePos.y * 6,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <div className="absolute left-0 top-0 h-4 w-4 border-l border-t border-cyan-500/40" />
        <div className="absolute right-0 top-0 h-4 w-4 border-r border-t border-cyan-500/40" />
        <div className="absolute bottom-0 left-0 h-4 w-4 border-b border-l border-cyan-500/40" />
        <div className="absolute bottom-0 right-0 h-4 w-4 border-b border-r border-cyan-500/40" />

        <motion.div
          className="pointer-events-none absolute inset-0 z-10"
          animate={{
            background: [
              "linear-gradient(rgba(34,211,238,0) 0%, rgba(34,211,238,0.05) 50%, rgba(34,211,238,0) 100%) translateY(-100%)",
              "linear-gradient(rgba(34,211,238,0) 0%, rgba(34,211,238,0.05) 50%, rgba(34,211,238,0) 100%) translateY(200%)",
            ],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear", delay: 2 }}
        />

        <div className="relative z-20 space-y-6">
          <motion.div variants={itemVariants} className="flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.5em] text-cyan-500/60">
            <div className="h-px w-12 bg-cyan-500/20" />
            RECOVERY BEACON
          </motion.div>

          <motion.div variants={itemVariants} className="space-y-3">
            <div className="flex h-12 w-12 items-center justify-center border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
              <RadioTower className="h-5 w-5" />
            </div>
            <h2 className="font-display text-3xl font-black tracking-tighter text-white sm:text-4xl">Reset Access</h2>
            <p className="text-xs leading-relaxed tracking-wide text-white/45 sm:text-sm">
              Enter your account email and we&apos;ll send a secure reset link to restore access.
            </p>
          </motion.div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="relative z-20 space-y-8">
            {error && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="border-l-2 border-red-400/50 bg-red-500/5 p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-red-100 shadow-xl"
              >
                {error}
              </motion.div>
            )}

            {success && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="border-l-2 border-cyan-500/50 bg-cyan-500/5 p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-100 shadow-xl"
              >
                <span className="mr-2 text-cyan-400">[ SENT ]</span>
                {success}
              </motion.div>
            )}

            <motion.div variants={itemVariants}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="font-mono text-[10px] font-bold uppercase tracking-[0.4em] text-white/30">Email</FormLabel>
                    <FormControl>
                      <div className="group/input relative">
                        <Input
                          type="email"
                          placeholder="operator@visiowave.studio"
                          className="h-12 rounded-none border-0 border-b border-white/5 bg-transparent px-0 pr-10 font-mono text-sm tracking-widest text-white/80 transition-all duration-500 placeholder:text-white/10 autofill:shadow-[inset_0_0_0px_1000px_#050505] autofill:text-white focus:border-cyan-500/80 focus-visible:ring-0"
                          {...field}
                        />
                        <Mail className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-white/20 transition-colors group-focus-within/input:text-cyan-400" />
                        <div className="absolute bottom-0 left-0 h-px w-0 bg-cyan-500 transition-all duration-700 group-focus-within/input:w-full" />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[10px] uppercase tracking-widest text-white/30" />
                  </FormItem>
                )}
              />
            </motion.div>

            <motion.div variants={itemVariants} className="pt-2">
              <MagneticButton className="w-full">
                <Button
                  type="submit"
                  className="h-14 w-full rounded-none border border-white/10 bg-white text-[11px] font-black uppercase tracking-[0.45em] text-black shadow-2xl shadow-cyan-500/10 transition-all hover:border-cyan-400 hover:bg-cyan-400 focus-visible:ring-cyan-500/20 active:scale-[0.98]"
                  disabled={isPending}
                >
                  {isPending ? "SENDING LINK..." : "Send Reset Link"}
                </Button>
              </MagneticButton>
            </motion.div>
          </form>
        </Form>

        <motion.div variants={itemVariants} className="relative z-20 text-center">
          <Link href="/login" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.35em] text-white/25 transition-colors hover:text-cyan-400">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Login
          </Link>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
