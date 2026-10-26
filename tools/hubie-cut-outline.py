from PIL import Image
import numpy as np, cv2
im=np.array(Image.open('/workspace/refs/hubie-official.jpg').convert('RGB')).astype(int)
H,W,_=im.shape
mn=im.min(2)
for th in (170,185,200):
  white=(mn>th).astype(np.uint8)
  white=cv2.morphologyEx(white,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
  nonw=(1-white).astype(np.uint8)
  n,l=cv2.connectedComponents(nonw,connectivity=4)
  bgl=set(l[0,:])|set(l[-1,:])|set(l[:,0])|set(l[:,-1])
  bg=np.isin(l,list(bgl))
  fg=(~bg).astype(np.uint8)
  n2,l2,st,_=cv2.connectedComponentsWithStats(fg); k=1+np.argmax(st[1:,4]); fg=(l2==k).astype(np.uint8)
  print(th,st[k])
  # fill holes
  ff=fg.copy(); m=np.zeros((H+2,W+2),np.uint8); cv2.floodFill(ff,m,(0,0),1); fg=fg|(1-ff)
  np.save(f'm{th}.npy',fg)
  a=cv2.GaussianBlur(fg.astype(np.float32),(3,3),0.8)
  rgba=np.dstack([im.astype(np.uint8),(a*255).astype(np.uint8)])
  f=Image.fromarray(rgba); bg2=Image.new('RGBA',f.size,(20,30,60,255)); bg2.alpha_composite(f); bg2.convert('RGB').save(f'c{th}.jpg')
