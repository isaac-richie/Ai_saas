require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function checkLatestOptions() {
    console.log("Fetching latest shot_options to see if polling updated the DB...");

    const { data: options, error } = await supabase
        .from("shot_options")
        .select("id, status, output_url, parameters, created_at")
        .order("created_at", { ascending: false })
        .limit(3);

    if (error) {
        console.error("DB Error:", error);
    } else {
        console.log("Latest options:");
        options.forEach(opt => {
            console.log(`- ID: ${opt.id}`);
            console.log(`  Task ID (param): ${opt.parameters?.task_id}`);
            console.log(`  Status: ${opt.status}`);
            console.log(`  Output URL: ${opt.output_url}`);
            console.log(`  Created At: ${opt.created_at}`);
            console.log("-----------------------");
        });
    }
}

checkLatestOptions();
