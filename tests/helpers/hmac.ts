import { createHmac } from "node:crypto";

export const hmacHex = (secret: string, value: string) => createHmac("sha256", secret).update(value).digest("hex");
