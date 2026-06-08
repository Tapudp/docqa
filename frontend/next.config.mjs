/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // pdfjs-dist optionally requires canvas; alias it to false to suppress the warning
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
};

export default nextConfig;
