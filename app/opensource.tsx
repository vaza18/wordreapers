import { LegalDocumentView } from '@/components/LegalDocumentView';
import { Screen } from '@/components/Screen';

/** Open-source licenses (from docs/legal/uk-uk/open_source.md). */
export default function OpenSourceScreen() {
  return (
    <Screen scroll={false} style={{ padding: 0 }}>
      <LegalDocumentView documentKey="openSource" />
    </Screen>
  );
}
