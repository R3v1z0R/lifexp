import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import { colors, spacing, radii, fonts } from "../../theme";

export default function Login() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>
        Life<Text style={{ color: colors.xp }}>XP</Text>
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Email or username"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        value={identifier}
        onChangeText={setIdentifier}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={onSubmit} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
      <Link href="/(auth)/register" style={styles.link}>
        New here? Create an account
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: "center", gap: spacing.md },
  brand: { fontFamily: fonts.display, fontSize: 34, color: colors.ink, textAlign: "center", marginBottom: spacing.lg },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, color: colors.ink, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontFamily: fonts.body },
  button: { backgroundColor: colors.xp, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.sm },
  buttonText: { color: colors.bg, fontFamily: fonts.bodyBold, fontSize: 16 },
  link: { color: colors.arcane2, textAlign: "center", marginTop: spacing.md, fontFamily: fonts.body },
  error: { color: colors.danger, fontFamily: fonts.body },
});
