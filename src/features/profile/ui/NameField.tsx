import { StyleSheet, Text, TextInput, View } from 'react-native';

import { InlineError } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { MAX_DISPLAY_NAME_LENGTH } from '../domain/profile';

type Props = {
  label: string;
  hint: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Called when the keyboard's Done key is pressed. */
  onSubmit?: () => void;
  error: string | null;
};

/** Name entry shared by the welcome screen and Settings. */
export function NameField({ label, hint, value, onChangeText, onSubmit, error }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <TextInput
        testID="display-name"
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        // Room beyond the limit, so a name that is too long shows the error instead of being cut off silently.
        maxLength={MAX_DISPLAY_NAME_LENGTH + 20}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.surface,
            borderColor: error ? theme.missed : theme.border,
          },
        ]}
      />
      <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text>
      {error ? <InlineError message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 18,
  },
  hint: { fontSize: 14 },
});
