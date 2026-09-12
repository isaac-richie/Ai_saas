'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import Link from 'next/link';
import { ArrowRight, Chrome, Zap, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { signup } from '@/core/actions/auth';
import { signupSchema, SignupInput } from '@/core/types/auth';
import { createClient } from '@/infrastructure/supabase/client';
import { Button } from '@/interface/components/ui/button';
import { Input } from '@/interface/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/interface/components/ui/form';
import { humanizeAuthError } from '@/interface/components/auth/auth-error-message';

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [otpInfo, setOtpInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [oauthPending, setOauthPending] = useState(false);
  const [otpPending, setOtpPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(data: SignupInput) {
    setError(null);
    setSuccess(null);
    setOtpInfo(null);
    startTransition(async () => {
      let result;
      try {
        result = await signup(data);
      } catch {
        setError('Could not connect. Please try again.');
        return;
      }
      if (result?.error) {
        setError(humanizeAuthError(result.error));
      } else if (result?.success) {
        setSuccess(result.message);
      }
    });
  }

  async function onGoogleSignUp() {
    try {
      setError(null);
      setOtpInfo(null);
      setOauthPending(true);
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      });
      if (error) setError(humanizeAuthError(error.message));
    } catch {
      setError(humanizeAuthError('fetch failed'));
    } finally {
      setOauthPending(false);
    }
  }

  async function onSendOtpSignup() {
    const email = form.getValues('email')?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email before requesting OTP.');
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      setOtpInfo(null);
      setOtpPending(true);
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        setError(humanizeAuthError(error.message));
        return;
      }

      setOtpInfo('OTP sent. Enter the 6-digit code to complete signup.');
      router.push(
        `/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent('/dashboard')}&mode=signup`
      );
    } catch {
      setError(humanizeAuthError('fetch failed'));
    } finally {
      setOtpPending(false);
    }
  }

  const busy = isPending || oauthPending || otpPending;
  return (
    <div className="cinema-signup">
      <span className="cinema-eyebrow">YOUR CREATIVE CHAPTER STARTS HERE</span>
      <h1>
        Create your
        <br />
        <em>studio account.</em>
      </h1>
      <p className="cinema-signup-intro">A little setup. A world of possibilities.</p>
      {success ? (
        <div className="cinema-success" role="status">
          <CheckCircle2 size={30} />
          <h2>Check your inbox.</h2>
          <p>{success}</p>
          <Link className="cinema-text-link" href="/login">
            Return to sign in <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-busy={busy}>
            {error && (
              <div role="alert" className="cinema-form-error">
                {error}
              </div>
            )}
            {otpInfo && <p role="status">{otpInfo}</p>}
            <Button
              type="button"
              className="cinema-google"
              variant="outline"
              onClick={onGoogleSignUp}
              disabled={busy}
            >
              <Chrome size={17} />
              {oauthPending ? 'Connecting...' : 'Continue with Google'}
            </Button>
            <div className="cinema-divider">
              <span />
              or create with email
              <span />
            </div>
            <div className="cinema-fields">
              {(['email', 'password', 'confirmPassword'] as const).map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {name === 'email'
                          ? 'Email address'
                          : name === 'password'
                            ? 'Password'
                            : 'Confirm password'}
                      </FormLabel>
                      <div className="cinema-input-wrap">
                        <FormControl>
                          <Input
                            {...field}
                            type={name === 'email' ? 'email' : showPassword ? 'text' : 'password'}
                            autoComplete={name === 'email' ? 'email' : 'new-password'}
                            placeholder={
                              name === 'email'
                                ? 'you@example.com'
                                : name === 'password'
                                  ? 'Create a password'
                                  : 'Repeat your password'
                            }
                            disabled={busy}
                          />
                        </FormControl>
                        {name === 'password' && (
                          <button
                            type="button"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            aria-pressed={showPassword}
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        )}
                      </div>
                      {name === 'password' && (
                        <FormDescription className="cinema-field-help">
                          8+ characters, with uppercase, lowercase, and a number.
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <Button
              type="submit"
              className="cinema-button cinema-primary cinema-submit"
              disabled={busy}
            >
              {isPending ? 'Creating your account...' : 'Create account'}
              <ArrowUpRightIcon />
            </Button>
            <button className="cinema-otp" type="button" disabled={busy} onClick={onSendOtpSignup}>
              <Zap size={14} />
              {otpPending ? 'Sending code...' : 'Prefer a code? Sign up with email OTP'}
            </button>
          </form>
        </Form>
      )}
      <p className="cinema-signin">
        Already have an account?{' '}
        <Link href="/login">
          Sign in <ArrowRight size={14} />
        </Link>
      </p>
    </div>
  );
}

function ArrowUpRightIcon() {
  return <ArrowRight size={18} className="-rotate-45" />;
}
