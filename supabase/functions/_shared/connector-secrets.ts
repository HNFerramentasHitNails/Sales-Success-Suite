import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const SECRETS_KEY = Deno.env.get("CONNECTOR_SECRETS_KEY")!;

async function importKey(): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(SECRETS_KEY);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function decryptSecret(ciphertextB64: string, ivB64: string): Promise<string> {
  const key = await importKey();
  const iv = fromB64(ivB64);
  const ct = fromB64(ciphertextB64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plain);
}

/**
 * Loads and decrypts all secrets stored for a given connection.
 * MUST be called with a service-role Supabase client.
 */
export async function loadConnectionSecrets(
  admin: SupabaseClient,
  connectionId: string,
): Promise<Record<string, string>> {
  const { data, error } = await admin
    .from("connection_secrets")
    .select("key, ciphertext, iv")
    .eq("connection_id", connectionId);
  if (error) throw new Error(`Falha a ler segredos: ${error.message}`);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    try {
      out[(row as any).key] = await decryptSecret((row as any).ciphertext, (row as any).iv);
    } catch (e) {
      throw new Error(`Não foi possível decifrar a chave "${(row as any).key}": ${(e as Error).message}`);
    }
  }
  return out;
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}