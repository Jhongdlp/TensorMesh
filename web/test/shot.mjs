/**
 * Captura la web real en un PNG, con la interfaz puesta y sin navegador a la
 * vista. Es la fuente de la tarjeta de enlace de la portada.
 *
 * Las capturas de `public/previews/` son sólo el lienzo: salen del render
 * offline y no tienen ni cajón, ni tira de herramientas, ni ficha. Para una
 * miniatura que enseñe **el producto** —«esto es una aplicación, tiene mandos,
 * se toca»— hace falta el DOM encima del canvas, y eso sólo lo sabe montar un
 * navegador.
 *
 * Va por el protocolo de DevTools a pelo, con el `WebSocket` que ya trae Node:
 * `--screenshot` a secas dispara antes de que el visor haya dibujado nada, y
 * meter Puppeteer aquí serían 150 MB de Chromium para un archivo que se
 * regenera dos veces al año.
 *
 * Dos cosas que hay que hacer antes de disparar y que no son evidentes:
 *
 *  - **marcar la presentación como vista** (`atlas.intro.v1`), que en un perfil
 *    nuevo tapa la pantalla entera. Se hace con un script inyectado *antes* de
 *    los de la página, no navegando dos veces;
 *  - **capturar ya en 1200x630**, la proporción de la tarjeta, en vez de
 *    recortar después un 16:9: el cajón izquierdo se coloca respecto a la
 *    ventana, así que recortar lo dejaría a medias.
 *
 * En esta máquina el navegador cae al respaldo WebGL (`scene.ts`) igual que al
 * abrirlo a mano — posiciones fijas del pipeline, sin simulación. Para una foto
 * es exactamente lo mismo: la nebulosa es la que publica el pipeline.
 *
 *     node test/shot.mjs                              # portada de la nebulosa
 *     node test/shot.mjs "http://localhost:8099/hnsw/" /tmp/hnsw.png
 *
 * Necesita el sitio servido (`npm run preview`, o `python3 -m http.server` en
 * `dist/`) y un Chromium en el PATH: `brave`, `chromium` o `google-chrome`.
 */
import { spawn, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_ = process.argv[2] ?? "http://localhost:8099/embedding-nebula/";
const OUT = process.argv[3] ?? "og-ui.png";
const W = Number(process.env.SHOT_W ?? 1200);
const H = Number(process.env.SHOT_H ?? 630);
const SCALE = Number(process.env.SHOT_SCALE ?? 3);   // 3600x1890 para reescalar
const WAIT = Number(process.env.SHOT_WAIT ?? 12000); // el atlas baja 2,1 MB

const BIN = ["brave", "chromium", "chromium-browser", "google-chrome-stable", "google-chrome"]
  .find((b) => {
    try { execSync(`command -v ${b}`, { stdio: "ignore" }); return true; } catch { return false; }
  });
if (!BIN) {
  console.error("No hay ningún Chromium en el PATH (brave, chromium, google-chrome).");
  process.exit(1);
}

// Puerto al azar: con uno fijo, dos capturas seguidas se pisan —la anterior
// todavía está soltando el puerto— y la segunda muere buscando DevTools.
const PORT = 9300 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), "shot-"));

const browser = spawn(BIN, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  // Sin GPU de verdad detrás, ANGLE sobre SwiftShader es lo que hace que el
  // respaldo WebGL dibuje algo en vez de dejar el lienzo en negro.
  "--enable-unsafe-swiftshader",
  // Con `SHOT_GPU=1` se intenta el motor bueno: WebGPU sobre la Vega por
  // Vulkan. Si el navegador no lo levanta, el visor cae solo al respaldo
  // WebGL y la captura sale igual — sólo con menos malla.
  ...(process.env.SHOT_GPU ? [
    "--enable-unsafe-webgpu",
    "--enable-features=Vulkan",
    "--use-angle=vulkan",
    "--ignore-gpu-blocklist",
  ] : []),
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera a que el puerto de DevTools conteste. */
async function version() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return r.json();
    } catch { /* todavía arrancando */ }
    await sleep(250);
  }
  throw new Error("el navegador no abrió el puerto de DevTools");
}

let id = 0;
const pending = new Map();

