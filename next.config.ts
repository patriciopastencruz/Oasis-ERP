import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Los respaldos se validan individualmente hasta 10 MB. Este margen permite
    // enviar hasta cuatro archivos junto con los demás campos del formulario.
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
