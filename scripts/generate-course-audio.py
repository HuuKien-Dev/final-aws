"""Regenerate original lesson WAVs. Build-time only: requires libespeak-ng.so.1."""
import ctypes as c,json,wave
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
lib=c.CDLL('libespeak-ng.so.1')
lib.espeak_Initialize.argtypes=[c.c_int,c.c_int,c.c_char_p,c.c_int]
rate=lib.espeak_Initialize(2,0,None,0)
if rate<=0:raise RuntimeError('Speech engine initialization failed')
lib.espeak_SetVoiceByName.argtypes=[c.c_char_p];lib.espeak_SetVoiceByName(b'en-gb')
lib.espeak_SetParameter(1,145,0)
chunks=[]
@c.CFUNCTYPE(c.c_int,c.POINTER(c.c_short),c.c_int,c.c_void_p)
def callback(samples,count,events):
 if samples and count:chunks.append(c.string_at(samples,count*2))
 return 0
lib.espeak_SetSynthCallback(callback)
lib.espeak_Synth.argtypes=[c.c_void_p,c.c_size_t,c.c_uint,c.c_int,c.c_uint,c.c_uint,c.c_void_p,c.c_void_p]
root=ROOT/'frontend/public/audio';root.mkdir(exist_ok=True)
for course in json.loads((ROOT/'backend/app/curriculum.json').read_text()):
 for lesson in course['lessons']:
  if lesson['skill']!='listening':continue
  chunks.clear();text=lesson['text'].encode()+b'\0'
  result=lib.espeak_Synth(text,len(text),0,1,0,1,None,None)
  if result:raise RuntimeError(result)
  lib.espeak_Synchronize()
  with wave.open(str(root/(lesson['id']+'.wav')),'wb') as audio:
   audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(rate);audio.writeframes(b''.join(chunks))
  print(lesson['id'],sum(map(len,chunks)))
lib.espeak_Terminate()
