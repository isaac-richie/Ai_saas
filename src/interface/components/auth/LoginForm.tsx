"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { loginSchema, LoginInput } from "@/core/types/auth"
import { login } from "@/core/actions/auth"
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
import { Aperture, ArrowRight } from "lucide-react"

export function LoginForm() {
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const form = useForm<LoginInput>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    })

    async function onSubmit(data: LoginInput) {
        setError(null)
        startTransition(async () => {
            const result = await login(data)
            if (result?.error) {
                setError(result.error)
            }
        })
    }

    return (
        <Card data-reveal="hero" className="glass-panel w-full max-w-md rounded-3xl border-border/60">
            <CardHeader className="space-y-4">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    <Aperture className="h-3.5 w-3.5" />
                    Director Access
                </div>
                <div>
                    <CardTitle className="text-3xl font-semibold tracking-tight">Welcome back</CardTitle>
                    <CardDescription className="mt-2 text-sm">
                        Sign in to continue building cinematic projects.
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent>
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
                            {isPending ? "Logging in..." : "Login"}
                            {!isPending && <ArrowRight className="ml-2 h-4 w-4" />}
                        </Button>
                    </form>
                </Form>
            </CardContent>
            <CardFooter className="justify-center">
                <p className="text-sm text-muted-foreground">
                    Don&apos;t have an account?{" "}
                    <Link href="/signup" className="font-medium text-primary hover:underline">
                        Sign up
                    </Link>
                </p>
            </CardFooter>
        </Card>
    )
}
