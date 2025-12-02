import { NextResponse } from "next/server";

export async function POST(request: Request) {
  return NextResponse.json(
    { error: "Admin delete not implemented in frontend-only version." },
    { status: 400 }
  );
}