import { createHash } from "node:crypto";
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const jsonHash = (value) => hash(JSON.stringify(value));
