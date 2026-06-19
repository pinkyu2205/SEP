import imageCompression from 'browser-image-compression';

export const uploadToCloudinary = async (
  file: File,
  resourceType: 'auto' | 'raw' | 'image' = 'auto',
): Promise<string> => {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error('Thiếu cấu hình Cloudinary trong file .env');
  }

  let fileToUpload = file;

  // NẾU LÀ HÌNH ẢNH: Thực hiện nén trước khi upload để tiết kiệm dung lượng Cloudinary
  if (file.type.startsWith('image/')) {
    try {
      const options = {
        maxSizeMB: 1,          // Tối đa 1MB
        maxWidthOrHeight: 1920, // Tối đa kích thước Full HD
        useWebWorker: true,
      };

      const compressedBlob = await imageCompression(file, options);

      // Chuyển lại từ Blob sang File giữ nguyên tên
      fileToUpload = new File([compressedBlob], file.name, {
        type: compressedBlob.type,
        lastModified: Date.now(),
      });

    } catch (error) {
      console.warn('Lỗi khi nén ảnh, sẽ tiến hành upload ảnh gốc:', error);
    }
  }

  // Khởi tạo FormData
  const formData = new FormData();
  formData.append('file', fileToUpload);
  formData.append('upload_preset', uploadPreset);

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Lỗi upload Cloudinary');
    }

    const data = await response.json();
    return data.secure_url; 
  } catch (error) {
    console.error('Error uploading file to Cloudinary:', error);
    throw error;
  }
};
