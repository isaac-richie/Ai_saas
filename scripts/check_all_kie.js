require("dotenv").config({ path: ".env.local" });

const apiKey = process.env.KIE_AI_API_KEY;

async function fetchKieTasks() {
    console.log("Fetching account task history from Kie.ai...");

    // Try several potential endpoints for listing tasks
    const endpoints = [
        "https://api.kie.ai/api/v1/runway/tasks",
        "https://api.kie.ai/v1/tasks",
        "https://api.kie.ai/api/v1/tasks"
    ];

    for (const url of endpoints) {
        try {
            console.log(`\nTrying ${url}...`);
            const res = await fetch(url + "?limit=5", {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                }
            });
            console.log("Status:", res.status);
            const text = await res.text();
            if (res.status === 200) {
                console.log("Success! Data:", text);
                return;
            } else {
                console.log("Failed (Text truncated):", text.slice(0, 100));
            }
        } catch (e) {
            console.error(e.message);
        }
    }
}

fetchKieTasks();
