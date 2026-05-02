import base64
import urllib.parse
from Crypto.Cipher import AES
from Crypto.Util import Padding

key = b"\x62\x7f\xf1\x94\x21\x85\xe0\x11\xc8\x15\xe8\x1e\x63\x9b\x9a\x00\x00\x1c\x76\x6b\x82\x6c\x29\xbd\x96\x57\x85\x89\xf1\x9a\x6f\xd6"
iv = b"\xbe\x56\x16\x7f\x83\xda\x3b\xef\xef\xf8\x18\x61\xa5\xc5\xf3\xcd"

cipher = AES.new(key, AES.MODE_CBC, iv=iv)

ciphertext = "YqGcoevggNwvS%2BSpoPH2U30P2rbORMddKMn2OkbtIpA%3D"
ciphertext = urllib.parse.unquote(ciphertext)
cipherbin = base64.b64decode(ciphertext)

plainbin = cipher.decrypt(cipherbin)
plaintext = Padding.unpad(plainbin, AES.block_size)

print(plaintext)

'''
编码方式：base64
加密方案：AES
加密模式：CBC
密匙key： 627ff1942185e011c815e81e639b9a00001c766b826c29bd96578589f19a6fd6
IV：be56167f83da3befeff81861a5c5f3cd
'''