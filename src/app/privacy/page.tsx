import { Metadata } from 'next';
import { LEGAL_CONTACT_EMAIL, LegalPage } from '@/interface/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Visiowave Studios collects, uses and protects your information.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="Visiowave Studios (“Visiowave”, “we”) is an AI video studio. This policy explains what information we collect when you use visiowaveai.com, how we use it, and the choices you have."
      sections={[
        {
          heading: 'Information we collect',
          body: (
            <ul>
              <li>Account details: your email address and, if you sign in with Google, your name and profile picture as shared by Google.</li>
              <li>Content you create: prompts, scripts, uploaded images or media, and the videos and images generated for you.</li>
              <li>Usage and technical data: credit usage, generation history, device and browser information, and logs needed to run and secure the service.</li>
            </ul>
          ),
        },
        {
          heading: 'How we use your information',
          body: (
            <ul>
              <li>To create and secure your account and sign you in.</li>
              <li>To generate the content you request and store it in your studio.</li>
              <li>To track credits, prevent abuse, fix problems and improve the product.</li>
              <li>To contact you about your account or important changes to the service.</li>
            </ul>
          ),
        },
        {
          heading: 'Google user data',
          body: (
            <p>
              If you use “Continue with Google”, we receive only your name, email address and profile picture. We use them solely to create and sign in to your
              Visiowave account. We do not access your Gmail, Drive, contacts or any other Google data, we do not sell Google user data, and we do not use it for
              advertising. Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.
            </p>
          ),
        },
        {
          heading: 'Service providers',
          body: (
            <p>
              We share data only with providers that help us run Visiowave: Supabase (accounts, database and storage), and AI model providers such as OpenAI and
              video and image generation partners, which receive the prompts and media needed to fulfil your requests. We do not sell your personal information.
            </p>
          ),
        },
        {
          heading: 'Retention and deletion',
          body: (
            <p>
              We keep your account and content for as long as your account is active. You can delete content in your studio at any time, and you can ask us to delete
              your account and associated data by emailing <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
            </p>
          ),
        },
        {
          heading: 'Security',
          body: <p>We use encryption in transit, access controls and encrypted storage of sensitive keys. No online service is perfectly secure, but we work to protect your data.</p>,
        },
        {
          heading: 'Your rights',
          body: <p>Depending on where you live, you may have the right to access, correct, export or delete your personal data, or to object to certain processing. Contact us to make a request.</p>,
        },
        {
          heading: 'Changes and contact',
          body: (
            <p>
              We may update this policy as the product changes and will post the new date above. Questions? Email{' '}
              <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
