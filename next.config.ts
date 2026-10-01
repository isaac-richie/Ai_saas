import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // FFmpeg is required for video/audio reference analysis in Node functions.
  // Make the platform binary explicit in traces so deployment does not rely
  // on a system-level `ffmpeg` being preinstalled by the host.
  outputFileTracingIncludes: {
    "/api/media/references/analyse": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/takes/*/inspect": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/ad/production-crew": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/production/worker": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'oaidalleapiprodscus.blob.core.windows.net',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
          protocol: 'https',
          hostname: 'tempfile.aiquickdraw.com',
          port: '',
          pathname: '/**',
      }
    ],
  },
};

export default nextConfig;
