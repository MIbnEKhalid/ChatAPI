import { handleExpressRequest } from "@/src/lib/expressAdapter.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  return handleExpressRequest(request);
}

export async function POST(request) {
  return handleExpressRequest(request);
}

export async function PUT(request) {
  return handleExpressRequest(request);
}

export async function DELETE(request) {
  return handleExpressRequest(request);
}

export async function PATCH(request) {
  return handleExpressRequest(request);
}

export async function HEAD(request) {
  return handleExpressRequest(request);
}

export async function OPTIONS(request) {
  return handleExpressRequest(request);
}
