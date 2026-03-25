import { NextRequest } from "next/server";

const ALLOWED_HOSTS = new Set([
    "tempfile.aiquickdraw.com",
    "oaidalleapiprodscus.blob.core.windows.net",
]);

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get("url");
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

    const range = request.headers.get("range") ?? undefined;
    let upstream: Response;
    try {
        upstream = await fetch(target.toString(), {
            headers: range ? { Range: range } : undefined,
            redirect: "follow",
            signal: AbortSignal.timeout(60000),
        });
    } catch {
        return new Response("Upstream fetch timeout", { status: 504 });
    }

    if (!upstream.ok || !upstream.body) {
        return new Response("Upstream error", { status: upstream.status });
    }

    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    const acceptRanges = upstream.headers.get("accept-ranges");

    if (contentType) headers.set("Content-Type", contentType);
    if (contentLength) headers.set("Content-Length", contentLength);
    if (contentRange) headers.set("Content-Range", contentRange);
    if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);
    headers.set("Content-Disposition", "inline");
    headers.set("Cache-Control", "public, max-age=3600");

    return new Response(upstream.body, {
        status: upstream.status,
        headers,
    });
}
