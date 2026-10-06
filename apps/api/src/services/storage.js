// Private document storage on Supabase Storage (free tier: 1 GB). Files are never public;
// the API hands out short-lived signed URLs after an access check.
import { getSupabase } from "../config/db.js";

export const DOCUMENT_BUCKET = process.env.SUPABASE_DOCUMENT_BUCKET || "documents";
export const SIGNED_URL_TTL_SECONDS = 60;

export async function ensureDocumentBucket() {
  const storage = getSupabase().storage;
  const { data: buckets, error } = await storage.listBuckets();
  if (error) throw error;
  if (buckets.some((b) => b.name === DOCUMENT_BUCKET)) return;
  const { error: createError } = await storage.createBucket(DOCUMENT_BUCKET, { public: false, fileSizeLimit: 25 * 1024 * 1024 });
  if (createError && !/already exists/i.test(createError.message)) throw createError;
}

export async function putObject(key, buffer, contentType) {
  const { error } = await getSupabase().storage.from(DOCUMENT_BUCKET).upload(key, buffer, { contentType, upsert: false });
  if (error) throw error;
}

export async function getObject(key) {
  const { data, error } = await getSupabase().storage.from(DOCUMENT_BUCKET).download(key);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

export async function signedUrl(key, filename) {
  const { data, error } = await getSupabase().storage.from(DOCUMENT_BUCKET).createSignedUrl(key, SIGNED_URL_TTL_SECONDS, { download: filename });
  if (error) throw error;
  return data.signedUrl;
}

export async function removeObject(key) {
  const { error } = await getSupabase().storage.from(DOCUMENT_BUCKET).remove([key]);
  if (error) throw error;
}
