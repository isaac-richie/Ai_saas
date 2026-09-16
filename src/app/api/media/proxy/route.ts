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

    // Supabase Storage can set the attachment header itself. Redirecting durable
    // assets there avoids piping an entire video through a serverless function,
    // which can time out on mobile or slower connections.
    if (requestedFilename && target.hostname === supabaseHost() && target.pathname.includes("/storage/v1/object/public/")) {
        const safeFilename = sanitizeFilename(requestedFilename) || "visiowave-download";
        target.searchParams.set("download", safeFilename);
        return Response.redirect(target, 302);
    }

    // Kie's temporary delivery host already responds as an attachment. Sending
    // users there directly prevents large legacy clips from exhausting Vercel's
    // streaming request window.
    if (requestedFilename && target.hostname === "tempfile.aiquickdraw.com") {
        return Response.redirect(target, 302);
    }

    const range = request.headers.get("range");
    const upstreamHeaders = new Headers();
    if (range) upstreamHeaders.set("range", range);

    let upstream: Response;
    try {
        upstream = await fetch(target.toString(), {
            redirect: "follow",
            headers: upstreamHeaders,
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

    if (isVideo) {
        const headers = new Headers();
        headers.set("Content-Type", contentType);
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", "public, max-age=3600");
        copyHeader(upstream.headers, headers, "Content-Length");
        copyHeader(upstream.headers, headers, "Content-Range");

        if (requestedFilename) {
            const safeFilename = sanitizeFilename(requestedFilename) || "visiowave-download";
            headers.set("Content-Disposition", `attachment; filename="${safeFilename}"`);
        } else {
            headers.set("Content-Disposition", "inline");
        }

        return new Response(upstream.body, { status: upstream.status, headers });
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

function copyHeader(source: Headers, target: Headers, name: string) {
    const value = source.get(name);
    if (value) target.set(name, value);
}
