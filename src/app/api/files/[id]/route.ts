import { getActor } from "@/lib/session";
import { AppError } from "@/lib/domain";
import { readFileFor } from "@/services/files";

/**
 * Authorised file delivery; nothing is served from /public. Photos are sent inline at original quality
 * (product photos are public and immutable, so they cache); documents and evidence download privately.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { meta, bytes } = await readFileFor(await getActor(), id);
    const photo = meta.purpose === "PRODUCT_IMAGE" || meta.purpose === "SURPLUS_IMAGE";
    const name = meta.originalName.replace(/"/g, "");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": meta.mime,
        "content-disposition": `${photo ? "inline" : "attachment"}; filename="${name}"`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "cache-control": meta.purpose === "PRODUCT_IMAGE" ? "public, max-age=31536000, immutable" : photo ? "private, max-age=3600" : "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response("Not found", { status: 404 });
    throw e;
  }
}
