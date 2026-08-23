import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { R2_BUCKET, signedUrl } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { clientId, fileName } = await request.json();
  if (!fileName) {
    return NextResponse.json({ error: "fileName required" }, { status: 400 });
  }
  const owner = clientId || "general";
  const path = `${owner}/${Date.now()}-${fileName}`;

  const url = await signedUrl(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: path,
    })
  );

  return NextResponse.json({ url, path });
}
