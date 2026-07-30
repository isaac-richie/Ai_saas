# Supabase Auth Email Branding

Supabase sends auth emails unless the app replaces Supabase Auth entirely. To avoid users seeing a Supabase-hosted confirmation URL, customize the Auth email templates to point at Visiowave first.

In Supabase Dashboard:

1. Go to `Authentication` -> `Email Templates`.
2. Open `Confirm signup`.
3. Set the confirmation link to:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard">
  Confirm your email address
</a>
```

4. Open `Reset password`.
5. Set the reset link to:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">
  Reset your password
</a>
```

Also set `Authentication` -> `URL Configuration`:

```text
Site URL: https://your-production-domain.com
Redirect URLs:
https://your-production-domain.com/auth/callback
https://your-production-domain.com/auth/confirm
https://your-production-domain.com/reset-password
http://localhost:3000/auth/callback
http://localhost:3000/auth/confirm
```

For production branding, configure `Authentication` -> `SMTP Settings` with a Visiowave-owned sender. Without custom SMTP, many inboxes will still show Supabase as the sender.
