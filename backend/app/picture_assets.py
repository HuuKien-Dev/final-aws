"""Serve allowlisted images, logos and lesson audio from local files or private S3."""
import asyncio,hashlib,json,os,re,threading,time
from collections import OrderedDict
from functools import lru_cache
from pathlib import Path
import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError,ClientError
from fastapi import HTTPException,Request
from fastapi.responses import Response

ROOT=Path(__file__).resolve().parents[2]
PICTURE_MANIFEST=json.loads(Path(__file__).with_name('picture-assets-manifest.json').read_text())
BRANDING_MANIFEST=json.loads(Path(__file__).with_name('branding-manifest.json').read_text())
AUDIO_MANIFEST=json.loads(Path(__file__).with_name('audio-assets-manifest.json').read_text())

IMAGE_TYPES={m['file']:('image/png' if m['file'].endswith('.png') else 'image/jpeg') for m in PICTURE_MANIFEST}
IMAGE_TYPES.update({'manifest.json':'application/json','COPYRIGHT.txt':'text/plain; charset=utf-8','vocabulary-images.zip':'application/zip'})
IMAGE_TYPES.update({Path(m['public_url']).name:'image/png' for m in BRANDING_MANIFEST})
AUDIO_TYPES={m['file']:'audio/wav' for m in AUDIO_MANIFEST}

PICTURE_ROOT=ROOT/'assets'/'picture-vocabulary'
LOCAL_IMAGES={name:PICTURE_ROOT/name for name in IMAGE_TYPES}
LOCAL_IMAGES.update({Path(m['public_url']).name:ROOT/m['local_path'] for m in BRANDING_MANIFEST})
LOCAL_AUDIO={name:ROOT/'assets'/'audio'/name for name in AUDIO_TYPES}
MAX_BYTES=32*1024*1024
RANGE_PATTERN=re.compile(r'^bytes=(\d*)-(\d*)$')

@lru_cache(maxsize=1)
def s3_client():
    # Regional S3 DNS is routed through the VPC S3 Gateway Endpoint by AWS.
    # An IAM task/instance role supplies credentials; endpoint_url is not required.
    return boto3.client('s3',config=Config(connect_timeout=5,read_timeout=15,retries={'total_max_attempts':2}))

def storage_settings(kind):
    specific_mode='PICTURE_ASSET_STORAGE' if kind=='image' else 'AUDIO_ASSET_STORAGE'
    mode=(os.getenv('ASSET_STORAGE') or os.getenv(specific_mode) or 'local').lower()
    if kind=='image':
        bucket=os.getenv('S3_IMAGE_BUCKET') or os.getenv('S3_ASSET_BUCKET','')
        prefix=os.getenv('S3_IMAGE_PREFIX','media')
    else:
        bucket=os.getenv('S3_AUDIO_BUCKET') or os.getenv('S3_ASSET_BUCKET') or os.getenv('S3_IMAGE_BUCKET','')
        prefix=os.getenv('S3_AUDIO_PREFIX','audio')
    return mode,bucket.strip(),prefix.strip('/')

def validate_range(value):
    if value is None:return None
    match=RANGE_PATTERN.fullmatch(value.strip())
    if not match or not any(match.groups()):raise HTTPException(416,'Khoảng byte không hợp lệ')
    return value.strip()

def local_range(value,total):
    if value is None:return 0,total-1
    first,last=RANGE_PATTERN.fullmatch(value).groups()
    if first:
        start=int(first);end=int(last) if last else total-1
    else:
        length=int(last)
        if length<=0:raise HTTPException(416,'Khoảng byte không hợp lệ',headers={'Content-Range':f'bytes */{total}'})
        start=max(0,total-length);end=total-1
    if start>=total or start>end:
        raise HTTPException(416,'Khoảng byte không hợp lệ',headers={'Content-Range':f'bytes */{total}'})
    return start,min(end,total-1)

def asset_definition(kind,filename):
    types,files=(IMAGE_TYPES,LOCAL_IMAGES) if kind=='image' else (AUDIO_TYPES,LOCAL_AUDIO)
    if filename not in types:raise HTTPException(404,'Không tìm thấy tài nguyên')
    return types[filename],files[filename]

