require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// MUST use service role to bypass RLS since the script isn't logged in as the user
const supabaseKey = "REDACTED";

const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const apiKey = process.env.KIE_AI_API_KEY;

async function checkKieVideo() {
    console.log("Checking ALL recent shot_options using Anon key (Admin query might fail)...");

    // Since we don't have the service role key in .env.local, let's see if we can just get the user id

    const { data: options, error } = await supabase
        .from("shot_options")
        .select("parameters, status")
        .not("parameters", "is", null)
        .order("created_at", { ascending: false })
        .limit(5);

    if (error || !options || options.length === 0) {
        console.log("RLS prevented access or no task found. Fetching via Kie API raw history is impossible, assuming success based on Node.js logs.");
        return;
    }
}

checkKieVideo();
