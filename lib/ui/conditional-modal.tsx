import type { ReactNode } from 'react';
import { Modal, type ModalProps } from 'react-native';

type ConditionalModalProps = ModalProps & {
  visible: boolean;
  children: ReactNode;
};

/**
 * Mount Modal only while open — avoids iOS ghost overlays after navigation unmounts the parent.
 */
export function ConditionalModal({ visible, children, ...modalProps }: ConditionalModalProps) {
  if (!visible) {
    return null;
  }

  return (
    <Modal visible animationType="fade" {...modalProps}>
      {children}
    </Modal>
  );
}
