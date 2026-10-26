import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Shared Inner Circle links get mangled: phones auto-capitalise ("Inner-Circle"), people drop the
 * dash or type a space. Every variant lands on the real page, keeping ?ref= invite codes.
 */
const INNER_CIRCLE_ALIASES = /^\/(?:inner[-_ ]?circle|join|waitlist|beta)\/?$/i

export async function proxy(request: NextRequest) {
    let path = request.nextUrl.pathname
    try {
        path = decodeURIComponent(path)
    } catch {
        // A malformed escape (a stray "%") is simply not an alias.
    }
    if (path !== "/inner-circle" && INNER_CIRCLE_ALIASES.test(path)) {
        const target = request.nextUrl.clone()
        target.pathname = "/inner-circle"
        return NextResponse.redirect(target, 308)
    }

    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    )
                    response = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (
        (request.nextUrl.pathname.startsWith("/login")
            || request.nextUrl.pathname.startsWith("/signup")
            || request.nextUrl.pathname.startsWith("/verify"))
        && user
    ) {
        return NextResponse.redirect(new URL("/dashboard", request.url))
    }

    if (
        request.nextUrl.pathname.startsWith("/dashboard") &&
        !user
    ) {
        const loginUrl = new URL("/login", request.url)
        loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search)
        return NextResponse.redirect(loginUrl)
    }

    return response
}

export const config = {
    matcher: [
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
}
