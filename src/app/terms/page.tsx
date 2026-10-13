import { Metadata } from 'next';
import { LEGAL_CONTACT_EMAIL, LegalPage } from '@/interface/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms for using Visiowave Studios.',
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These terms govern your use of Visiowave Studios at visiowaveai.com. By creating an account or using the service, you agree to them."
      sections={[
        {
          heading: 'Beta service',
          body: <p>Visiowave is currently in beta. Features may change, break or be removed, and the service is provided “as is” without warranties of any kind.</p>,
        },
        {
          heading: 'Your account',
          body: <p>You must provide accurate information and keep your account secure. You are responsible for activity on your account. You must be at least 13 years old, or the minimum age required in your country.</p>,
        },
        {
          heading: 'Your content',
          body: (
            <p>
              You keep ownership of the prompts and media you upload and, to the extent the law allows, of the output generated for you. You give us the permission
              needed to store, process and display that content to provide the service. You are responsible for having the rights to anything you upload.
            </p>
          ),
        },
        {
          heading: 'Acceptable use',
          body: (
            <ul>
              <li>No illegal content, or content that sexualises minors.</li>
              <li>No deceptive deepfakes of real people, harassment, or content that infringes others’ rights.</li>
              <li>No attempts to abuse, overload, reverse-engineer or bypass limits of the service.</li>
            </ul>
          ),
        },
        {
          heading: 'Credits',
          body: <p>Generations use credits. Credits have no cash value and may expire or change during the beta. Failed generations may be refunded to your balance at our discretion.</p>,
        },
        {
          heading: 'AI output',
          body: <p>AI-generated output can be inaccurate or unexpected and may resemble other content. Review output before relying on or publishing it.</p>,
        },
        {
          heading: 'Termination',
          body: <p>You can stop using Visiowave at any time. We may suspend or close accounts that break these terms or put the service or other users at risk.</p>,
        },
        {
          heading: 'Liability',
          body: <p>To the maximum extent permitted by law, Visiowave is not liable for indirect or consequential losses, or for loss of data or content arising from your use of the service.</p>,
        },
        {
          heading: 'Changes and contact',
          body: (
            <p>
              We may update these terms and will post the new date above. Questions? Email <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
