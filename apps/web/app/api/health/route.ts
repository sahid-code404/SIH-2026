export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      service: "nirikshanx-web",
      status: "UP",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
