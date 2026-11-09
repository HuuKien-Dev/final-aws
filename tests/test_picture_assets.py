import hashlib,json,unittest,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class PictureAssetsTests(unittest.TestCase):
    def test_all_picture_words_use_existing_local_licensed_assets(self):
        words=json.loads((ROOT/'frontend/app/data/picture-vocabulary.json').read_text())
        self.assertEqual(len(words),24)
        self.assertEqual(len({w['topic'] for w in words}),4)
        self.assertEqual(len({w['id'] for w in words}),len(words))
        self.assertTrue(all(sum(w['topic']==topic for w in words)==6 for topic in {w['topic'] for w in words}))
        manifest=json.loads((ROOT/'assets/picture-vocabulary/manifest.json').read_text())
        known={m['file'] for m in manifest}
        for word in words:
            self.assertTrue(word['image'].startswith('/api/picture-assets/'))
            self.assertIn(Path(word['image']).name,known)
            for field in ['english','vietnamese','example','alt']:self.assertTrue(word[field].strip())
    def test_original_bytes_and_attribution_match_manifest(self):
        folder=ROOT/'assets/picture-vocabulary'
        assets=json.loads((folder/'manifest.json').read_text())
        self.assertEqual(len(assets),6)
        for asset in assets:
            data=(folder/asset['file']).read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(),asset['sha256'])
            self.assertTrue(data.startswith(b'\xff\xd8\xff') or data.startswith(b'\x89PNG\r\n\x1a\n'))
            self.assertEqual(asset['license'],'CC BY-SA 4.0')
            self.assertTrue(asset['author'])
    def test_download_zip_contains_all_originals_and_credits(self):
        folder=ROOT/'assets/picture-vocabulary'
        with zipfile.ZipFile(folder/'vocabulary-images.zip') as archive:
            self.assertIsNone(archive.testzip())
            for entry in json.loads((folder/'manifest.json').read_text()):self.assertEqual(archive.read(entry['file']),(folder/entry['file']).read_bytes())
            self.assertIn('COPYRIGHT.txt',archive.namelist())
            self.assertIn('manifest.json',archive.namelist())

    def test_no_image_binaries_are_left_in_frontend_public(self):
        files=[p for p in (ROOT/'frontend/public').rglob('*') if p.suffix.lower() in {'.png','.jpg','.jpeg','.webp','.gif','.svg','.ico'}]
        self.assertEqual(files,[])

    def test_lesson_audio_is_allowlisted_and_owned_by_backend(self):
        manifest=json.loads((ROOT/'backend/app/audio-assets-manifest.json').read_text())
        files={item['file'] for item in manifest}
        self.assertEqual(len(files),6)
        self.assertFalse(any((ROOT/'frontend/public/audio').glob('*.wav')))
        for item in manifest:
            path=ROOT/'assets/audio'/item['file']
            self.assertTrue(path.is_file())
            self.assertEqual(path.stat().st_size,item['bytes'])
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),item['sha256'])
