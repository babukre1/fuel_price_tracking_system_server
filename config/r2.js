const { DeleteObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { randomUUID } = require("crypto");
const path = require("path");

const getR2Endpoint = () => {
  if (process.env.R2_ENDPOINT) {
    return process.env.R2_ENDPOINT;
  }

  if (process.env.R2_ACCOUNT_ID) {
    return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }

  return null;
};

const getR2Client = () => {
  const endpoint = getR2Endpoint();

  if (
    !endpoint ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY
  ) {
    throw new Error("Cloudflare R2 environment variables are not configured");
  }

  return new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
};

const buildPublicUrl = (key) => {
  if (!process.env.R2_PUBLIC_URL) {
    return key;
  }

  return `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
};

const getKeyFromPublicUrl = (url) => {
  if (!url || !process.env.R2_PUBLIC_URL) {
    return null;
  }

  const publicUrl = process.env.R2_PUBLIC_URL.replace(/\/$/, "");
  if (!url.startsWith(`${publicUrl}/`)) {
    return null;
  }

  return decodeURIComponent(url.slice(publicUrl.length + 1).split("?")[0]);
};

const uploadImageToR2 = async (file, folder = "uploads") => {
  if (!file) {
    return null;
  }

  if (!process.env.R2_BUCKET_NAME) {
    throw new Error("R2_BUCKET_NAME is not configured");
  }

  const extension = path.extname(file.originalname || "").toLowerCase();
  const key = `${folder}/${Date.now()}-${randomUUID()}${extension}`;

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ContentDisposition: "inline",
    }),
  );

  return {
    key,
    url: buildPublicUrl(key),
  };
};

const deleteFileFromR2 = async ({ key, url } = {}) => {
  const objectKey = key || getKeyFromPublicUrl(url);

  if (!objectKey) {
    return false;
  }

  if (!process.env.R2_BUCKET_NAME) {
    throw new Error("R2_BUCKET_NAME is not configured");
  }

  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: objectKey,
    }),
  );

  return true;
};

module.exports = {
  deleteFileFromR2,
  uploadImageToR2,
};
