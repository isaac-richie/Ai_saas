"use server";

import { generateShot } from "./generation";

export async function batchGenerate(shotIds: string[]) {
    // In a real production system, this would push jobs to a queue (Bull/Redis/pg-boss).
    // For this MVP/Server Action limits, we will trigger them concurrently but await results.
    // To avoid timeout on large batches, we might just fire and forget or limit batch size.

    // Limit batch size to 5 for now to prevent timeouts/rate limits
    const BATCH_LIMIT = 5;
    const processIds = shotIds.slice(0, BATCH_LIMIT);

    const results = await Promise.allSettled(
        processIds.map(id => generateShot(id))
    );

    const successes = results.filter(r => r.status === 'fulfilled' && !r.value.error).length;
    const failures = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error)).length;

    return {
        success: true,
        processed: processIds.length,
        successCount: successes,
        failureCount: failures,
        message: `Processed ${processIds.length} shots. Success: ${successes}, Failures: ${failures}`
    };
}
