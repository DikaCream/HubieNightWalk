from PIL import Image
import numpy as np, cv2
im=np.array(Image.open('/workspace/refs/hubie-official.jpg').convert('RGB'))
H,W,_=im.shape
o=np.load('m170.npy')  # this is outline+filled attempt
rb=(np.array(Image.open('full.png'))[:,:,3]>128).astype(np.uint8)
low=rb.copy(); low[:640]=0
fg=(o|low).astype(np.uint8)
fg=cv2.morphologyEx(fg,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
ff=fg.copy(); m=np.zeros((H+2,W+2),np.uint8); cv2.floodFill(ff,m,(0,0),1); fg=fg|(1-ff)
n,l,st,_=cv2.connectedComponentsWithStats(fg); k=1+np.argmax(st[1:,4]); fg=(l==k).astype(np.uint8)
fg=cv2.morphologyEx(fg,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
# antialias: upsample-smooth edges
a=cv2.GaussianBlur(fg.astype(np.float32),(5,5),1.0); a=np.clip((a-0.5)*2.2+0.5,0,1)
np.save('alpha.npy',a)
rgba=np.dstack([im,(a*255).astype(np.uint8)])
f=Image.fromarray(rgba); f.save('full2.png')
for c,nm in (((20,30,60,255),'d'),((255,0,255,255),'p')):
  bg2=Image.new('RGBA',f.size,c); bg2.alpha_composite(f); bg2.convert('RGB').save(f'c3{nm}.jpg')
print(f.getbbox())
