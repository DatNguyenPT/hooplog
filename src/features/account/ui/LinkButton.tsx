import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/shared/ui/theme';

/** A plain text button for the quiet choices under a form, such as switching to another form. */
export function LinkButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.link}
    >
      <Text style={[styles.text, { color: theme.primary }, disabled && styles.disabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
