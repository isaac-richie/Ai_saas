"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { signupSchema, SignupInput } from "@/core/types/auth"
import { signup } from "@/core/actions/auth"
import { Button } from "@/interface/components/ui/button"
import { Input } from "@/interface/components/ui/input"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/interface/components/ui/form"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/interface/components/ui/card"
import { useState, useTransition } from "react"
import Link from "next/link"
import { CheckCircle2, Sparkles } from "lucide-react"

export function SignupForm() {
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const form = useForm<SignupInput>({
        resolver: zodResolver(signupSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    })

    async function onSubmit(data: SignupInput) {
        setError(null)
        setSuccess(null)
        startTransition(async () => {
            const result = await signup(data)
            if (result?.error) {
                setError(result.error)
            } else if (result?.success) {
                setSuccess(result.message)
            }
        })
    }

    return (
        <Card data-reveal="hero" className="glass-panel w-full max-w-md rounded-3xl border-border/60">
            <CardHeader className="space-y-4">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" />
                    New Studio
                </div>
                <div>
                    <CardTitle className="text-3xl font-semibold tracking-tight">Create account</CardTitle>
                    <CardDescription className="mt-2 text-sm">
                        Set up your workspace and start building shot-driven productions.
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent>
                {success ? (
                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center text-emerald-600 dark:text-emerald-300">
                        <p className="inline-flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" />Success</p>
                        <p className="mt-1 text-sm">{success}</p>
                    </div>
                ) : (
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            {error && (
                                <div className="rounded-xl bg-destructive/15 p-3 text-sm text-destructive">
                                    {error}
                                </div>
                            )}
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input placeholder="hello@example.com" className="rounded-xl border-border/60 bg-card/60" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Password</FormLabel>
                                        <FormControl>
                                            <Input type="password" placeholder="******" className="rounded-xl border-border/60 bg-card/60" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" className="w-full rounded-xl" disabled={isPending}>
                                {isPending ? "Signing up..." : "Create account"}
                            </Button>
                        </form>
                    </Form>
                )}
            </CardContent>
            <CardFooter className="justify-center">
                <p className="text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link href="/login" className="font-medium text-primary hover:underline">
                        Login
                    </Link>
                </p>
            </CardFooter>
        </Card>
    )
}
