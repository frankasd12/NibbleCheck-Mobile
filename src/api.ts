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
const CV_TIMEOUT_MS = 120000;

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

    const res = await withAbortController(
      (signal) =>
        fetch(`${API_BASE}/classify/resolve`, {
          method: "POST",
          body: form,
          signal,
        }),
      CV_TIMEOUT_MS  
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
      throw new Error(
        `Barcode lookup failed (${res.status}): ${txt || res.statusText}`
      );
    }

    const json = await res.json();

    // graceful "not found" / "no ingredients" messages from the backend
    if (json.error === "barcode_not_found") {
      throw new Error(
        json.message ||
        "We couldn’t find this barcode in our database yet. It may be a non-food item or a product we haven’t indexed."
      );
    }
    if (json.error === "ingredients_missing") {
      throw new Error(
        json.message ||
        "We couldn’t find any ingredients for this product in our database."
      );
    }

    if (!json || typeof json !== "object" || !Array.isArray(json.hits)) {
      throw new Error("Unexpected response shape from /barcode/resolve");
    }

    const hits: ResolveHit[] = json.hits;

    // No ingredient matches at all
    if (hits.length === 0) {
      throw new Error(
        "We couldn’t match any ingredients for this product. It might not be a food item or its ingredients aren’t in our database yet."
      );
    }

    const displayName: string =
      typeof json.display_name === "string" && json.display_name.trim().length
        ? json.display_name.trim()
        : "Scanned product";

    const ingredientsText: string =
      typeof json.raw_ingredients === "string"
        ? json.raw_ingredients.trim()
        : "";

    // Decide overall status (prefer backend overall_status if present)
    let overallStatus: Verdict = "SAFE";
    if (typeof json.overall_status === "string") {
      const s = json.overall_status.toUpperCase();
      if (s === "SAFE" || s === "CAUTION" || s === "UNSAFE") {
        overallStatus = s as Verdict;
      }
    } else {
      if (hits.some((h) => h.status === "UNSAFE")) {
        overallStatus = "UNSAFE";
      } else if (hits.some((h) => h.status === "CAUTION")) {
        overallStatus = "CAUTION";
      }
    }

    // Overall product card
    const productRationaleParts: string[] = [
      `Overall rating based on ${hits.length} ingredient${hits.length === 1 ? "" : "s"
      } we recognized in this product.`,
    ];
    if (ingredientsText) {
      productRationaleParts.push(`Label ingredients: ${ingredientsText}`);
    }

    const overallItem: ClassifyItem = {
      label: barcode,
      name: displayName,
      final_status: overallStatus,
      rationale: productRationaleParts.join(" "),
      sources: [],
      isProduct: true,
    };

    // One card per ingredient hit
    const ingredientItems: ClassifyItem[] = hits.map((h) => ({
      label: h.token,
      name: h.name,
      final_status: h.status as Verdict,
      rationale: h.notes ?? undefined,
      sources: (h.sources ?? undefined) as string[] | undefined,
      det_conf:
        typeof h.db_score === "number" ? (h.db_score as number) : undefined,
    }));

    return [overallItem, ...ingredientItems];
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Request timed out - please try again");
    }
    throw new Error(err?.message ?? "Network error");
  }
}


/**
 * Resolve ingredient tokens with fuzzy matching support.
 */
export async function resolveTokensAsync(tokens: string[]): Promise<ResolveHit[]> {
  const hits: ResolveHit[] = [];
  if (!tokens || tokens.length === 0) {
    return hits;
  }

  try {
    console.log("Resolving ingredient tokens to:", `${API_BASE}/ingredients/resolve-tokens`);

    const res = await withAbortController((signal) =>
      fetch(`${API_BASE}/ingredients/resolve-tokens`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ tokens }),
        signal,
      })
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Token resolve failed (${res.status}): ${txt || res.statusText}`);
    }

    const json = await res.json();

    if (!json || typeof json !== "object" || !Array.isArray(json.hits)) {
      throw new Error("Unexpected response shape from /ingredients/resolve-tokens");
    }

    return json.hits;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Request timed out - please try again");
    }
    throw new Error(err?.message ?? "Network error");
  }
}
