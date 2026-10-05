// Seeds VERIFIED DEMO advocates for staging only — never run automatically, and never run
// against production (see the guard below). Without at least one verified, available
// advocate per practice area, every advocate-facing flow (Get matched, Talk now, Urgent
// help, Request review, Ask & learn's "ask an advocate") dead-ends with zero matches, which
// is indistinguishable from a broken matching pipeline during QA/demos.
//
// Idempotent: skips an advocate if a `users` row with that email already exists.
//   npm run seed:demo-advocates
import "../config/env.js";
import { getSupabase } from "../config/db.js";

const DEMO_ADVOCATES = [
  { name: "Rohan Iyer", email: "rohan.iyer@demo.vidhira.in", city: "Bengaluru", areas: ["Criminal defence", "Litigation & notices"], years: 9, urgent: true },
  { name: "Ayesha Khan", email: "ayesha.khan@demo.vidhira.in", city: "Mumbai", areas: ["Family", "Litigation & notices"], years: 12, urgent: true },
  { name: "Vikram Nair", email: "vikram.nair@demo.vidhira.in", city: "Bengaluru", areas: ["Property & tenancy", "Contract & commercial recovery"], years: 7, urgent: false },
  { name: "Priya Deshmukh", email: "priya.deshmukh@demo.vidhira.in", city: "Pune", areas: ["Employment", "General advisory"], years: 6, urgent: false },
  { name: "Arjun Mehta", email: "arjun.mehta@demo.vidhira.in", city: "Delhi", areas: ["Motor accident & insurance", "Consumer"], years: 10, urgent: true },
  { name: "Fatima Sheikh", email: "fatima.sheikh@demo.vidhira.in", city: "Hyderabad", areas: ["Cyber & online fraud", "Consumer"], years: 5, urgent: true },
  { name: "Karthik Subramanian", email: "karthik.s@demo.vidhira.in", city: "Chennai", areas: ["Immigration", "General advisory"], years: 8, urgent: false },
  { name: "Neha Agarwal", email: "neha.agarwal@demo.vidhira.in", city: "Delhi", areas: ["Contract & commercial recovery", "Tax & banking"], years: 11, urgent: false },
  { name: "Sanjay Rao", email: "sanjay.rao@demo.vidhira.in", city: "Bengaluru", areas: ["Trademark & IP", "Contract & commercial recovery"], years: 14, urgent: false },
  { name: "Meera Pillai", email: "meera.pillai@demo.vidhira.in", city: "Kochi", areas: ["Family", "General advisory"], years: 4, urgent: true },
];

async function seedOne(supabase, areaByName, def) {
  const { data: existingUser, error: findError } = await supabase.from("users").select("id").eq("email", def.email).maybeSingle();
  if (findError) throw findError;
  if (existingUser) {
    console.log(`Already seeded, skipping: ${def.name} (${def.email})`);
    return;
  }

  // auth_id is nullable — a demo advocate needs no real Supabase Auth identity, since
  // these exist only to be matched against and listed, never to sign in as.
  const { data: user, error: userError } = await supabase
    .from("users")
    .insert({ full_name: def.name, email: def.email, role: "advocate", kyc_status: "verified", city: def.city })
    .select()
    .single();
  if (userError) throw userError;

  const { data: advocate, error: advError } = await supabase
    .from("advocates")
    .insert({
      user_id: user.id,
      bar_council: `${def.city} Bar Council`,
      enrolment_number: `DEMO/${new Date().getFullYear() - def.years}/${Math.floor(1000 + Math.random() * 9000)}`,
      enrolment_year: new Date().getFullYear() - def.years,
      verification_status: "verified",
      years_of_practice: def.years,
      instant_fee: 1500 + def.years * 100,
      scheduled_fee: 2500 + def.years * 150,
      availability_state: "available",
      accepts_urgent: def.urgent,
      city: def.city,
      keywords: def.areas.map((a) => a.toLowerCase()),
    })
    .select()
    .single();
  if (advError) throw advError;

  const practiceAreaIds = def.areas.map((a) => areaByName[a]).filter(Boolean);
  const { error: paError } = await supabase.from("advocate_practice_areas").insert(practiceAreaIds.map((practice_area_id) => ({ advocate_id: advocate.id, practice_area_id })));
  if (paError) throw paError;

  // English + Hindi on every demo advocate so a "Talk now"/"Urgent help" request in either
  // language always has someone to match against; no jurisdictions row means this advocate
  // hasn't restricted their practice by state (passes the matcher's state filter for any city).
  const { error: langError } = await supabase.from("advocate_languages").insert([
    { advocate_id: advocate.id, language: "en" },
    { advocate_id: advocate.id, language: "hi" },
  ]);
  if (langError) throw langError;

  const { error: modeError } = await supabase.from("advocate_consultation_modes").insert(
    ["video", "phone", "chat"].map((mode) => ({ advocate_id: advocate.id, mode }))
  );
  if (modeError) throw modeError;

  console.log(`Seeded: ${def.name} — ${def.areas.join(", ")} (${def.city})`);
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo advocates against NODE_ENV=production. This script is for staging/demo environments only.");
  }
  const supabase = getSupabase();
  const { data: areas, error } = await supabase.from("practice_areas").select("id, name");
  if (error) throw error;
  if (!areas?.length) throw new Error("No practice areas found — run `npm run seed` first.");
  const areaByName = Object.fromEntries(areas.map((a) => [a.name, a.id]));

  for (const def of DEMO_ADVOCATES) await seedOne(supabase, areaByName, def);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
