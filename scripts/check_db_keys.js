require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
    console.log("Checking providers...");
    const { data: providers, error: provError } = await supabase.from("providers").select("*");
    if (provError) console.error("Provider Error:", provError);
    else console.log("Providers:", providers);

    console.log("Checking user_api_keys...");
    const { data: keys, error: keyError } = await supabase.from("user_api_keys").select("*");
    if (keyError) console.error("Keys Error:", keyError);
    else console.log("Keys:", keys);

    process.exit(0);
}

main();
