import { ApiKeyList } from '@/interface/components/settings/ApiKeyList';
import { PreferredProviderCard } from '@/interface/components/settings/PreferredProviderCard';
import { MotionSettingsCard } from '@/interface/components/settings/MotionSettingsCard';
import { BillingPlanCard } from '@/interface/components/settings/BillingPlanCard';
import { ShieldCheck, ArrowDownRight } from 'lucide-react';
import { getMyBillingSnapshot } from '@/core/actions/billing';
import { WorkspaceHeading } from '@/interface/components/layout/WorkspaceHeading';

export const metadata = {
  title: 'Settings',
  description: 'Manage your studio preferences and provider connections',
};

export default async function SettingsPage() {
  const billingRes = await getMyBillingSnapshot();
  const billing = billingRes.data || null;
  return (
    <div className="workspace-page workspace-settings">
      <WorkspaceHeading
        label="SETTINGS"
        title="Your studio, your way."
        description="Your plan, your preferences, and optional advanced options."
      />
      <nav className="workspace-settings-nav" aria-label="Settings sections">
        {billing && (
          <a href="#membership">
            Your plan <ArrowDownRight size={14} />
          </a>
        )}
        <a href="#preferences">
          Preferences <ArrowDownRight size={14} />
        </a>
        <a href="#connections">
          Advanced <ArrowDownRight size={14} />
        </a>
      </nav>
      {billing && (
        <section id="membership" className="workspace-setting-group">
          <div className="workspace-setting-label">
            <span className="workspace-eyebrow">YOUR PLAN</span>
            <h2>What&apos;s included.</h2>
            <p>What you can make, and how much you have left.</p>
          </div>
          <div className="workspace-setting-controls">
            <BillingPlanCard billing={billing} checkoutUrl={process.env.NEXT_PUBLIC_CHECKOUT_URL} />
          </div>
        </section>
      )}
      <section id="preferences" className="workspace-setting-group">
        <div className="workspace-setting-label">
          <span className="workspace-eyebrow">PREFERENCES</span>
          <h2>How it feels.</h2>
          <p>Pick the AI engine (Auto works for almost everyone) and how much animation you see.</p>
        </div>
        <div className="workspace-setting-controls">
          <PreferredProviderCard />
          <MotionSettingsCard />
        </div>
      </section>
      <section id="connections" className="workspace-setting-group">
        <div className="workspace-setting-label">
          <span className="workspace-eyebrow">ADVANCED</span>
          <h2>Use your own AI keys.</h2>
          <p>
            Optional. Everything works without this: only add a key if you already pay for an AI
            provider and want to use your own account.
          </p>
          <div className="workspace-security-note">
            <ShieldCheck size={17} />
            <span>Your keys are encrypted before storage and scoped to your account.</span>
          </div>
        </div>
        <div className="workspace-setting-controls">
          <ApiKeyList />
        </div>
      </section>
    </div>
  );
}
