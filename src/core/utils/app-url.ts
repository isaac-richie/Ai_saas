const LOCAL_APP_URL = "http://localhost:3000";

function cleanBaseUrl(value: string | undefined): string | null {
    const candidate = value?.trim();
    if (!candidate || candidate === "null" || candidate === "undefined") return null;

    const withProtocol = candidate.startsWith("http://") || candidate.startsWith("https://")
        ? candidate
        : `https://${candidate}`;

    try {
        const url = new URL(withProtocol);
        return url.origin.replace(/\/$/, "");
    } catch {
        return null;
    }
}

export function getAppBaseUrl() {
    return (
        cleanBaseUrl(process.env.NEXT_PUBLIC_SITE_URL)
        || cleanBaseUrl(process.env.NEXT_PUBLIC_APP_URL)
        || cleanBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL)
        || cleanBaseUrl(process.env.VERCEL_URL)
        || LOCAL_APP_URL
    );
}

export function getAppUrl(path = "/") {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${getAppBaseUrl()}${normalizedPath}`;
}
