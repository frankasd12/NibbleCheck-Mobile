// App.tsx
import { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Image,
  Modal,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";

import {
  classifyImageAsync,
  resolveTextAsync,
  checkBarcodeAsync,
} from "./src/api";
import { ClassifyItem, Verdict } from "./src/types";

type EntryMode = "image" | "barcode" | "text";
type ResultSource = "image" | "barcode" | "text" | null;

export default function App() {
  const [activeMode, setActiveMode] = useState<EntryMode>("image");
  const [isDark, setIsDark] = useState(false);

  const [imgUri, setImgUri] = useState<string | null>(null);
  const [textQuery, setTextQuery] = useState("");

  const [results, setResults] = useState<ClassifyItem[] | null>(null);
  const [resultSource, setResultSource] = useState<ResultSource>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scannerVisible, setScannerVisible] = useState(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const resetFeedback = () => {
    setError(null);
    setResults(null);
  };

  // ---------- IMAGE FLOW ----------

  const pickImage = async () => {
    resetFeedback();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      setError("Gallery permission is required to pick a photo.");
      return;
    }

    const sel = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (sel.canceled) return;
    setImgUri(sel.assets[0].uri);
  };

  const takePhoto = async () => {
    resetFeedback();
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      setError("Camera permission is required to take a photo.");
      return;
    }

    const cap = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (cap.canceled) return;
    setImgUri(cap.assets[0].uri);
  };

  const runImageCheck = async () => {
    if (!imgUri) return;
    setLoading(true);
    resetFeedback();

    try {
      const manipResult = await ImageManipulator.manipulateAsync(
        imgUri,
        [{ resize: { width: 600 } }],
        {
          compress: 0.5,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      const out = await classifyImageAsync(manipResult.uri);
      setResults(out);
      setResultSource("image");
    } catch (e: any) {
      console.error("Photo check error:", e);
      setError(
        e?.message || "We couldn’t check this photo. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------- TEXT FLOW ----------

  const runTextCheck = async () => {
    const trimmed = textQuery.trim();
    if (!trimmed) return;

    setLoading(true);
    resetFeedback();

    try {
      const out = await resolveTextAsync(trimmed);

      const items: ClassifyItem[] = out.hits.map((h: any) => ({
        label: h.token, // original token (for debugging if needed)
        name: h.name, // canonical food name
        final_status: h.status as Verdict,
        rationale: h.notes ?? undefined,
        sources: h.sources ?? [],
        det_conf:
          typeof h.db_score === "number" ? (h.db_score as number) : undefined,
      }));

      setResults(items);
      setResultSource("text");
    } catch (e: any) {
      console.error("Text check error:", e);
      setError(
        e?.message || "We couldn’t check that text. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------- BARCODE FLOW (expo-camera) ----------

  const requestAndOpenScanner = async () => {
    resetFeedback();

    if (cameraPermission?.granted) {
      setScannerVisible(true);
      return;
    }

    const perm = await requestCameraPermission?.();
    if (!perm || !perm.granted) {
      setError("Camera permission is required to scan barcodes.");
      return;
    }

    setScannerVisible(true);
  };

  const handleBarCodeScanned = async (scan: BarcodeScanningResult) => {
    // close first so we don't scan multiple times
    setScannerVisible(false);

    setLoading(true);
    resetFeedback();

    try {
      const barcode = scan.data;
      console.log("Scanned barcode:", barcode);
      
      const items = await checkBarcodeAsync(barcode);
      setResults(items);
      setResultSource("barcode");
    } catch (e: any) {
      console.error("Barcode check error:", e);
      
      // Display user-friendly error messages
      const errorMsg = e?.message || "We couldn't look up that barcode. Please try again.";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // ---------- RENDER ----------

  return (
    <View style={[styles.root, isDark && styles.rootDark]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header with theme toggle */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.appTitle, isDark && styles.appTitleDark]}>
              NibbleCheck
            </Text>
            <Text
              style={[styles.appSubtitle, isDark && styles.appSubtitleDark]}
            >
              Check if foods are safe before your dog takes a bite.
            </Text>
          </View>
          <ThemeToggle
            isDark={isDark}
            onToggle={() => setIsDark((prev) => !prev)}
          />
        </View>

        {/* Entry mode cards */}
        <View style={styles.entryColumn}>
          <EntryCard
            label="Scan / Upload Food Image"
            description="Use your camera or gallery to scan snacks and leftovers."
            icon="📷"
            active={activeMode === "image"}
            isDark={isDark}
            onPress={() => setActiveMode("image")}
          />
          <EntryCard
            label="Scan Barcode"
            description="Point at packaged food labels to scan UPC / EAN codes."
            icon="🧾"
            active={activeMode === "barcode"}
            isDark={isDark}
            onPress={() => setActiveMode("barcode")}
          />
          <EntryCard
            label="Type a Food or Ingredient Name"
            description='Search directly by food or ingredient, like “grapes” or “xylitol gum”.'
            icon="⌨️"
            active={activeMode === "text"}
            isDark={isDark}
            onPress={() => setActiveMode("text")}
          />
        </View>

        {/* Active panel */}
        {activeMode === "image" && (
          <ImagePanel
            imgUri={imgUri}
            loading={loading}
            onPick={pickImage}
            onSnap={takePhoto}
            onCheck={runImageCheck}
            isDark={isDark}
          />
        )}

        {activeMode === "barcode" && (
          <BarcodePanel
            loading={loading}
            onStartScan={requestAndOpenScanner}
            isDark={isDark}
          />
        )}

        {activeMode === "text" && (
          <TextPanel
            query={textQuery}
            onChangeQuery={setTextQuery}
            onSubmit={runTextCheck}
            loading={loading}
            isDark={isDark}
          />
        )}

        {/* Loading + error */}
        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={isDark ? "#E5E7EB" : undefined} />
            <Text
              style={[styles.loadingText, isDark && styles.loadingTextDark]}
            >
              Checking safety…
            </Text>
          </View>
        )}

        {!!error && (
          <Text style={[styles.errorText, isDark && styles.errorTextDark]}>
            {error}
          </Text>
        )}

        {/* Results */}
        {!!results?.length && (
          <View style={styles.resultsSection}>
            <Text
              style={[styles.resultsTitle, isDark && styles.resultsTitleDark]}
            >
              Results
            </Text>
            {resultSource && (
              <Text
                style={[
                  styles.resultsSubtitle,
                  isDark && styles.resultsSubtitleDark,
                ]}
              >
                Source:{" "}
                {resultSource === "image"
                  ? "image scan"
                  : resultSource === "text"
                  ? "text search"
                  : "barcode scan"}
              </Text>
            )}

            {results.map((item, idx) => (
              <ResultCard
                key={`${item.name ?? item.label}-${idx}`}
                item={item}
                isDark={isDark}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Barcode scanner modal */}
      <Modal visible={scannerVisible} animationType="slide" transparent>
        <View style={styles.scannerOverlay}>
          <View
            style={[styles.scannerCard, isDark && styles.scannerCardDark]}
          >
            <Text
              style={[styles.scannerTitle, isDark && styles.scannerTitleDark]}
            >
              Scan Barcode
            </Text>
            <Text
              style={[
                styles.scannerSubtitle,
                isDark && styles.scannerSubtitleDark,
              ]}
            >
              Align the barcode inside the frame. We’ll scan it automatically.
            </Text>

            <View
              style={[
                styles.scannerWindowOuter,
                isDark && styles.scannerWindowOuterDark,
              ]}
            >
              <View style={styles.scannerWindowInner}>
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  onBarcodeScanned={handleBarCodeScanned}
                />
              </View>
            </View>

            <Pressable
              style={styles.scannerCancelButton}
              onPress={() => setScannerVisible(false)}
            >
              <Text
                style={[
                  styles.scannerCancelText,
                  isDark && styles.scannerCancelTextDark,
                ]}
              >
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ---------- Small Components ---------- */

function ThemeToggle({
  isDark,
  onToggle,
}: {
  isDark: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable style={styles.themeToggle} onPress={onToggle}>
      <View
        style={[
          styles.themeToggleSegment,
          !isDark && styles.themeToggleSegmentActive,
        ]}
      >
        <Text
          style={[
            styles.themeToggleIcon,
            !isDark && styles.themeToggleIconActive,
          ]}
        >
          ☀️
        </Text>
      </View>
      <View
        style={[
          styles.themeToggleSegment,
          isDark && styles.themeToggleSegmentActive,
        ]}
      >
        <Text
          style={[
            styles.themeToggleIcon,
            isDark && styles.themeToggleIconActive,
          ]}
        >
          🌙
        </Text>
      </View>
    </Pressable>
  );
}

function EntryCard(props: {
  label: string;
  description: string;
  icon: string;
  active?: boolean;
  isDark: boolean;
  onPress: () => void;
}) {
  const { label, description, icon, active, isDark, onPress } = props;
  return (
    <Pressable
      style={[
        styles.entryCard,
        active && styles.entryCardActive,
        isDark && styles.entryCardDark,
        isDark && active && styles.entryCardActiveDark,
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.entryIconBubble,
          isDark && styles.entryIconBubbleDark,
        ]}
      >
        <Text style={styles.entryIcon}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.entryLabel, isDark && styles.entryLabelDark]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.entryDescription,
            isDark && styles.entryDescriptionDark,
          ]}
        >
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

function ImagePanel(props: {
  imgUri: string | null;
  loading: boolean;
  onPick: () => void;
  onSnap: () => void;
  onCheck: () => void;
  isDark: boolean;
}) {
  const { imgUri, loading, onPick, onSnap, onCheck, isDark } = props;

  return (
    <View style={[styles.panel, isDark && styles.panelDark]}>
      <Text
        style={[styles.panelTitle, isDark && styles.panelTitleDark]}
      >
        Scan or Upload a Food Image
      </Text>
      <Text
        style={[styles.panelSubtitle, isDark && styles.panelSubtitleDark]}
      >
        Take a picture of your dog’s snack or upload from your gallery.
      </Text>

      <View style={styles.panelButtonRow}>
        <Pressable
          style={[styles.secondaryButton, isDark && styles.secondaryButtonDark]}
          onPress={onPick}
        >
          <Text
            style={[
              styles.secondaryButtonText,
              isDark && styles.secondaryButtonTextDark,
            ]}
          >
            Upload from Gallery
          </Text>
        </Pressable>
        <Pressable
          style={[styles.secondaryButton, isDark && styles.secondaryButtonDark]}
          onPress={onSnap}
        >
          <Text
            style={[
              styles.secondaryButtonText,
              isDark && styles.secondaryButtonTextDark,
            ]}
          >
            Take a Photo
          </Text>
        </Pressable>
      </View>

      {imgUri && (
        <View
          style={[
            styles.imagePreviewContainer,
            isDark && styles.imagePreviewContainerDark,
          ]}
        >
          <Image source={{ uri: imgUri }} style={styles.imagePreview} />
        </View>
      )}

      <Pressable
        style={[
          styles.primaryButton,
          (!imgUri || loading) && styles.primaryButtonDisabled,
        ]}
        disabled={!imgUri || loading}
        onPress={onCheck}
      >
        <Text style={styles.primaryButtonText}>
          {loading ? "Checking…" : "Check Photo Safety"}
        </Text>
      </Pressable>
    </View>
  );
}

function BarcodePanel(props: {
  loading: boolean;
  onStartScan: () => void;
  isDark: boolean;
}) {
  const { loading, onStartScan, isDark } = props;
  return (
    <View style={[styles.panel, isDark && styles.panelDark]}>
      <Text
        style={[styles.panelTitle, isDark && styles.panelTitleDark]}
      >
        Scan a Package Barcode
      </Text>
      <Text
        style={[styles.panelSubtitle, isDark && styles.panelSubtitleDark]}
      >
        We’ll look up the product, read its ingredients, and check each one
        against our database.
      </Text>

      <Pressable
        style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
        disabled={loading}
        onPress={onStartScan}
      >
        <Text style={styles.primaryButtonText}>
          {loading ? "Opening scanner…" : "Start Barcode Scan"}
        </Text>
      </Pressable>
    </View>
  );
}

function TextPanel(props: {
  query: string;
  onChangeQuery: (s: string) => void;
  onSubmit: () => void;
  loading: boolean;
  isDark: boolean;
}) {
  const { query, onChangeQuery, onSubmit, loading, isDark } = props;

  return (
    <View style={[styles.panel, isDark && styles.panelDark]}>
      <Text
        style={[styles.panelTitle, isDark && styles.panelTitleDark]}
      >
        Type a Food or Ingredient Name
      </Text>
      <Text
        style={[styles.panelSubtitle, isDark && styles.panelSubtitleDark]}
      >
        Example: “grapes”, “xylitol”, “peanut butter with xylitol”.
      </Text>

      <TextInput
        style={[styles.textInput, isDark && styles.textInputDark]}
        value={query}
        onChangeText={onChangeQuery}
        placeholder="Type a food name…"
        placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable
        style={[
          styles.primaryButton,
          (!query.trim() || loading) && styles.primaryButtonDisabled,
        ]}
        disabled={!query.trim() || loading}
        onPress={onSubmit}
      >
        <Text style={styles.primaryButtonText}>
          {loading ? "Checking…" : "Check Safety"}
        </Text>
      </Pressable>
    </View>
  );
}

function ResultCard({ item, isDark }: { item: ClassifyItem; isDark: boolean }) {
  const canonicalName = item.name || item.label || "Unknown item";

  // Prefer explicit notes, or fall back to rationale
  const notes: string | undefined =
    (item as any).notes ?? item.rationale ?? undefined;

  const sources = item.sources ?? [];
  const hasSources = Array.isArray(sources) && sources.length > 0;

  return (
    <View style={[styles.resultCard, isDark && styles.resultCardDark]}>
      <View style={styles.resultHeaderRow}>
        <Text
          style={[styles.resultTitle, isDark && styles.resultTitleDark]}
        >
          {canonicalName}
        </Text>
        <StatusBadge status={item.final_status} />
      </View>

      {typeof item.det_conf === "number" && (
        <Text style={[styles.resultMeta, isDark && styles.resultMetaDark]}>
          Match confidence: {(item.det_conf * 100).toFixed(0)}%
        </Text>
      )}

      {notes && (
        <Text style={[styles.resultNotes, isDark && styles.resultNotesDark]}>
          {notes}
        </Text>
      )}

      {hasSources && (
        <View style={styles.sourcesContainer}>
          <Text
            style={[
              styles.sourcesLabel,
              isDark && styles.sourcesLabelDark,
            ]}
          >
            Sources
          </Text>
          {sources.map((s, idx) => (
            <Text
              key={idx}
              style={[styles.sourceItem, isDark && styles.sourceItemDark]}
            >
              • {s}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function StatusBadge({ status }: { status: Verdict }) {
  const bg =
    status === "SAFE" ? "#22C55E" : status === "CAUTION" ? "#EAB308" : "#EF4444";

  const label =
    status === "SAFE" ? "SAFE" : status === "CAUTION" ? "CAUTION" : "UNSAFE";

  return (
    <View style={[styles.statusBadge, { backgroundColor: bg }]}>
      <Text style={styles.statusBadgeText}>{label}</Text>
    </View>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  rootDark: {
    backgroundColor: "#020617",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  appTitle: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  appTitleDark: {
    color: "#F9FAFB",
  },
  appSubtitle: {
    color: "#6B7280",
    fontSize: 14,
    marginTop: 6,
    marginBottom: 16,
  },
  appSubtitleDark: {
    color: "#9CA3AF",
  },

  entryColumn: {
    gap: 10,
    marginBottom: 24,
  },
  entryCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  entryCardActive: {
    borderColor: "#2563EB",
    shadowOpacity: 0.09,
    elevation: 3,
  },
  entryCardDark: {
    backgroundColor: "#020617",
    borderColor: "#1F2937",
    shadowOpacity: 0.4,
  },
  entryCardActiveDark: {
    borderColor: "#3B82F6",
  },
  entryIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  entryIconBubbleDark: {
    backgroundColor: "#1E293B",
  },
  entryIcon: {
    fontSize: 22,
  },
  entryLabel: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 15,
    marginBottom: 2,
  },
  entryLabelDark: {
    color: "#E5E7EB",
  },
  entryDescription: {
    color: "#6B7280",
    fontSize: 12,
  },
  entryDescriptionDark: {
    color: "#9CA3AF",
  },

  panel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    marginBottom: 18,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  panelDark: {
    backgroundColor: "#020617",
    borderColor: "#1F2937",
  },
  panelTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  panelTitleDark: {
    color: "#F9FAFB",
  },
  panelSubtitle: {
    color: "#6B7280",
    fontSize: 13,
    marginBottom: 12,
  },
  panelSubtitleDark: {
    color: "#9CA3AF",
  },
  panelButtonRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },

  primaryButton: {
    marginTop: 8,
    backgroundColor: "#2563EB",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },

  secondaryButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  secondaryButtonDark: {
    backgroundColor: "#0F172A",
    borderColor: "#1F2937",
  },
  secondaryButtonText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 13,
  },
  secondaryButtonTextDark: {
    color: "#E5E7EB",
  },

  imagePreviewContainer: {
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  imagePreviewContainerDark: {
    borderColor: "#1F2937",
  },
  imagePreview: {
    width: "100%",
    height: 220,
  },

  textInput: {
    marginTop: 8,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111827",
    fontSize: 14,
  },
  textInputDark: {
    backgroundColor: "#020617",
    borderColor: "#1F2937",
    color: "#F9FAFB",
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  loadingText: {
    color: "#6B7280",
    fontSize: 13,
  },
  loadingTextDark: {
    color: "#9CA3AF",
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 13,
    marginTop: 10,
  },
  errorTextDark: {
    color: "#FCA5A5",
  },

  resultsSection: {
    marginTop: 18,
  },
  resultsTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
  },
  resultsTitleDark: {
    color: "#F9FAFB",
  },
  resultsSubtitle: {
    color: "#6B7280",
    fontSize: 13,
    marginTop: 2,
    marginBottom: 10,
  },
  resultsSubtitleDark: {
    color: "#9CA3AF",
  },

  resultCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  resultCardDark: {
    backgroundColor: "#020617",
    borderColor: "#1F2937",
  },
  resultHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  resultTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "700",
    flexShrink: 1,
  },
  resultTitleDark: {
    color: "#F9FAFB",
  },
  resultMeta: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 6,
  },
  resultMetaDark: {
    color: "#9CA3AF",
  },
  resultNotes: {
    color: "#111827",
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  resultNotesDark: {
    color: "#E5E7EB",
  },
  sourcesContainer: {
    marginTop: 10,
  },
  sourcesLabel: {
    color: "#6B7280",
    fontSize: 12,
    marginBottom: 4,
    fontWeight: "600",
  },
  sourcesLabelDark: {
    color: "#9CA3AF",
  },
  sourceItem: {
    color: "#6B7280",
    fontSize: 12,
    marginBottom: 2,
  },
  sourceItemDark: {
    color: "#9CA3AF",
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },

  /* Theme toggle */
  themeToggle: {
    flexDirection: "row",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    marginLeft: 12,
    backgroundColor: "#F3F4F6",
  },
  themeToggleSegment: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  themeToggleSegmentActive: {
    backgroundColor: "#2563EB",
  },
  themeToggleIcon: {
    fontSize: 16,
    color: "#4B5563",
  },
  themeToggleIconActive: {
    color: "#FFFFFF",
  },

  /* Scanner modal */
  scannerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  scannerCard: {
    width: "100%",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  scannerCardDark: {
    backgroundColor: "#020617",
    borderColor: "#1F2937",
  },
  scannerTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  scannerTitleDark: {
    color: "#F9FAFB",
  },
  scannerSubtitle: {
    color: "#6B7280",
    fontSize: 13,
    marginBottom: 12,
  },
  scannerSubtitleDark: {
    color: "#9CA3AF",
  },
  scannerWindowOuter: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#2563EB",
    backgroundColor: "#000000",
  },
  scannerWindowOuterDark: {
    borderColor: "#3B82F6",
  },
  scannerWindowInner: {
    width: "100%",
    aspectRatio: 1,
    overflow: "hidden",
  },
  scannerCancelButton: {
    marginTop: 12,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  scannerCancelText: {
    color: "#4B5563",
    fontSize: 14,
    fontWeight: "600",
  },
  scannerCancelTextDark: {
    color: "#E5E7EB",
  },
});
