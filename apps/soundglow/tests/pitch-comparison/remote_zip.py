"""Bounded HTTP-range reader for selecting small files from the official AVID ZIP."""
import io,urllib.request,zipfile,json
class Remote(io.RawIOBase):
 def __init__(self,url,size):self.url=url;self.size=size;self.pos=0
 def seek(self,n,whence=0):self.pos=n if whence==0 else self.pos+n if whence==1 else self.size+n;return self.pos
 def tell(self):return self.pos
 def read(self,n=-1):
  if n<0:n=self.size-self.pos
  n=min(n,self.size-self.pos)
  if n==0:return b''
  assert n<30_000_000
  end=self.pos+n-1
  with urllib.request.urlopen(urllib.request.Request(self.url,headers={'Range':f'bytes={self.pos}-{end}'}),timeout=45) as r:
   assert r.status==206 and r.headers['Content-Range'].startswith(f'bytes {self.pos}-{end}/'),r.headers
   b=r.read(n+1);assert len(b)==n;self.pos+=n;return b
