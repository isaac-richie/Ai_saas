import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    // Sign in anonymously like the app does
    const { data: { user }, error: authError } = await supabase.auth.signInAnonymously();
    if (authError || !user) {
        console.error("Failed to sign in:", authError);
        return;
    }

    // 1. Create Project
    const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
            user_id: user.id,
            name: "Cyberpunk Short Film",
            description: "Neon lit alleys, rainy streets, and high-tech corporate espionage."
        })
        .select()
        .single();

    if (projectError || !project) {
        console.error("Error creating project:", projectError);
        return;
    }

    // 2. Create Scene
    const { data: scene, error: sceneError } = await supabase
        .from("scenes")
        .insert({
            project_id: project.id,
            name: "Scene 1: Alleyway chase",
            description: "Protagonist runs through a crowded neon alley."
        })
        .select()
        .single();

    if (sceneError || !scene) {
        console.error("Error creating scene:", sceneError);
        return;
    }

    console.log(`\nCyberpunk Project seeded successfully!`);
    console.log(`Open this URL in your browser:`);
    console.log(`http://localhost:3000/dashboard/projects/${project.id}/scenes/${scene.id}\n`);
}

main();
