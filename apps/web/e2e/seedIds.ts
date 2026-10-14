// Shared shape for the IDs global-setup.ts creates and global-teardown.ts deletes. Written to
// e2e/.auth/seed.json between the two so teardown doesn't need to re-derive anything.
export interface SeedRow {
  table: string;
  // Most tables have a single `id` primary key; a few (e.g. thread_participants) have a
  // composite one, so this is a generic column->value match rather than always `id`.
  match: Record<string, string>;
}
export interface SeedIds {
  authUserIds: string[]; // Supabase Auth users (admin.deleteUser)
  rows: SeedRow[]; // deleted in this exact order (FK-safe, children first)
}
