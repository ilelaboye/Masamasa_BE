import { appConfig } from '@/config';
import { Injectable, NotAcceptableException } from '@nestjs/common';
import * as cloudinary from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.v2.config({
      cloud_name: appConfig.CLOUDINARYNAME,
      api_key: appConfig.CLOUDINARYAPIKEY,
      api_secret: appConfig.CLOUDINARYAPISECRET,
    });
  }

  async upload(files: Express.Multer.File[]): Promise<cloudinary.UploadApiResponse[]> {
    if (!files || files.length < 1) return [];
    const uploadPromises = files.map(async (file) => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.v2.uploader.upload_stream((error, result) => {
          if (error) return reject(error);

          delete result?.api_key;
          resolve(result);
        });
        streamifier.createReadStream(file.buffer).pipe(uploadStream);
      });
    });

    try {
      const results = await Promise.all(uploadPromises);

      return results as Array<cloudinary.UploadApiResponse>;
    } catch (error) {
      throw new NotAcceptableException(error.message);
    }
  }
}
