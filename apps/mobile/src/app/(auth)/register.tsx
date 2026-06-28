import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import { colors, spacing, radii, fonts } from "../../theme";

export default function Register() {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register(username.trim(), email.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not register.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>Create your hero</Text>
      <TextInput style={styles.input} placeholder="Username" placeholderTextColor={colors.muted} autoCapitalize="none" value={username} onChangeText={setUsername} />
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password" placeholderTextColor={colors.muted} secureTextEntry value={password} onChangeText={setPassword} />
      <TextInput style={styles.input} placeholder="Confirm password" placeholderTextColor={colors.muted} secureTextEntry value={confirm} onChangeText={setConfirm} />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={onSubmit} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? "Creating…" : "Create account"}</Text>
      </Pressable>
      <Link href="/(auth)/login" style={styles.link}>
        Already have an account? Sign in
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: "center", gap: spacing.md },
  brand: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, textAlign: "center", marginBottom: spacing.lg },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, color: colors.ink, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontFamily: fonts.body },
  button: { backgroundColor: colors.xp, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.sm },
  buttonText: { color: colors.bg, fontFamily: fonts.bodyBold, fontSize: 16 },
  link: { color: colors.arcane2, textAlign: "center", marginTop: spacing.md, fontFamily: fonts.body },
  error: { color: colors.danger, fontFamily: fonts.body },
});
