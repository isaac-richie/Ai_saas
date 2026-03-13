require("dotenv").config({ path: ".env.local" });

const apiKey = process.env.KIE_AI_API_KEY;
const taskId = "42fdfd0168387ad258993fc58b41c5d5"; // Latest task from logs

async function checkSpecificTask() {
    console.log(`Fetching record-detail for Task ID: ${taskId}...`);

    try {
        const res = await fetch(`https://api.kie.ai/api/v1/runway/record-detail?taskId=${taskId}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apiKey}`
            }
        });
        console.log("Status:", res.status);
        const text = await res.text();
        console.log("Raw Response Data:", text);
    } catch (e) {
        console.error(e.message);
    }
}

checkSpecificTask();