function send(ws, method, params = {}, sessionId) {
  const msg = { id: ++id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((res, rej) => pending.set(msg.id, { res, rej }));
}

try {
  const info = await version();
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));

  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  });

  const { targetId } = await send(ws, "Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send(ws, "Target.attachToTarget", { targetId, flatten: true });
  const cmd = (method, params) => send(ws, method, params, sessionId);

  await cmd("Page.enable");
  await cmd("Runtime.enable");
  await cmd("Emulation.setDeviceMetricsOverride", {
    width: W, height: H, deviceScaleFactor: SCALE, mobile: false,
  });
  await cmd("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem("atlas.intro.v1", "1"); } catch (e) {}`,
  });

  // El cartel de ayuda (`.coach`) es un consejo de paso que se va al primer
  // clic, y mientras está se escribe justo encima de la atribución. En una
  // foto fija se lee como un fallo de maquetación, así que se apaga — y la
  // atribución, que es el único requisito legal del sitio, se lee entera.
  const hide = process.env.SHOT_HIDE ?? ".coach";
  await cmd("Page.addScriptToEvaluateOnNewDocument", {
    source: `document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = ${JSON.stringify(hide)} + "{display:none !important}";
      document.head.appendChild(s);
    });`,
  });

  console.log(`${BIN} → ${URL_}  (${W}x${H} @${SCALE}x, ${WAIT / 1000}s de espera)`);
  await cmd("Page.navigate", { url: URL_ });
  await sleep(WAIT);

  // Los mandos de render, movidos como los movería una mano: `SHOT_TUNE` es
  // una lista `clave=valor` con las claves de `Controls.tsx` (`minPx`,
  // `edgeBright`, `minEdgePx`, `range`). Los valores de casa están pensados
  // para que la sala se pueda *usar* —punto de 2 px que se acierta con el
  // ratón, malla contenida para no tapar los puntos—; una miniatura no se
  // usa, se mira de lejos y a 200 px de ancho, y ahí lo que cuenta es la
  // nebulosa: punto pequeño y aristas encendidas.
  //
  // Hay que abrir el desplegable de simulación antes: los `input` no existen
  // en el DOM mientras está plegado. Y se vuelve a cerrar antes de disparar,
  // porque el cajón de la foto es el que ve quien entra, no el de quien está
  // toqueteando los mandos.
  const tune = process.env.SHOT_TUNE;
  if (tune) {
    const { result } = await cmd("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const btn = [...document.querySelectorAll("button")]
          .find((b) => /simulaci|simulation/i.test(b.textContent || ""));
        if (!btn) return "no encuentro el desplegable de simulación";
        btn.click();
        await sleep(400);

        // Los <input> son controlados por React: asignar .value no dispara
        // nada. Hay que llamar al setter nativo y lanzar el evento a mano.
        const set = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "value").set;
        const done = [];
        for (const pair of ${JSON.stringify(tune)}.split(",")) {
          const [key, value] = pair.split("=").map((t) => t.trim());
          const label = { minPx: "punto px", edgeBright: "aristas",
                          minEdgePx: "arista mín", range: "rango" }[key];
          const row = [...document.querySelectorAll(".ctl")]
            .find((l) => l.querySelector("span")?.textContent?.trim() === label);
          const input = row?.querySelector('input[type="range"]');
          if (!input) { done.push(key + ":no está"); continue; }
          set.call(input, String(value));
          input.dispatchEvent(new Event("input", { bubbles: true }));
          await sleep(120);
          done.push(key + "=" + input.value);
        }
        await sleep(300);
        btn.click();
        return done.join(" ");
      })()`,
    });
    console.log(`  mandos → ${result.value}`);
    await sleep(1200);
  }

  // El encuadre de arranque es el percentil 95 sobre la ventana, y una ventana
  // de 1,91:1 recorta más alto que ancho: la galaxia se sale por arriba y por
  // abajo. `SHOT_WHEEL` da la rueda hacia atrás las veces que haga falta.
  // De paso cuenta como interacción, así que se lleva el cartelito de ayuda
  // que asoma sobre la atribución.
  const ticks = Number(process.env.SHOT_WHEEL ?? 0);
  for (let i = 0; i < ticks; i++) {
    await cmd("Input.dispatchMouseEvent", {
      type: "mouseWheel", x: Math.round(W * 0.6), y: Math.round(H / 2),
      deltaX: 0, deltaY: 120, pointerType: "mouse",
    });
    await sleep(160);
  }
  if (ticks) await sleep(Number(process.env.SHOT_SETTLE ?? 4000));

  const { data } = await cmd("Page.captureScreenshot", { format: "png", fromSurface: true });
  writeFileSync(OUT, Buffer.from(data, "base64"));
  console.log(`${OUT}  ${(Buffer.from(data, "base64").length / 1024).toFixed(0)} KB`);

  ws.close();
} finally {
  browser.kill();
  rmSync(profile, { recursive: true, force: true });
}
