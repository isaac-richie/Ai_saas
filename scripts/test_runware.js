require("dotenv").config({ path: ".env.local" });

const apiKey = process.env.RUNWARE_API_KEY;

async function testRunware() {
    console.log("Testing Runware API...");

    // Try generating a video with KlingAI using an image prompt
    const reqBody = [
        {
            taskType: "videoInference",
            taskUUID: "test-runware-video-job",
            model: "runware:kling@5.0", // or "kling" based on docs
            positivePrompt: "test animation",
            // If image is required for I2V, passing a dummy one
            referenceImages: ["https://hypereal.tech/demo-girl.webp"],
        }
    ];

    try {
        const res = await fetch("https://api.runware.ai/v1", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(reqBody)
        });
        console.log("Response Status:", res.status);
        const text = await res.text();
        console.log("Response Text:", text);
    } catch (e) {
        console.error(e);
    }
}

testRunware();
