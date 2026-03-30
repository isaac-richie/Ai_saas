export function humanizeAuthError(input?: string | null): string {
  const message = (input || "").trim()
  if (!message) return "Something went wrong. Please try again."

  const lower = message.toLowerCase()

  if (
    lower.includes("password should contain at least one character")
    || lower.includes("password should contain")
  ) {
    return "Use at least 8 characters with an uppercase letter, lowercase letter, and number."
  }

  if (lower.includes("invalid login credentials")) {
    return "Email or password is incorrect."
  }

  if (lower.includes("email not confirmed")) {
    return "Please verify your email before signing in."
  }

  if (lower.includes("user already registered")) {
    return "This email is already registered. Try signing in instead."
  }

  if (lower.includes("otp") && lower.includes("expired")) {
    return "This code has expired. Request a new OTP and try again."
  }

  if (lower.includes("invalid otp") || lower.includes("token has expired")) {
    return "Invalid code. Check the OTP and try again."
  }

  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return "Too many attempts. Please wait a moment and try again."
  }

  if (lower.includes("network") || lower.includes("fetch failed")) {
    return "Network issue detected. Check your connection and retry."
  }

  return message
}

