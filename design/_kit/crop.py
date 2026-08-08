import sys
from PIL import Image
f=sys.argv[1]
im=Image.open(f).convert('RGB')
w,h=im.size
px=im.load()
bg=px[5,h-5]
last=h-1
def rowbg(y):
    return all(px[x,y]==bg for x in range(0,w,7))
while last>10 and rowbg(last):
    last-=1
bottom=min(h,last+int(48*2))
im.crop((0,0,w,bottom)).save(f)
print(f, im.size, '->', (w,bottom))
