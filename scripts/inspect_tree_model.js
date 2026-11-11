const fs = require("fs");

const buf = fs.readFileSync("Frontend/models/tree_shade.glb");
// Parse GLB header
const magic = buf.readUInt32LE(0);
const version = buf.readUInt32LE(4);
const length = buf.readUInt32LE(8);
console.log("GLB magic:", magic.toString(16), "version:", version, "length:", length);

// Chunk 0 (JSON)
const chunk0Length = buf.readUInt32LE(12);
const chunk0Type = buf.readUInt32LE(16);
const jsonStr = buf.toString("utf8", 20, 20 + chunk0Length);
const gltf = JSON.parse(jsonStr);

console.log("Meshes count:", gltf.meshes ? gltf.meshes.length : 0);
if (gltf.meshes) {
  gltf.meshes.forEach((m, i) => console.log(`Mesh ${i}:`, m.name, "primitives:", m.primitives.length));
}
console.log("Materials count:", gltf.materials ? gltf.materials.length : 0);
if (gltf.materials) {
  gltf.materials.forEach((m, i) => {
    console.log(`Material ${i}:`, m.name, JSON.stringify(m.pbrMetallicRoughness));
    if (m.alphaMode) console.log(`  alphaMode: ${m.alphaMode}, cutoff: ${m.alphaCutoff}`);
  });
}
console.log("Images count:", gltf.images ? gltf.images.length : 0);
if (gltf.images) {
  gltf.images.forEach((img, i) => console.log(`Image ${i}:`, img.name, img.mimeType));
}

