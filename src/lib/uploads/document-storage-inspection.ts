import "server-only";
import type { Storage } from "firebase-admin/storage";
import { diagnoseDocumentCleanup, type CleanupDiagnosticInput } from "./document-cleanup-diagnostic";

type ObjectInspection =
  | { bucket: string; state: "present"; generation: string }
  | { bucket: string; state: "absent" }
  | { bucket: string; state: "unverified" };

/** Metadata only. No implicit buckets, file contents, download tokens or deletions. */
export async function inspectDocumentStorage(input: {
  diagnostic: CleanupDiagnosticInput;
  buckets: readonly string[];
  storage: Pick<Storage, "bucket">;
}) {
  const preflight = diagnoseDocumentCleanup(input.diagnostic);
  if (preflight.status === "blocked") return { status: "blocked", reason: preflight.reason, objects: [] } as const;
  const buckets = [...new Set(input.buckets)];
  if (!buckets.length || buckets.length > 10 || buckets.some(bucket => !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket))) {
    return { status: "blocked", reason: "invalid-bucket-scope", objects: [] } as const;
  }
  const path = input.diagnostic.trace!.cleanupPath as string; // Validated by preflight.
  const objects: ObjectInspection[] = [];
  for (const name of buckets) {
    try {
      const bucket = input.storage.bucket(name);
      // A bucket-level 404 is not evidence that the object is absent.
      const [bucketMetadata] = await bucket.getMetadata();
      if (bucketMetadata.name !== name) throw new Error("Unverified bucket identity");
      let metadata;
      try {
        [metadata] = await bucket.file(path).getMetadata();
      } catch (error) {
        if (String((error as { code?: unknown })?.code) === "404") {
          objects.push({ bucket: name, state: "absent" });
          continue;
        }
        throw error;
      }
      const generation = metadata.generation;
      // Never coerce a potentially rounded numeric generation.
      if (metadata.name !== path || metadata.bucket !== name || typeof generation !== "string" || !/^[1-9][0-9]*$/.test(generation)) {
        throw new Error("Unverified object identity or generation");
      }
      objects.push({ bucket: name, state: "present", generation });
    } catch {
      // Raw errors/metadata can include private paths or download tokens.
      objects.push({ bucket: name, state: "unverified" });
    }
  }
  return {
    status: objects.some(object => object.state === "unverified") ? "incomplete" : "inspected",
    objects,
  } as const;
}
