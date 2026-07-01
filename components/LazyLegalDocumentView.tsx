import { lazy, Suspense, type ComponentProps } from 'react';
import { ActivityIndicator, View } from 'react-native';

const LegalDocumentViewLazy = lazy(async () => {
  const module = await import('@/components/LegalDocumentView');
  return { default: module.LegalDocumentView };
});

/** Lazy-load markdown renderer for legal/about screens. */
export function LazyLegalDocumentView(props: ComponentProps<typeof LegalDocumentViewLazy>) {
  return (
    <Suspense
      fallback={
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      }
    >
      <LegalDocumentViewLazy {...props} />
    </Suspense>
  );
}
