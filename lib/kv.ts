/**
 * Wrapper buat Upstash Redis (yang Vercel pasang sebagai integration).
 *
 * Vercel custom prefix bikin env vars-nya jadi STORAGE_KV_REST_API_URL etc,
 * bukan KV_REST_API_URL standar. Wrapper ini handle prefix apapun.
 *
 * Cara pakai: kvGet(key), kvSet(key, value). Mirip @vercel/kv.
 */

function getCreds(): { url: string; token: string } | null {
  // Coba semua nama env var yang mungkin (default + STORAGE_ prefix)
  const url =
    process.env.KV_REST_API_URL ||
    process.env.STORAGE_KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.STORAGE_KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;
  return { url, token };
}

async function fetchUpstash(
  command: (string | number)[],
): Promise<unknown> {
  const creds = getCreds();
  if (!creds) {
    throw new Error("Upstash credentials not set in env vars");
  }

  const res = await fetch(creds.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Upstash error: ${json.error}`);
  return json.result;
}

/**
 * Get value (auto-parse JSON jika object/array).
 */
export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const result = await fetchUpstash(["GET", key]);
  if (result === null || result === undefined) return null;
  if (typeof result === "string") {
    try {
      return JSON.parse(result) as T;
    } catch {
      return result as unknown as T;
    }
  }
  return result as T;
}

/**
 * Set value (auto-stringify JSON jika object/array).
 */
export async function kvSet(key: string, value: unknown): Promise<void> {
  const serialized =
    typeof value === "string" ? value : JSON.stringify(value);
  await fetchUpstash(["SET", key, serialized]);
}
