require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// MUST use service role to bypass RLS
const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function checkOptions() {
    console.log("Fetching shot_options with Anon mapping to bypass missing user...");

    // Find the user id we are using
    const { data: { users }, error: authError } = await supabase.auth.admin?.listUsers() || { data: { users: [] } };

    // We can't do listUsers with Anon. Let's just create a raw Postgres Query if possible, or use the app's api.

    // Just fetch it without user context (RLS might block it, but let's try since Anon key with RLS sometimes works if policies allow reading)
    const { data: options, error } = await supabase
        .from("shot_options")
        .select("id, status, output_url, parameters, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

    if (error) {
        console.error("DB Error:", error);
    } else {
        console.log("Latest options:");
        options.forEach(opt => {
            console.log(`- ID: ${opt.id}`);
            console.log(`  Task ID (param): ${opt.parameters?.task_id}`);
            console.log(`  Status: ${opt.status}`);
            console.log(`  Output URL: ${opt.output_url}`);
            console.log("-----------------------");
        });
    }
}

checkOptions();
