require("dotenv").config({ path: ".env.local" });

const apiKey = process.env.KIE_AI_API_KEY;

async function testKie() {
    console.log("Triggering a dummy video generation to see the exact structure from Kie.ai...");

    try {
        const res = await fetch("https://api.kie.ai/api/v1/runway/generate", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: "A beautiful cinematic shot of a forest",
                image_url: "https://hypereal.tech/demo-girl.webp",
                duration: 5,
                ratio: "16:9",
                quality: "1080p"
            })
        });
        console.log("Status:", res.status);
        const data = await res.json();
        console.log("Raw Response Data:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}

testKie();
