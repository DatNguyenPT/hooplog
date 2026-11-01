import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { InlineError } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';

type Props = TextInputProps & {
  label: string;
  hint?: string;
  error: string | null;
  /** Sits at the end of the input, inside its border: for example a show/hide button. */
  trailing?: ReactNode;
};

/** A labelled text input for the sign-in form: no auto-capitalising or auto-correcting. */
export function AuthField({ label, hint, error, trailing, ...input }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <View
        style={[
          styles.box,
          { backgroundColor: theme.surface, borderColor: error ? theme.missed : theme.border },
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: theme.text }]}
          {...input}
        />
        {trailing}
      </View>
      {hint ? <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text> : null}
      {error ? <InlineError message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  box: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: { flex: 1, minHeight: 48, paddingHorizontal: 12, fontSize: 18 },
  hint: { fontSize: 14 },
});
