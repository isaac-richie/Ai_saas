import { z } from "zod"

export const loginSchema = z.object({
    email: z.string().email({ message: "Invalid email address" }),
    password: z.string().min(6, { message: "Password must be at least 6 characters" }),
})

export const signupSchema = z.object({
    email: z.string().email({ message: "Invalid email address" }),
    password: z.string().min(6, { message: "Password must be at least 6 characters" }),
    confirmPassword: z.string().min(6, { message: "Confirmation required" }),
}).refine((data) => data.password === data.confirmPassword, {
    message: "SEQUENCE_SYNC_FAILURE: Passwords do not match",
    path: ["confirmPassword"],
})

export const forgotPasswordSchema = z.object({
    email: z.string().email({ message: "Invalid email address" }),
})

export const resetPasswordSchema = z.object({
    password: z
        .string()
        .min(8, { message: "Password must be at least 8 characters" })
        .regex(/[a-z]/, { message: "Add at least one lowercase letter" })
        .regex(/[A-Z]/, { message: "Add at least one uppercase letter" })
        .regex(/[0-9]/, { message: "Add at least one number" }),
    confirmPassword: z.string().min(8, { message: "Confirmation required" }),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
})

export type LoginInput = z.infer<typeof loginSchema>
export type SignupInput = z.infer<typeof signupSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
