import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["openai", "@supabase/supabase-js", "jszip"],
};

export default nextConfig;
