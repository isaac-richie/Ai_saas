import { SignupForm } from '@/interface/components/auth/SignupForm';
import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create your studio account',
  description: 'Join Visiowave and bring your cinematic ideas to life.',
};

export default function SignupPage() {
  return <SignupForm />;
}
