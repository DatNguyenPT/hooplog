import type { ComponentRef, ReactNode, Ref } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { InlineError } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';

/** What a ref to the field's input points at: the thing that can be focused. */
export type AuthInput = ComponentRef<typeof TextInput>;

type Props = TextInputProps & {
  label: string;
  error: string | null;
  /** Lets the form move on to the next field when the keyboard's Next key is pressed. */
  inputRef?: Ref<AuthInput>;
  /** Sits at the end of the input, inside its border: for example a show/hide button. */
  trailing?: ReactNode;
};

/** A labelled text input for the sign-in form: no auto-capitalising or auto-correcting. */
export function AuthField({ label, error, inputRef, trailing, ...input }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <View
        style={[
          styles.box,
          { backgroundColor: theme.surface, borderColor: error ? theme.missed : theme.fieldBorder },
        ]}
      >
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: theme.text }]}
          {...input}
        />
        {trailing}
      </View>
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
});
