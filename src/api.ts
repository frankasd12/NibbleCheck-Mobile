import { API_BASE } from "./config";
import { ClassifyItem } from "./types";

export async function classifyImageAsync(uri: string): Promise<ClassifyItem[]> {
  try {
    console.log('Attempting to upload to:', `${API_BASE}/classify/resolve`);
    
    const form = new FormData();
    form.append("file", {
      uri,
      type: "image/jpeg",
      name: "photo.jpg"
    } as any);

    const response = await fetch(`${API_BASE}/classify/resolve`, {
      method: "POST",
      body: form,
      headers: {
        "Accept": "application/json",
        "Content-Type": "multipart/form-data",
      },
      timeout: 60000, // Increase timeout to 60 seconds
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Server error:', errorText);
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Response data:', data);
    return data;
  } catch (err) {
    console.error('Network error:', err);
    if (err.name === 'AbortError' || err.message.includes('timeout')) {
      throw new Error('Request timed out - please try again');
    }
    throw new Error(`Network error: ${err.message}`);
  }
}

export async function resolveTextAsync(text: string) {
  const res = await fetch(`${API_BASE}/ingredients/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingredients_text: text }),
  });
  if (!res.ok) throw new Error(`Resolve failed: ${res.status}`);
  return res.json();
}
