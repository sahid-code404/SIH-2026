import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NirikshanX",
    short_name: "NirikshanX",
    description: "Trust and inspection intelligence platform for SIH26095",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f8fb",
    theme_color: "#173f8a",
  };
}
