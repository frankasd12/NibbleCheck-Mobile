import { API_BASE } from "./config";
import { ClassifyItem, Verdict } from "./types";

type ResolveHit = {
  token: string;
  food_id: number;
  name: string;
  status: Verdict;
  matched_from: string;
  db_score: number | null;
  notes?: string | null;
  sources?: string[] | null;
};

type ResolveResponse = {
  hits: ResolveHit[];
  overall_status: Verdict;
};

const DEFAULT_TIMEOUT_MS = 60000;

function withAbortController<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  return fn(controller.signal).finally(() => clearTimeout(timeout));
}

/**
 * Upload an image (uri) to the backend classify endpoint.
 * Returns an array of ClassifyItem mapped from backend candidates where possible.
 */
export async function classifyImageAsync(uri: string): Promise<ClassifyItem[]> {
  const form = new FormData();
  form.append("file", {
    uri,
    name: "photo.jpg",
    type: "image/jpeg",
  } as any);

  try {
    console.log("Uploading to:", `${API_BASE}/classify/resolve`);

    const res = await withAbortController((signal) =>
      fetch(`${API_BASE}/classify/resolve`, {
        method: "POST",
        body: form,
        signal,
      })
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Server responded ${res.status}: ${txt || res.statusText}`);
    }

    const json = await res.json().catch(() => null);

    if (Array.isArray(json)) {
      return json as ClassifyItem[];
    }

    if (json && Array.isArray(json.candidates)) {
      return json.candidates.map((c: any) => ({
        name: c.name ?? c.canonical_name ?? c.label,
        label: c.model_label ?? c.label ?? c.name,
        final_status: (c.status ?? c.default_status) as Verdict,
        rationale: c.rationale ?? c.reason ?? undefined,
        det_conf: (c.model_score ?? c.det_conf) as number | undefined,
        sources: c.sources ?? [],
      }));
    }

    return [];
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Request timed out - please try again");
    }
    throw new Error(err?.message ?? "Network error");
  }
}

/**
 * Resolve a text blob of ingredients into hits (backend /ingredients/resolve).
 * We keep the backend response type separate but forward it to the UI as needed.
 */
export async function resolveTextAsync(
  text: string
): Promise<ResolveResponse> {
  try {
    console.log("Resolving ingredients text to:", `${API_BASE}/ingredients/resolve`);

    const res = await withAbortController((signal) =>
      fetch(`${API_BASE}/ingredients/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ ingredients_text: text }),
        signal,
      })
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Resolve failed (${res.status}): ${txt || res.statusText}`);
    }

    const json = await res.json();

    if (!json || typeof json !== "object" || !Array.isArray(json.hits)) {
      throw new Error("Unexpected response shape from server");
    }

    return json as ResolveResponse;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Request timed out - please try again");
    }
    throw new Error(err?.message ?? "Network error");
  }
}

/**
 * Barcode lookup: call backend /barcode/resolve and map hits to ClassifyItem[].
 * Handles both found and not-found barcodes gracefully.
 */
export async function checkBarcodeAsync(barcode: string): Promise<ClassifyItem[]> {
  try {
    console.log("Looking up barcode at:", `${API_BASE}/barcode/resolve`);

    const res = await withAbortController((signal) =>
      fetch(`${API_BASE}/barcode/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ barcode }),
        signal,
      })
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Barcode lookup failed (${res.status}): ${txt || res.statusText}`);
    }

    const json = await res.json();

    // Check if this is a "barcode not found" response
    if (json.error === "barcode_not_found") {
      throw new Error(
        json.message || 
        "This barcode is not in our database. It may be a non-food item or a product we haven't indexed yet."
      );
    }

    if (!json || typeof json !== "object" || !Array.isArray(json.hits)) {
      throw new Error("Unexpected response shape from /barcode/resolve");
    }

    // If no hits were found, throw a user-friendly error
    if (json.hits.length === 0) {
      throw new Error(
        "We couldn't identify any ingredients for this product. It may not be a food item or the ingredients are not in our database."
      );
    }

    const hits: ResolveHit[] = json.hits;

    const items: ClassifyItem[] = hits.map((h) => ({
      label: h.token,
      name: h.name,
      final_status: h.status,
      rationale: h.notes ?? undefined,
      sources: h.sources ?? [],
      det_conf:
        typeof h.db_score === "number" ? (h.db_score as number) : undefined,
    }));

    return items;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Request timed out - please try again");
    }
    throw new Error(err?.message ?? "Network error");
  }
}
