import { LegalDocumentView } from '@/components/LegalDocumentView';
import { Screen } from '@/components/Screen';

/** About game and rules (from docs/wordreapers_about.md). */
export default function AboutScreen() {
  return (
    <Screen scroll={false} style={{ padding: 0 }}>
      <LegalDocumentView documentKey="about" showAppVersion />
    </Screen>
  );
}
