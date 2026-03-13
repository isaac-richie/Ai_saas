require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function main() {
    console.log("Adding Hypereal to providers...");
    const { data, error } = await supabase
        .from("providers")
        .upsert({
            name: "Hypereal",
            slug: "hypereal",
            base_url: "https://api.hypereal.tech/v1",
            is_active: true
        }, { onConflict: "slug" })
        .select();

    if (error) {
        console.error("Error inserting Hypereal:", error);
        process.exit(1);
    } else {
        console.log("Successfully added Hypereal:", data);
        process.exit(0);
    }
}

main();
