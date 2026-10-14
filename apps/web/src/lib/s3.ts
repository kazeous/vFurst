import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucketName = process.env.S3_BUCKET_NAME;

export const s3Client = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: Boolean(process.env.S3_ENDPOINT),
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      : undefined
});

function requireBucket() {
  if (!bucketName) {
    throw new Error("S3_BUCKET_NAME is not configured.");
  }

  return bucketName;
}

export function buildObjectKey(orgId: string, context: string, filename: string) {
  const safeContext = context.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const safeFilename = filename.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();

  return `${orgId}/${safeContext}/${safeFilename}`;
}

export async function getPresignedUploadUrl(key: string, contentType: string, maxSizeBytes: number) {
  if (maxSizeBytes <= 0) {
    throw new Error("maxSizeBytes must be greater than zero.");
  }

  const command = new PutObjectCommand({
    Bucket: requireBucket(),
    Key: key,
    ContentType: contentType
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: 60 * 5
  });
}

export function getPublicUrl(key: string) {
  const bucket = requireBucket();

  if (process.env.S3_PUBLIC_URL) {
    return `${process.env.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }

  if (process.env.S3_ENDPOINT) {
    return `${process.env.S3_ENDPOINT.replace(/\/$/, "")}/${bucket}/${key}`;
  }

  return `https://${bucket}.s3.${process.env.AWS_REGION ?? "us-east-1"}.amazonaws.com/${key}`;
}

export async function deleteObject(key: string) {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: requireBucket(),
      Key: key
    })
  );
}

export async function uploadFromBuffer(key: string, buffer: Buffer, contentType: string) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: requireBucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType
    })
  );

  return getPublicUrl(key);
}

