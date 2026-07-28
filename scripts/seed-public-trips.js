const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

function readEnvFile() {
  const env = {};
  const raw = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex);
    const value = trimmed.slice(equalsIndex + 1).replace(/^["']|["']$/g, "");
    env[key] = value;
  }

  return env;
}

const env = { ...readEnvFile(), ...process.env };
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const seedOwners = [
  {
    email: "journi-public-amelia@example.com",
    fullName: "Amelia Hart",
    title: "Lisbon Rooftops Weekend",
    destination: "Lisbon, Portugal",
    description:
      "A relaxed long weekend built around hilltop viewpoints, tiled streets, seafood dinners, and golden-hour drinks. The plan is open, sociable, and easy to join for travellers who want a warm city break with a little culture and plenty of unhurried time together.",
    starts_at: "2026-08-14T09:00:00.000Z",
    ends_at: "2026-08-17T18:00:00.000Z",
    cover_image_url:
      "https://images.unsplash.com/photo-1501927023255-9063be98970c?auto=format&fit=crop&w=1200&q=80",
  },
  {
    email: "journi-public-marco@example.com",
    fullName: "Marco Silva",
    title: "Dolomites Adventure Week",
    destination: "Dolomites, Italy",
    description:
      "A public mountain escape for people who want fresh air, scenic hikes, cable-car viewpoints, and cosy alpine dinners. Expect shared planning, flexible activity choices, and a friendly group pace with space for both adventure days and slower recovery mornings.",
    starts_at: "2026-09-05T09:00:00.000Z",
    ends_at: "2026-09-12T18:00:00.000Z",
    cover_image_url:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
  },
  {
    email: "journi-public-sophie@example.com",
    fullName: "Sophie Reed",
    title: "Marrakech Wellness Escape",
    destination: "Marrakech, Morocco",
    description:
      "A wellness-leaning public trip with riad stays, hammam time, garden visits, gentle food tours, and optional day trips beyond the city. It is designed for travellers who want colour, calm, and a small-group atmosphere without over-planning every hour.",
    starts_at: "2026-10-02T09:00:00.000Z",
    ends_at: "2026-10-06T18:00:00.000Z",
    cover_image_url:
      "https://images.unsplash.com/photo-1597212720415-f8e6f5f2ed9c?auto=format&fit=crop&w=1200&q=80",
  },
];

async function findOrCreateUser(owner) {
  const { data: userList, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    throw new Error(`Unable to load users: ${listError.message}`);
  }

  const existingUser = userList.users.find(
    (user) => (user.email || "").toLowerCase() === owner.email.toLowerCase(),
  );

  if (existingUser) {
    return existingUser;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: owner.email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: {
      full_name: owner.fullName,
      role: "organiser",
      plan: "pro_organiser",
    },
  });

  if (error || !data.user) {
    throw new Error(`Unable to create ${owner.email}: ${error?.message || "No user returned."}`);
  }

  return data.user;
}

async function seedPublicTrips() {
  const seeded = [];
  const skipped = [];
  const updated = [];

  for (const owner of seedOwners) {
    const user = await findOrCreateUser(owner);

    const { data: existingTrip, error: existingError } = await supabase
      .from("trips")
      .select("id")
      .eq("owner_id", user.id)
      .eq("title", owner.title)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Unable to check ${owner.title}: ${existingError.message}`);
    }

    if (existingTrip) {
      const { error: updateError } = await supabase
        .from("trips")
        .update({ status: "active", visibility: "public" })
        .eq("id", existingTrip.id);

      if (updateError && !updateError.message.includes("visibility")) {
        throw new Error(`Unable to update ${owner.title}: ${updateError.message}`);
      }

      if (!updateError) {
        updated.push(owner.title);
        continue;
      }

      skipped.push(owner.title);
      continue;
    }

    const { error: insertError } = await supabase.from("trips").insert({
      owner_id: user.id,
      title: owner.title,
      destination: owner.destination,
      description: owner.description,
      status: "active",
      visibility: "public",
      starts_at: owner.starts_at,
      ends_at: owner.ends_at,
      cover_image_url: owner.cover_image_url,
    });

    if (insertError) {
      if (insertError.message.includes("visibility")) {
        const { error: fallbackInsertError } = await supabase.from("trips").insert({
          owner_id: user.id,
          title: owner.title,
          destination: owner.destination,
          description: owner.description,
          status: "active",
          starts_at: owner.starts_at,
          ends_at: owner.ends_at,
          cover_image_url: owner.cover_image_url,
        });

        if (fallbackInsertError) {
          throw new Error(`Unable to insert ${owner.title}: ${fallbackInsertError.message}`);
        }

        seeded.push(owner.title);
        continue;
      }

      throw new Error(`Unable to insert ${owner.title}: ${insertError.message}`);
    }

    seeded.push(owner.title);
  }

  console.log(`Seeded ${seeded.length} public trip${seeded.length === 1 ? "" : "s"}.`);
  if (seeded.length > 0) {
    console.log(`Added: ${seeded.join(", ")}`);
  }
  if (updated.length > 0) {
    console.log(`Updated: ${updated.join(", ")}`);
  }
  if (skipped.length > 0) {
    console.log(`Already existed: ${skipped.join(", ")}`);
    console.log("These existing test trips will still appear through the test fallback until the visibility migration is applied.");
  }
}

seedPublicTrips().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
