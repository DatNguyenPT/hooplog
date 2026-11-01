import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { createEdgeSwipeResponder } from './edgeSwipeResponder';

type Props = {
  /** When off, the children are shown as they are, with no touch handling at all. */
  enabled?: boolean;
  children: ReactNode;
};

const goBack = () => {
  if (router.canGoBack()) router.back();
};

/**
 * Goes back when the player swipes in from the left or right edge of the screen. Only touches that
 * start in an edge strip are taken over, so scrolling and the horizontal pickers keep working.
 */
export function EdgeSwipeBack({ enabled = true, children }: Props) {
  const { width } = useWindowDimensions();
  const responder = useMemo(() => createEdgeSwipeResponder(width, goBack), [width]);

  return (
    <View style={styles.fill} {...(enabled ? responder.panHandlers : undefined)}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
