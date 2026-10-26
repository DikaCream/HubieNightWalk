from rembg import remove, new_session
from PIL import Image
import numpy as np, cv2
im=Image.open('/workspace/refs/hubie-official.jpg').convert('RGB')
out=remove(im,session=new_session('isnet-general-use'))
a=np.array(out)[:,:,3]
# keep largest component
m=(a>128).astype(np.uint8); n,l,st,_=cv2.connectedComponentsWithStats(m)
k=1+np.argmax(st[1:,4]); keep=(l==k).astype(np.uint8)
keep=cv2.dilate(keep,np.ones((5,5),np.uint8))
a=(a*keep).astype(np.uint8)
rgba=np.dstack([np.array(im),a]); Image.fromarray(rgba).save('full.png')
print(st[k])
