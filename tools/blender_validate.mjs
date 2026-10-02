import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/addons/loaders/GLTFLoader.js';
import {loadAssetLibrary} from '../asset-loader-25d.mjs';

const manifestURL = new URL('../assets/25d/manifest.json', import.meta.url);
const manifest = JSON.parse(await fs.readFile(manifestURL, 'utf8'));
assert.equal(manifest.schema, 1);
assert.equal(manifest.upAxis, 'Y');
const files = [...new Set(manifest.models.map(model => model.file))];
const scenes = new Map();
let meshCount = 0, triangles = 0, bytes = 0;
for (const file of files) {
  const buffer = await fs.readFile(new URL(file, manifestURL));
  assert.equal(buffer.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(buffer.readUInt32LE(4), 2, 'glTF 2.0');
  assert.equal(buffer.readUInt32LE(8), buffer.length, 'GLB length');
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
  assert(!json.extensionsRequired?.some(extension => /draco|meshopt|basisu/i.test(extension)), 'Local library must be decoder free');
  assert(!json.images?.some(image => image.uri?.startsWith('http')), 'No external images');
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer, new URL('.', manifestURL).href);
  scenes.set(file, gltf.scene);
  bytes += buffer.length;
}
const names = new Set();
for (const entry of manifest.models) {
  assert(!names.has(entry.name), 'Unique model name'); names.add(entry.name);
  const scene = scenes.get(entry.file);
  const model = entry.node ? scene.getObjectByName(entry.node) : scene;
  assert(model, `Missing node ${entry.node}`);
  const template = model.clone(true);
  template.position.set(0,0,0);
  template.scale.multiplyScalar(entry.scale ?? 1);
  template.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(template), size = box.getSize(new THREE.Vector3());
  assert(size.x > 0 && size.y > 0 && size.z > 0, `${entry.name} has a finite volume`);
  if (entry.dimensions) {
    for (const axis of ['x','y','z']) assert(Math.abs(size[axis] - entry.dimensions[axis]) < .03, `${entry.name} ${axis} dimensions agree`);
  }
  template.traverse(child => {
    if (!child.isMesh) return;
    meshCount++;
    const position = child.geometry.attributes.position;
    assert(position?.count > 0);
    assert(child.geometry.attributes.normal?.count === position.count);
    for (const value of position.array) assert(Number.isFinite(value));
    triangles += (child.geometry.index?.count ?? position.count) / 3;
  });
}
// Exercise the same public loader/clone/instancing API used by the renderer.
// Node's file URLs are adapted here only; browsers use ordinary local HTTP fetch.
const originalFetch = globalThis.fetch, originalProgressEvent = globalThis.ProgressEvent;
let glbRequests = 0;
globalThis.ProgressEvent = class extends Event {
  constructor(type, fields) { super(type); Object.assign(this, fields); }
};
globalThis.fetch = async (request, options) => {
  const url = new URL(typeof request === 'string' ? request : request.url ?? request.href);
  if (url.protocol !== 'file:') return originalFetch(request, options);
  const buffer = await fs.readFile(url);
  if (url.pathname.endsWith('.glb')) glbRequests++;
  return new Response(buffer, {headers:{'Content-Length':String(buffer.length)}});
};
try {
  const first = loadAssetLibrary(manifestURL), second = loadAssetLibrary(manifestURL);
  assert.equal(first, second, 'Concurrent loads share a single promise');
  const library = await first;
  assert.equal(glbRequests, files.length, 'Each unique GLB is loaded once for the shared library');
  assert.equal(library.names.length, manifest.models.length);
  assert.equal(library.cloneModel('missing_model'), null);
  const cloneA = library.cloneModel('mailbox'), cloneB = library.cloneModel('mailbox');
  assert.notEqual(cloneA, cloneB, 'Independent scene objects');
  const meshA = [], meshB = [];
  cloneA.traverse(child => {if(child.isMesh) meshA.push(child);});
  cloneB.traverse(child => {if(child.isMesh) meshB.push(child);});
  assert.equal(meshA[0].geometry, meshB[0].geometry, 'Clones share geometry');
  assert.equal(meshA[0].material, meshB[0].material, 'Clones share materials');
  assert(meshA[0].userData.assetShared, 'Shared ownership explicitly marked');
  assert(library.dimensions('mailbox').y > 55);
  const parent = new THREE.Group();
  const instanced = library.addInstances('mailbox', [{x:10,y:2,z:30},{x:80,y:2,z:30,rotationY:1,scale:.8}], parent);
  assert.equal(instanced.parent, parent);
  let instances = 0;
  instanced.traverse(child => {if(child.isInstancedMesh){assert.equal(child.count,2);instances++;}});
  assert.equal(instances, meshA.length, 'One instance batch for each mesh/material');
  assert.equal(library.addInstances('mailbox', [], parent), null);
  instanced.traverse(child => {if(child.isInstancedMesh)child.dispose();});
} finally {
  globalThis.fetch = originalFetch;
  globalThis.ProgressEvent = originalProgressEvent;
}
console.log(JSON.stringify({status:'passed',models:names.size,meshes:meshCount,triangles,bytes,revision:THREE.REVISION,api:'memoized loading, shared clones, measured bounds, instanced placement',names:[...names]}, null, 2));
