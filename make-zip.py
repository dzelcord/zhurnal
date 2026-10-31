# Упаковывает .app в zip с пометкой UTF-8 для имён, сохраняя ярлыки (symlink) и права файлов.
import os, sys, stat, zipfile
src_dir, app_name, out = sys.argv[1], sys.argv[2], sys.argv[3]
def add(z, full, arc):
    st = os.lstat(full)
    if stat.S_ISLNK(st.st_mode):
        zi = zipfile.ZipInfo(arc); zi.create_system = 3
        zi.external_attr = (stat.S_IFLNK | 0o755) << 16
        z.writestr(zi, os.readlink(full), compress_type=zipfile.ZIP_STORED)
    elif stat.S_ISDIR(st.st_mode):
        zi = zipfile.ZipInfo(arc + "/"); zi.create_system = 3
        zi.external_attr = (stat.S_IFDIR | 0o755) << 16 | 0x10
        z.writestr(zi, b"")
    else:
        zi = zipfile.ZipInfo.from_file(full, arc); zi.create_system = 3
        zi.external_attr = (stat.S_IFREG | (st.st_mode & 0o777)) << 16
        zi.compress_type = zipfile.ZIP_DEFLATED
        with open(full, "rb") as f: z.writestr(zi, f.read(), compresslevel=6)
with zipfile.ZipFile(out, "w", allowZip64=True) as z:
    root = os.path.join(src_dir, app_name)
    add(z, root, app_name)
    for d, dirs, files in os.walk(root):
        dirs.sort(); files.sort()
        for n in dirs + files:
            full = os.path.join(d, n)
            arc = os.path.relpath(full, src_dir)
            add(z, full, arc)
            # os.walk не заходит внутрь ярлыков на папки: так и нужно
print("готово:", out)
