"""Same-origin image endpoint backed by private S3 (or source files for local testing)."""
import asyncio,json,os
from functools import lru_cache
from pathlib import Path
import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError,ClientError
from fastapi import HTTPException
from fastapi.responses import Response
MANIFEST=json.loads(Path(__file__).with_name('picture-assets-manifest.json').read_text())
FILES={m['file']:('image/png' if m['file'].endswith('.png') else 'image/jpeg') for m in MANIFEST}
FILES.update({'manifest.json':'application/json','COPYRIGHT.txt':'text/plain; charset=utf-8','vocabulary-images.zip':'application/zip'})
ROOT=Path(__file__).resolve().parents[2]
LOCAL=ROOT/'assets'/'picture-vocabulary'
BRANDING=json.loads(Path(__file__).with_name('branding-manifest.json').read_text())
FILES.update({Path(m['public_url']).name:'image/png' for m in BRANDING})
LOCAL_FILES={name:LOCAL/name for name in FILES}
LOCAL_FILES.update({Path(m['public_url']).name:ROOT/m['local_path'] for m in BRANDING})
MAX_BYTES=32*1024*1024
@lru_cache(maxsize=1)
def s3_client():
    return boto3.client('s3',config=Config(connect_timeout=5,read_timeout=15,retries={'total_max_attempts':1}))

def read_asset(filename):
    if filename not in FILES:raise HTTPException(404,'Không tìm thấy ảnh')
    mode=os.getenv('PICTURE_ASSET_STORAGE','local')
    if mode=='local':
        file=LOCAL_FILES[filename]
        if not file.is_file():raise HTTPException(503,'Chưa có ảnh local. Cấu hình S3 để phục vụ ảnh trên AWS.')
        if file.stat().st_size>MAX_BYTES:raise HTTPException(503,'Tệp ảnh vượt giới hạn')
        return file.read_bytes()
    if mode!='s3':raise HTTPException(503,'PICTURE_ASSET_STORAGE không hợp lệ')
    bucket=os.getenv('S3_IMAGE_BUCKET','').strip()
    prefix=os.getenv('S3_IMAGE_PREFIX','media').strip('/')
    if not bucket:raise HTTPException(503,'Chưa cấu hình S3_IMAGE_BUCKET')
    key=(prefix+'/' if prefix else '')+filename
    try:
        result=s3_client().get_object(Bucket=bucket,Key=key)
        body=result['Body']
        try:
            if result.get('ContentLength',0)>MAX_BYTES:raise HTTPException(503,'Tệp ảnh vượt giới hạn')
            data=body.read(MAX_BYTES+1)
            if len(data)>MAX_BYTES:raise HTTPException(503,'Tệp ảnh vượt giới hạn')
            return data
        finally:body.close()
    except (BotoCoreError,ClientError):
        raise HTTPException(503,'Chưa đọc được ảnh từ S3. Kiểm tra bucket, object và IAM Role backend.')

def install(app):
    @app.get('/api/media/{filename}')
    @app.get('/api/picture-assets/{filename}')
    async def picture_asset(filename:str):
        data=await asyncio.to_thread(read_asset,filename)
        headers={'X-Content-Type-Options':'nosniff'}
        if filename.endswith('.zip'):headers['Content-Disposition']='attachment; filename="vocabulary-images.zip"'
        return Response(content=data,media_type=FILES[filename],headers=headers)
