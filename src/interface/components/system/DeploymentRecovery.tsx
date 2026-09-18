"use client"

import { useEffect } from "react"
import { recoverFromStaleServerAction } from "@/interface/lib/server-action-recovery"

export function DeploymentRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (recoverFromStaleServerAction(event.error || event.message)) event.preventDefault()
    }
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (recoverFromStaleServerAction(event.reason)) event.preventDefault()
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onUnhandledRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onUnhandledRejection)
    }
  }, [])

  return null
}
