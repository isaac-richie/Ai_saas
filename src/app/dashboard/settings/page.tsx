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
        label="04 / MAKE IT YOURS"
        title="Your studio, your way."
        description="Fine-tune your workspace, manage connections, and keep creating."
      />
      <nav className="workspace-settings-nav" aria-label="Settings sections">
        <a href="#preferences">
          Preferences <ArrowDownRight size={14} />
        </a>
        <a href="#connections">
          Connections <ArrowDownRight size={14} />
        </a>
        {billing && (
          <a href="#membership">
            Membership <ArrowDownRight size={14} />
          </a>
        )}
      </nav>
      <section id="preferences" className="workspace-setting-group">
        <div className="workspace-setting-label">
          <span className="workspace-eyebrow">01 / PREFERENCES</span>
          <h2>Set the mood.</h2>
          <p>Choose your preferred provider and the amount of motion in your workspace.</p>
        </div>
        <div className="workspace-setting-controls">
          <PreferredProviderCard />
          <MotionSettingsCard />
        </div>
      </section>
      <section id="connections" className="workspace-setting-group">
        <div className="workspace-setting-label">
          <span className="workspace-eyebrow">02 / CONNECTIONS</span>
          <h2>Your creative tools.</h2>
          <p>
            Manage the provider connections you use for generation. Assistant Director is provided
            by Visiowave.
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
      {billing && (
        <section id="membership" className="workspace-setting-group">
          <div className="workspace-setting-label">
            <span className="workspace-eyebrow">03 / MEMBERSHIP</span>
            <h2>Room to create.</h2>
            <p>Your current plan and studio access.</p>
          </div>
          <div className="workspace-setting-controls">
            <BillingPlanCard billing={billing} checkoutUrl={process.env.NEXT_PUBLIC_CHECKOUT_URL} />
          </div>
        </section>
      )}
    </div>
  );
}
