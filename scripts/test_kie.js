require("dotenv").config({ path: ".env.local" });

const apiKey = process.env.KIE_AI_API_KEY;

async function testKie() {
    console.log("Testing Kie.ai Video API...");

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
                quality: "high"
            })
        });
        console.log("Response Status:", res.status);
        const text = await res.text();
        console.log("Response Text:", text);
    } catch (e) {
        console.error(e);
    }
}

testKie();
