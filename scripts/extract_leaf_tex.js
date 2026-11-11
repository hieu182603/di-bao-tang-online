const fs = require("fs");

const buf = fs.readFileSync("Frontend/models/tree_shade.glb");
const chunk0Length = buf.readUInt32LE(12);
const jsonStr = buf.toString("utf8", 20, 20 + chunk0Length);
const gltf = JSON.parse(jsonStr);

// Binary chunk is at 20 + chunk0Length + 8
const binChunkOffset = 20 + chunk0Length + 8;

const leafMat = gltf.materials.find(m => m.name === "normal_leaves");
console.log("leafMat:", JSON.stringify(leafMat));

const texIndex = leafMat.pbrMetallicRoughness.baseColorTexture.index;
const tex = gltf.textures[texIndex];
const imgIndex = tex.source;
const img = gltf.images[imgIndex];
console.log("Image:", img);

const bufferView = gltf.bufferViews[img.bufferView];
console.log("bufferView:", bufferView);

const imgBuf = buf.slice(binChunkOffset + bufferView.byteOffset, binChunkOffset + bufferView.byteOffset + bufferView.byteLength);
fs.writeFileSync("C:/Users/os/.gemini/antigravity/brain/63d4dab1-9926-4855-8ee9-06c5526f34b4/leaf_tex.png", imgBuf);
console.log("Saved leaf_tex.png, size:", imgBuf.length);

