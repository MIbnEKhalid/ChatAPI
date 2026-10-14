export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const redirectParam = url.searchParams.get("redirect") || "/chatbot";
  return Response.redirect(
    new URL(`/mbkauthe/login?redirect=${encodeURIComponent(redirectParam)}`, request.url),
    302
  );
}

export async function POST(request) {
  const url = new URL(request.url);
  const redirectParam = url.searchParams.get("redirect") || "/chatbot";
  return Response.redirect(
    new URL(`/mbkauthe/login?redirect=${encodeURIComponent(redirectParam)}`, request.url),
    302
  );
}
