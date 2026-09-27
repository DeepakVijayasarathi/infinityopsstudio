type Cookie = { name: string; value: string };

const store = new Map<string, Cookie>();

/** Minimal implementation of the Next.js cookie store used by server code under test. */
export const cookieJar = {
  get: (name: string) => store.get(name),
  getAll: () => [...store.values()],
  has: (name: string) => store.has(name),
  set: (name: string | { name: string; value: string }, value?: string) => {
    const c = typeof name === "string" ? { name, value: value ?? "" } : { name: name.name, value: name.value };
    if (c.value === "") store.delete(c.name);
    else store.set(c.name, c);
  },
  delete: (name: string) => store.delete(name),
};

export function clearCookies() {
  store.clear();
}

export const headerBag = new Headers({ "user-agent": "vitest", "x-forwarded-for": "127.0.0.1" });
