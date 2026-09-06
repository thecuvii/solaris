import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Let phones on the LAN load HMR/dev assets when testing on a real device.
  allowedDevOrigins: ['192.168.50.157', '192.168.50.*'],
  images: {
    unoptimized: true,
  },
  output: 'export',
  trailingSlash: true,
  transpilePackages: ['@thecuvii/solaris'],
}

export default nextConfig
