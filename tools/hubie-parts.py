from PIL import Image
import numpy as np, cv2
im=np.array(Image.open('/workspace/refs/hubie-official.jpg').convert('RGB')); H,W,_=im.shape
a=np.load('alpha.npy'); fg=a>0.5
yy,xx=np.mgrid[:H,:W]
dark=(im.max(2)<75)&(yy<245)&(xx>330)&(xx<640)
dark[(yy>215)&(xx>560)]=False  # avoid hair shadow on right
buck=(xx>480)&(xx<545)&(yy>70)&(yy<160)
hm=((dark|buck)&fg).astype(np.uint8)
n,l,st,_=cv2.connectedComponentsWithStats(hm); k=1+np.argmax(st[1:,4]); hm=(l==k).astype(np.uint8)
hm=cv2.morphologyEx(hm,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))
ff=hm.copy(); m=np.zeros((H+2,W+2),np.uint8); cv2.floodFill(ff,m,(0,0),1); hm=hm|(1-ff)
# grow outward to include white outline, but only where it's outside hat into non-fur
grow=cv2.dilate(hm,np.ones((15,15),np.uint8))
fur=(im[:,:,0].astype(int)-im[:,:,2]>25)&(im.max(2)>60)
wh=(im.min(2)>150)
pts=np.array([(320,30),(320,200),(370,226),(420,209),(470,194),(520,184),(570,178),(615,162),(650,150),(650,30)],np.int32)
poly=np.zeros((H,W),np.uint8); cv2.fillPoly(poly,[pts],1)
hat=poly.astype(bool)&fg&~(fur&(yy>165))
hat=hat.astype(np.uint8)
ha=cv2.GaussianBlur(hat.astype(np.float32),(3,3),0.7)*a
print('hat bbox',cv2.boundingRect(hat))
# body: remove hat; under brim fill fur
body=im.copy(); ba=a.copy()
holes=cv2.dilate(poly,np.ones((5,5),np.uint8)).astype(bool)
headc=((xx-455)/128)**2+((yy-280)/112)**2<1
fill=holes&headc&fg
body[fill]=(118,74,40)
ba[holes&~fill]=0
fa=cv2.GaussianBlur(headc.astype(np.float32),(5,5),1.2)
ba[holes]=np.where(fill[holes],1,0)
ba[holes]=np.minimum(ba[holes]+0,fa[holes])
ba[holes&~fg]=0
Image.fromarray(np.dstack([im,(ha*255).astype(np.uint8)])).save('p_hat.png')
Image.fromarray(np.dstack([body,(np.clip(ba,0,1)*255).astype(np.uint8)])).save('p_body.png')
for nm in ('p_hat','p_body'):
  f=Image.open(nm+'.png'); b=Image.new('RGBA',f.size,(255,0,255,255)); b.alpha_composite(f); b.convert('RGB').crop((250,30,700,420)).save(nm+'_v3.jpg')
pts=np.array([(740,220),(980,220),(980,520),(852,520),(850,425),(815,398),(785,372),(755,335),(740,300)],np.int32)
hp=np.zeros((H,W),np.uint8); cv2.fillPoly(hp,[pts],1)
hpf=cv2.GaussianBlur(hp.astype(np.float32),(3,3),0.6)
body2=np.array(Image.open('p_body.png')).astype(np.float32)
hand=np.dstack([im,(a*hpf*255).astype(np.uint8)])
body2[:,:,3]*= (1-hpf)
Image.fromarray(hand).save('p_hand.png'); Image.fromarray(body2.astype(np.uint8)).save('p_body.png')
# export trimmed, scaled to 50%, with offsets json
import json
full=Image.fromarray(np.dstack([im,(a*255).astype(np.uint8)]))
bb=full.getbbox(); print('bb',bb)
meta={}
import os; os.makedirs('/workspace/hubie-night-walk/src/art',exist_ok=True)
S=0.5
for nm,f in (('body',Image.open('p_body.png')),('hat',Image.open('p_hat.png')),('hand',Image.open('p_hand.png')),('full',full)):
  b=f.getbbox(); c=f.crop(b); c=c.resize((round(c.width*S),round(c.height*S)),Image.LANCZOS)
  c.save(f'/workspace/hubie-night-walk/src/art/hubie-{nm}.webp',quality=90,method=6)
  meta[nm]=dict(x=round((b[0]-bb[0])*S,1),y=round((b[1]-bb[1])*S,1),w=c.width,h=c.height)
meta['W']=round((bb[2]-bb[0])*S); meta['H']=round((bb[3]-bb[1])*S)
meta['wrist']=[round((855-bb[0])*S),round((450-bb[1])*S)]
print(json.dumps(meta))
json.dump(meta,open('/workspace/hubie-night-walk/src/art/hubie-parts.json','w'))
