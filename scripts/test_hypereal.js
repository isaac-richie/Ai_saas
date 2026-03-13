require("dotenv").config({ path: ".env.local" });

async function testHypereal() {
    const apiKey = process.env.HYPEREAL_API_KEY;
    if (!apiKey) {
        console.error("No API key found in .env.local");
        process.exit(1);
    }

    const body = {
        model: "sora-2-i2v",
        input: {
            prompt: "Test prompt: Camera slowly pans",
            image: "https://hypereal.tech/demo-girl.webp",
            duration: 5
        }
    };

    console.log("Sending request to Hypereal...");
    const res = await fetch("https://api.hypereal.tech/v1/videos/generate", {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        console.log("Error status:", res.status, res.statusText);
        const errText = await res.text();
        console.log("Error text:", errText);
    } else {
        const data = await res.json();
        console.log("Success data:", data);
    }
}

testHypereal();
