import os, sys, json
BASE = "/home/user/infinityopsstudio/src/app/api/v1"
def w(path, content):
    full = os.path.join(BASE, path, "route.ts")
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        f.write(content.lstrip("\n"))
routes = json.load(open(sys.argv[1]))
for p, c in routes.items():
    w(p, c)
print(f"wrote {len(routes)} routes")
