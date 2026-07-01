import { LazyLegalDocumentView } from '@/components/LazyLegalDocumentView';
import { Screen } from '@/components/Screen';
import type { LegalDocumentKey } from '@/lib/legal/bundled-legal';

interface LegalDocumentScreenProps {
  documentKey: LegalDocumentKey;
  showAppVersion?: boolean;
}

/** Shared layout for legal/about markdown routes. */
export function LegalDocumentScreen({ documentKey, showAppVersion }: LegalDocumentScreenProps) {
  return (
    <Screen scroll={false} style={{ padding: 0 }}>
      <LazyLegalDocumentView documentKey={documentKey} showAppVersion={showAppVersion} />
    </Screen>
  );
}
