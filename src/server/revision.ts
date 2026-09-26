import { createHash } from "node:crypto";
import type { AppState } from "@/domain/types";
export function stateRevision(state: AppState) {
  return createHash("sha256")
    .update(JSON.stringify({ ...state, articles: undefined }))
    .digest("hex");
}
