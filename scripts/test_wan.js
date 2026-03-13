require("dotenv").config({ path: ".env.local" });

const apiKey = process.env.WAN_API_KEY;

async function testSiliconFlow() {
    console.log("Testing SiliconFlow...");
    const res = await fetch("https://api.siliconflow.cn/v1/video/submit", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + apiKey,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "Pro/alibaba/Wan2.1-I2V-14B-720P",
            prompt: "test",
            image: "https://hypereal.tech/demo-girl.webp"
        })
    });
    console.log("SiliconFlow:", res.status, await res.text());
}

async function testNovita() {
    console.log("Testing Novita...");
    const res = await fetch("https://api.novita.ai/v3/async/wan-t2v", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + apiKey,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model_name: "wan-t2v",
            prompt: "test"
        })
    });
    console.log("Novita:", res.status, await res.text());
}

async function testAIML() {
    console.log("Testing AIMLAPI...");
    const res = await fetch("https://api.aimlapi.com/v2/video/generations", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + apiKey,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "wan-v2.1",
            prompt: "test"
        })
    });
    console.log("AIMLAPI:", res.status, await res.text());
}

async function testRunComfy() {
    console.log("Testing RunComfy...");
    // just test basic auth or text
    const res = await fetch("https://model-api.runcomfy.net/v1/models/wan-ai/wan-2-6/video-to-video", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + apiKey,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            prompt: "test"
        })
    });
    console.log("RunComfy:", res.status, await res.text());
}

async function run() {
    await testSiliconFlow();
    await testNovita();
    await testAIML();
    await testRunComfy();
}

run();
