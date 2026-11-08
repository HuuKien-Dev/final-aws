# Original image upload set

`picture-vocabulary/` contains 6 existing Ubuntu Wallpapers images, credits, a manifest and a ZIP. Upload this directory to the private S3 bucket described in `HUONG_DAN_TRIEN_KHAI_AWS.md`. It is outside the frontend public directory.

For local development, the backend reads these originals. For AWS, set `PICTURE_ASSET_STORAGE=s3`, `S3_IMAGE_BUCKET` and `S3_IMAGE_PREFIX`. Frontend requests `/api/picture-assets/{filename}`; the backend uses its EC2 IAM role to read S3. No S3 credentials, bucket URLs or original image files are needed in the frontend runtime.

Images retain their CC BY-SA 4.0 license; see `picture-vocabulary/COPYRIGHT.txt` and `manifest.json`.