def read_object(kind,filename,range_header=None):
    content_type,local_file=asset_definition(kind,filename)
    byte_range=validate_range(range_header)
    mode,bucket,prefix=storage_settings(kind)
    if mode=='local':
        if not local_file.is_file():raise HTTPException(503,'Chưa có tài nguyên local. Cấu hình S3 cho môi trường cloud.')
        total=local_file.stat().st_size
        if total>MAX_BYTES:raise HTTPException(503,'Tệp vượt giới hạn')
        start,end=local_range(byte_range,total)
        with local_file.open('rb') as stream:
            stream.seek(start);data=stream.read(end-start+1)
        headers={'Accept-Ranges':'bytes','Content-Length':str(len(data))}
        if byte_range:headers['Content-Range']=f'bytes {start}-{end}/{total}'
        return data,content_type,206 if byte_range else 200,headers
    if mode!='s3':raise HTTPException(503,'ASSET_STORAGE không hợp lệ')
    if not bucket:raise HTTPException(503,'Chưa cấu hình bucket S3 cho tài nguyên')
    key=(prefix+'/' if prefix else '')+filename
    arguments={'Bucket':bucket,'Key':key}
    if byte_range:arguments['Range']=byte_range
    try:
        result=s3_client().get_object(**arguments)
        body=result['Body']
        try:
            length=result.get('ContentLength',0)
            content_range=result.get('ContentRange','')
            total=int(content_range.rsplit('/',1)[-1]) if '/' in content_range else length
            if total>MAX_BYTES:raise HTTPException(503,'Tệp vượt giới hạn')
            data=body.read(MAX_BYTES+1)
            if len(data)>MAX_BYTES:raise HTTPException(503,'Tệp vượt giới hạn')
        finally:body.close()
    except ClientError as error:
        if error.response.get('Error',{}).get('Code') in {'InvalidRange','416'}:
            raise HTTPException(416,'Khoảng byte không hợp lệ')
        raise HTTPException(503,'Chưa đọc được tài nguyên từ S3. Kiểm tra bucket, Gateway Endpoint và IAM Role backend.')
    except BotoCoreError:
        raise HTTPException(503,'Chưa đọc được tài nguyên từ S3. Kiểm tra bucket, Gateway Endpoint và IAM Role backend.')
    headers={'Accept-Ranges':result.get('AcceptRanges','bytes'),'Content-Length':str(len(data))}
    if content_range:headers['Content-Range']=content_range
    return data,content_type,206 if byte_range else 200,headers

# Whole-object reads are reused briefly so a logo shown on every page is not a
# fresh S3 GET each time, and browsers can revalidate with If-None-Match.
CACHE_TTL=600
CACHE_ITEM_MAX=2*1024*1024
CACHE_TOTAL_MAX=16*1024*1024
_cache=OrderedDict()
_cache_lock=threading.Lock()

def etag_matches(header,etag):
    if not header:return False
    return any(part.strip().removeprefix('W/')==etag or part.strip()=='*' for part in header.split(','))

def cached_object(kind,filename,if_none_match=None):
    """Returns (data, content_type, status, headers); 304 carries no data."""
    content_type,_=asset_definition(kind,filename)
    key=(kind,filename,storage_settings(kind));now=time.monotonic()
    with _cache_lock:
        entry=_cache.get(key)
        if entry and entry[0]<=now:
            del _cache[key];entry=None
        if entry:_cache.move_to_end(key)
    if entry:
        _,etag,data=entry
        if etag_matches(if_none_match,etag):return b'',content_type,304,{'ETag':etag}
        if data is not None:
            return data,content_type,200,{'Accept-Ranges':'bytes','Content-Length':str(len(data)),'ETag':etag}
    data,content_type,status,headers=read_object(kind,filename)
    etag='"'+hashlib.sha256(data).hexdigest()[:32]+'"'
    with _cache_lock:
        # Large originals keep only their ETag, so revalidation is still free.
        _cache[key]=(now+CACHE_TTL,etag,data if len(data)<=CACHE_ITEM_MAX else None)
        _cache.move_to_end(key)
        while sum(len(item[2] or b'') for item in _cache.values())>CACHE_TOTAL_MAX or len(_cache)>256:
            _cache.popitem(last=False)
    headers['ETag']=etag
    return data,content_type,status,headers

def read_asset(filename):
    """Compatibility helper used by existing image checks."""
    return read_object('image',filename)[0]

def read_audio(filename,range_header=None):
    return read_object('audio',filename,range_header)

def install(app):
    @app.get('/api/media/{filename}')
    @app.get('/api/picture-assets/{filename}')
    async def picture_asset(filename:str,request:Request):
        data,content_type,status,headers=await asyncio.to_thread(cached_object,'image',filename,request.headers.get('if-none-match'))
        headers['X-Content-Type-Options']='nosniff'
        if filename.endswith('.zip'):headers['Content-Disposition']='attachment; filename="vocabulary-images.zip"'
        return Response(content=data,media_type=content_type,status_code=status,headers=headers)

    @app.get('/api/audio/{filename}')
    async def audio_asset(filename:str,request:Request):
        byte_range=request.headers.get('range')
        if byte_range:data,content_type,status,headers=await asyncio.to_thread(read_audio,filename,byte_range)
        else:data,content_type,status,headers=await asyncio.to_thread(cached_object,'audio',filename,request.headers.get('if-none-match'))
        headers['X-Content-Type-Options']='nosniff'
        return Response(content=data,media_type=content_type,status_code=status,headers=headers)
