/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/remove-bg',
        destination: 'https://api.remove.bg/v1.0/removebg',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/api/remove-bg',
        headers: [
          { key: 'X-Api-Key', value: process.env.REMOVEBG_API_KEY || '' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
