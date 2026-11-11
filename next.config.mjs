/** @type {import('next').NextConfig} */
// The app is served at https://goxl.in/business-live. Override with NEXT_PUBLIC_BASE_PATH ('' for a root domain or subdomain).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/business-live';
const nextConfig = {
  basePath,
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
  outputFileTracingIncludes: { '/api/creative/[id]/image': ['./src/assets/fonts/**/*'] },
  serverExternalPackages: ['sharp'],
};
export default nextConfig;
