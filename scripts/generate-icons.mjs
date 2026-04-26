import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const svgPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(path.parse(projectRoot).root, "Users", "muras", "Downloads", "Your paragraph text.svg");

const outDir = path.join(projectRoot, "build");
const pngPath = path.join(outDir, "icon.png");
const icoPath = path.join(outDir, "icon.ico");

await fs.mkdir(outDir, { recursive: true });

const svgBuffer = await fs.readFile(svgPath);

// 256x256 PNG is a good base for Windows/mac/linux icon generation.
const pngBuffer = await sharp(svgBuffer, { density: 300 })
  .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

await fs.writeFile(pngPath, pngBuffer);

// Multi-size ICO for Windows.
const icoBuffer = await pngToIco([pngBuffer]);
await fs.writeFile(icoPath, icoBuffer);

console.log("Generated:", { pngPath, icoPath, from: svgPath });
