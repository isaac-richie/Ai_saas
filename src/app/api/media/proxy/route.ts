import { NextRequest } from "next/server";
import { sanitizeFilename } from "@/lib/download-filename";

function supabaseHost(): string | null {
    try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        return url ? new URL(url).hostname : null;
    } catch {
        return null;
    }
}

const ALLOWED_HOSTS = new Set(
    [
        "tempfile.aiquickdraw.com",
        "oaidalleapiprodscus.blob.core.windows.net",
        supabaseHost(),
    ].filter((host): host is string => Boolean(host))
);

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get("url");
    const requestedFilename = request.nextUrl.searchParams.get("filename");
    if (!url) {
        return new Response("Missing url", { status: 400 });
    }

    let target: URL;
    try {
        target = new URL(url);
    } catch {
        return new Response("Invalid url", { status: 400 });
    }

    if (!ALLOWED_HOSTS.has(target.hostname)) {
        return new Response("Host not allowed", { status: 403 });
    }

    let upstream: Response;
    try {
        upstream = await fetch(target.toString(), {
            redirect: "follow",
            signal: AbortSignal.timeout(60000),
        });
    } catch {
        return new Response("Upstream fetch timeout", { status: 504 });
    }

    if (!upstream.ok || !upstream.body) {
        return new Response("Upstream error", { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";

    const isVideo = contentType.startsWith("video/");
    const range = request.headers.get("range");

    if (isVideo) {
        const buffer = Buffer.from(await upstream.arrayBuffer());
        const total = buffer.byteLength;

        const headers = new Headers();
        headers.set("Content-Type", contentType);
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", "public, max-age=3600");

        if (requestedFilename) {
            const safeFilename = sanitizeFilename(requestedFilename) || "visiowave-download";
            headers.set("Content-Disposition", `attachment; filename="${safeFilename}"`);
        } else {
            headers.set("Content-Disposition", "inline");
        }

        if (range) {
            const match = range.match(/bytes=(\d+)-(\d*)/);
            if (match) {
                const start = parseInt(match[1], 10);
                const end = match[2] ? parseInt(match[2], 10) : total - 1;
                const clampedEnd = Math.min(end, total - 1);

                if (start >= total || start > clampedEnd) {
                    headers.set("Content-Range", `bytes */${total}`);
                    return new Response(null, { status: 416, headers });
                }

                const slice = buffer.subarray(start, clampedEnd + 1);
                headers.set("Content-Range", `bytes ${start}-${clampedEnd}/${total}`);
                headers.set("Content-Length", String(slice.byteLength));
                return new Response(slice, { status: 206, headers });
            }
        }

        headers.set("Content-Length", String(total));
        return new Response(buffer, { status: 200, headers });
    }

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=3600");

    if (requestedFilename) {
        const safeFilename = sanitizeFilename(requestedFilename) || "visiowave-download";
        headers.set("Content-Disposition", `attachment; filename="${safeFilename}"`);
    } else {
        headers.set("Content-Disposition", "inline");
    }

    return new Response(upstream.body, { status: 200, headers });
}
