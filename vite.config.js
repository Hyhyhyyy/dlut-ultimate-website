import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        admin: fileURLToPath(new URL("./admin.html", import.meta.url)),
        photos: fileURLToPath(new URL("./photos.html", import.meta.url)),
        debut: fileURLToPath(new URL("./debut.html", import.meta.url)),
        recruit: fileURLToPath(new URL("./recruit.html", import.meta.url)),
        qrcodes: fileURLToPath(new URL("./qrcodes.html", import.meta.url)),
      },
    },
  },
});
