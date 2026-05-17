const CLOUD_NAME = "dlverz7y7";
const UPLOAD_PRESET = "fukrey";

export async function uploadToCloudinary(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("eager", "sp_hd");
  formData.append("eager_async", "true");
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
    { method: "POST", body: formData }
  );
  const data = await response.json();
  if (!response.ok) {
    console.error("Cloudinary error:", data);
    throw new Error(data.error?.message || "Upload failed");
  }

  const isVideo = data.resource_type === "video";
  const hlsUrl = isVideo
    ? data.secure_url
        .replace("/upload/", "/upload/sp_hd/")
        .replace(/\.(mp4|webm|mkv|avi|mov)$/i, ".m3u8")
    : data.secure_url;

  return {
    url: hlsUrl,
    originalUrl: data.secure_url,
    publicId: data.public_id,
    type: data.resource_type,
  };
}
