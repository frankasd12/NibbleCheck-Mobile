import { useState } from "react";
import { StyleSheet, View, Image, Text, Pressable, ActivityIndicator, ScrollView, TextInput } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { StatusBar } from "expo-status-bar";
import { classifyImageAsync, resolveTextAsync } from "./src/api";
import { ClassifyItem, Verdict } from "./src/types";



export default function App() {
  const [imgUri, setImgUri] = useState<string | null>(null);
  const [results, setResults] = useState<ClassifyItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");

  const pick = async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return setError("Gallery permission required.");
    const sel = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (sel.canceled) return;
    setImgUri(sel.assets[0].uri);
    setResults(null);
  };

  const snap = async () => {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") return setError("Camera permission required.");
    const cap = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (cap.canceled) return;
    setImgUri(cap.assets[0].uri);
    setResults(null);
  };

  const checkPhoto = async () => {
    if (!imgUri) return;
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      // Compress image more aggressively
      const manipResult = await ImageManipulator.manipulateAsync(
        imgUri,
        [{ resize: { width: 600 } }], // Reduce size further
        {
          compress: 0.5,
          format: ImageManipulator.SaveFormat.JPEG
        }
      );

      console.log('Image prepared, size:', manipResult.uri);
      const out = await classifyImageAsync(manipResult.uri);
      setResults(out);
    } catch (e: any) {
      console.error('Photo check error:', e);
      setError(e.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const checkText = async () => {
    if (!text.trim()) return;
    setLoading(true); setError(null); setResults(null);
    try {
      const out = await resolveTextAsync(text.trim());
      // /ingredients/resolve returns an array of blocks; flatten to items with overall_status
      const flat: ClassifyItem[] = (out ?? []).flatMap((b: any) =>
        (b?.hits ?? []).map((h: any) => ({
          label: h.label ?? h.name,
          name: h.name,
          final_status: b.overall_status as Verdict,
          rationale: h.rationale,
          sources: h.sources,
        }))
      );
      setResults(flat);
    } catch (e: any) {
      setError(e.message ?? "Resolve failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>NibbleCheck</Text>

      <View style={styles.row}>
        <Pressable style={styles.btn} onPress={pick}><Text style={styles.btnTxt}>Pick Photo</Text></Pressable>
        <Pressable style={styles.btn} onPress={snap}><Text style={styles.btnTxt}>Take Photo</Text></Pressable>
      </View>

      {imgUri && <Image source={{ uri: imgUri }} style={styles.preview} />}

      <Pressable style={[styles.btn, !imgUri && styles.btnDisabled]} onPress={checkPhoto} disabled={!imgUri || loading}>
        <Text style={styles.btnTxt}>{loading ? "Checking..." : "Check Photo"}</Text>
      </Pressable>

      <View style={styles.divider} />

      <Text style={styles.subtitle}>Or paste ingredients text</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="e.g., apple seeds, xylitol gum"
        placeholderTextColor="#94a3b8"
        style={styles.input}
      />
      <Pressable style={[styles.btn, !text.trim() && styles.btnDisabled]} onPress={checkText} disabled={!text.trim() || loading}>
        <Text style={styles.btnTxt}>{loading ? "Checking..." : "Check Text"}</Text>
      </Pressable>

      {loading && <ActivityIndicator style={{ marginTop: 8 }} />}

      {error && <Text style={styles.error}>{error}</Text>}

      {!!results?.length && (
        <ScrollView style={{ marginTop: 12, alignSelf: "stretch" }}>
          {results.map((r, i) => (
            <View key={i} style={styles.card}>
              <Text style={styles.item}>{r.label ?? r.name}</Text>
              <StatusBadge status={r.final_status} />
              {typeof r.det_conf === "number" && <Text style={styles.meta}>conf: {r.det_conf.toFixed(2)}</Text>}
              {r.rationale ? <Text style={styles.note}>{r.rationale}</Text> : null}
              {r.sources?.length ? <Text style={styles.src}>Sources: {r.sources.join(", ")}</Text> : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function StatusBadge({ status }: { status: Verdict }) {
  const bg = status === "SAFE" ? "#10b981" : status === "CAUTION" ? "#f59e0b" : "#ef4444";
  return <Text style={{ alignSelf: "flex-start", backgroundColor: bg, color: "white", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 4 }}>{status}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56, paddingHorizontal: 16, alignItems: "center", backgroundColor: "#0B0F14" },
  title: { color: "white", fontSize: 24, fontWeight: "700", marginBottom: 12 },
  subtitle: { color: "white", fontSize: 16, marginTop: 8, alignSelf: "flex-start" },
  row: { flexDirection: "row", gap: 12, marginBottom: 8 },
  btn: { backgroundColor: "#2563eb", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  btnDisabled: { opacity: 0.5 },
  btnTxt: { color: "white", fontWeight: "600" },
  preview: { width: "100%", height: 240, borderRadius: 12, marginVertical: 12 },
  input: { alignSelf: "stretch", backgroundColor: "#111827", color: "white", borderRadius: 10, padding: 12, marginTop: 6 },
  error: { color: "#fecaca", marginTop: 8, alignSelf: "flex-start" },
  card: { backgroundColor: "#111827", padding: 12, borderRadius: 12, marginBottom: 10 },
  item: { color: "white", fontSize: 16, fontWeight: "600" },
  meta: { color: "#9ca3af", marginTop: 4 },
  note: { color: "#cbd5e1", marginTop: 6 },
  src: { color: "#94a3b8", marginTop: 4 },
  divider: { height: 1, backgroundColor: "#1f2937", alignSelf: "stretch", marginVertical: 12 },
});
