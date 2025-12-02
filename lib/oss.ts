import type { Contract } from "./types";

// Minimal Aliyun OSS uploader with graceful fallback when SDK/env is missing.

export function hasOssConfig(): boolean {
  const ak = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || process.env.ALIYUN_ACCESS_KEY_ID;
  const sk = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || process.env.ALIYUN_ACCESS_KEY_SECRET;
  const bucket = process.env.ALIBABA_CLOUD_OSS_BUCKET || process.env.OSS_BUCKET;
  const region = process.env.ALIBABA_CLOUD_OSS_REGION || process.env.OSS_REGION;
  const endpoint = process.env.ALIBABA_CLOUD_OSS_ENDPOINT || process.env.OSS_ENDPOINT;
  return !!ak && !!sk && !!bucket && (!!region || !!endpoint);
}

type UploadInput = {
  id: string;
  filename: string;
  mime: string;
  buffer: Buffer;
};

export async function uploadToOss(input: UploadInput): Promise<Pick<Contract, "ossBucket" | "ossRegion" | "ossEndpoint" | "ossKey"> | null> {
  if (!hasOssConfig()) return null;
  try {
    // Dynamic require to avoid bundling when not installed
    const mod = await import("ali-oss");
    const OSS: any = (mod as any).default || (mod as any);
    const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || process.env.ALIYUN_ACCESS_KEY_ID;
    const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || process.env.ALIYUN_ACCESS_KEY_SECRET;
    const bucket = process.env.ALIBABA_CLOUD_OSS_BUCKET || process.env.OSS_BUCKET!;
    const region = process.env.ALIBABA_CLOUD_OSS_REGION || process.env.OSS_REGION || "";
    const endpoint = process.env.ALIBABA_CLOUD_OSS_ENDPOINT || process.env.OSS_ENDPOINT || "";

    const client = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      // Prefer explicit endpoint; else region like 'oss-cn-shanghai'
      ...(endpoint ? { endpoint, cname: false } : {}),
      ...(region ? { region } : {}),
      secure: true,
    });

    const safeName = input.filename.replace(/[^\w.\-]+/g, "_");
    const key = `contracts/${input.id}-${safeName}`;
    await client.put(key, input.buffer, { headers: { "Content-Type": input.mime } });
    return { ossBucket: bucket, ossRegion: region || undefined, ossEndpoint: endpoint || undefined, ossKey: key };
  } catch (_e) {
    return null;
  }
}

export async function getOssSignedUrl(info: { bucket?: string; region?: string; endpoint?: string; key?: string }, opts?: { expiresSec?: number }): Promise<string | null> {
  if (!info.key || !info.bucket) return null;
  try {
    const mod = await import("ali-oss");
    const OSS: any = (mod as any).default || (mod as any);
    const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || process.env.ALIYUN_ACCESS_KEY_ID;
    const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || process.env.ALIYUN_ACCESS_KEY_SECRET;
    const client = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket: info.bucket,
      ...(info.endpoint ? { endpoint: info.endpoint } : {}),
      ...(info.region ? { region: info.region } : {}),
      secure: true,
    });
    const defaultExpires = Number(process.env.OSS_URL_EXPIRES_SEC || 600);
    const url = client.signatureUrl(info.key, { expires: opts?.expiresSec ?? defaultExpires });
    return url as string;
  } catch {
    return null;
  }
}
