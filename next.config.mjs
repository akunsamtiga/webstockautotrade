/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',      
  trailingSlash: true,   
  images: {
    unoptimized: true,
     remotePatterns: [
        { hostname: 'cdn.jsdelivr.net' },
        { hostname: 'flagcdn.com' }, 
  ]
  },
};
export default nextConfig;