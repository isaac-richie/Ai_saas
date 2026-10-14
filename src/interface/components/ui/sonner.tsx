"use client"

import { Toaster as Sonner, toast } from "sonner"
import { friendlyError } from "@/core/utils/friendly-error"

type ToasterProps = React.ComponentProps<typeof Sonner>

// Every error toast in the app goes through one plain-language filter, so raw technical
// text (validation, HTTP, provider errors) never reaches a creator.
const originalError = toast.error
toast.error = ((message: Parameters<typeof toast.error>[0], data?: Parameters<typeof toast.error>[1]) =>
  originalError(typeof message === "string" ? friendlyError(message) : message, data)) as typeof toast.error

/** Obsidian-and-gold toasts at the top, clear of the phone tab bar and the Create button. */
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="dark"
    position="top-center"
    offset={16}
    gap={10}
    visibleToasts={3}
    closeButton
    className="toaster group"
    toastOptions={{
      duration: 5000,
      classNames: {
        toast:
          "group toast !rounded-2xl !border !border-gold-400/25 !bg-[#111311]/95 !px-4 !py-3.5 !text-[#ece6d6] !shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9),0_0_0_1px_rgba(217,192,138,0.05)] backdrop-blur-xl !font-sans",
        title: "!text-[14px] !font-medium !leading-snug",
        description: "!text-[13px] !leading-snug !text-[#B0B8C4]",
        icon: "!text-gold-300",
        error: "!border-rose-300/30 [&_[data-icon]]:!text-rose-300",
        success: "[&_[data-icon]]:!text-emerald-300",
        warning: "!border-amber-300/30 [&_[data-icon]]:!text-amber-300",
        closeButton: "!border-gold-400/25 !bg-[#1a1c1a] !text-[#B0B8C4] hover:!text-white",
        actionButton: "!rounded-lg !bg-gold-300 !text-[#1a160e] !font-semibold",
        cancelButton: "!rounded-lg !bg-white/10 !text-white/80",
      },
    }}
    {...props}
  />
)

export { Toaster }
