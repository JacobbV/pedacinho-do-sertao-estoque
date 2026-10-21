const CACHE = "pedacinho-estoque-v2";
const ARQUIVOS = [
  "/",
  "/static/style.css",
  "/static/app.js",
  "/static/manifest.json",
  "/static/icon.svg"
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS)));
});

self.addEventListener("fetch", (evento) => {
  if (evento.request.url.includes("/api/")) return;

  evento.respondWith(
    caches.match(evento.request).then((arquivo) =>
      arquivo || fetch(evento.request)
    )
  );
});