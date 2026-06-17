import { LegalDocumentView } from '@/components/LegalDocumentView';
import { Screen } from '@/components/Screen';

/** Terms of use (from docs/legal/uk-uk/terms_of_use.md). */
export default function TermsScreen() {
  return (
    <Screen scroll={false} style={{ padding: 0 }}>
      <LegalDocumentView documentKey="terms" />
    </Screen>
  );
}
