import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";
import { hmac, safeEqual } from "../crypto";

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, expiresInSec: number): Promise<string>;
}

/** Signed local URLs: /api/v1/files/raw/<key>?e=<expiry>&s=<sig> */
export function signLocal(key: string, expires: number) {
  return hmac(`${key}:${expires}`).slice(0, 40);
}
export function verifyLocal(key: string, expires: number, sig: string) {
  return expires > Date.now() / 1000 && safeEqual(signLocal(key, expires), sig);
}

function localDriver(): StorageDriver {
  const root = path.resolve(env().STORAGE_LOCAL_DIR);
  const resolve = (key: string) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error("Invalid storage key");
    return p;
  };
  return {
    async put(key, body) {
      const p = resolve(key);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, body);
    },
    get: (key) => readFile(resolve(key)),
    async delete(key) {
      await unlink(resolve(key)).catch(() => undefined);
    },
    async signedUrl(key, expiresInSec) {
      const e = Math.floor(Date.now() / 1000) + expiresInSec;
      return `/api/v1/files/raw/${encodeURI(key)}?e=${e}&s=${signLocal(key, e)}`;
    },
  };
}

function s3Driver(): StorageDriver {
  const e = env();
  const client = new S3Client({
    region: e.S3_REGION ?? "us-east-1",
    endpoint: e.S3_ENDPOINT,
    forcePathStyle: !!e.S3_ENDPOINT,
    credentials: e.S3_ACCESS_KEY_ID ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY ?? "" } : undefined,
  });
  const Bucket = e.S3_BUCKET!;
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    signedUrl: (key, expiresIn) => getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), { expiresIn }),
  };
}

let driver: StorageDriver | undefined;
export function storage(): StorageDriver {
  driver ??= env().STORAGE_DRIVER === "s3" ? s3Driver() : localDriver();
  return driver;
}
