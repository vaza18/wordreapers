import { LegalDocumentView } from '@/components/LegalDocumentView';
import { Screen } from '@/components/Screen';

/** Privacy policy (from docs/legal/uk-uk/privacy_policy.md). */
export default function PrivacyScreen() {
  return (
    <Screen scroll={false} style={{ padding: 0 }}>
      <LegalDocumentView documentKey="privacy" />
    </Screen>
  );
}
