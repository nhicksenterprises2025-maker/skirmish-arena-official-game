import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from './vendor/addons/utils/SkeletonUtils.js';

// The assets are optional presentation data. They never create collision objects
// or alter the authoritative match. All URLs are local and work offline in the PWA.
const defaultManifest = new URL('./assets/25d/manifest.json', import.meta.url);
const libraries = new Map();

/** Load the current library once. Rejected loads can be retried. */
export function loadAssetLibrary(manifestURL = defaultManifest) {
  const url = new URL(manifestURL, import.meta.url).href;
  if (!libraries.has(url)) {
    const promise = readLibrary(url).catch(error => { libraries.delete(url); throw error; });
    libraries.set(url, promise);
  }
  return libraries.get(url);
}

async function readLibrary(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`2.5D asset manifest unavailable (${response.status})`);
  const manifest = await response.json();
  if (manifest.schema !== 1 || !Array.isArray(manifest.models)) throw new Error('Unsupported 2.5D asset manifest');
  const loader = new GLTFLoader(), templates = new Map(), sizes = new Map(), clips = new Map();
  const sources = [...new Set(manifest.models.map(model => new URL(model.file, url).href))];
  const sourceScenes = new Map(await Promise.all(sources.map(async source => {
    const gltf = await loader.loadAsync(source);
    return [source, gltf];
  })));
  for (const entry of manifest.models) {
    const gltf = sourceScenes.get(new URL(entry.file, url).href);
    const object = entry.node ? gltf.scene.getObjectByName(entry.node) : gltf.scene;
    if (!object) throw new Error(`Missing asset node: ${entry.node}`);
    const template = cloneSkeleton(object);
    template.position.set(0, 0, 0);
    template.scale.multiplyScalar(entry.scale ?? 1);
    template.rotation.y += entry.rotationY ?? 0;
    template.name = entry.name;
    template.userData.assetShared = true;
    template.traverse(child => {
      if (child.isMesh) {
        child.geometry.userData.sarShared=true;
        for(const material of Array.isArray(child.material)?child.material:[child.material])material.userData.sarShared=true;
        child.castShadow = entry.castShadow !== false;
        child.receiveShadow = true;
        child.userData.assetShared = true;
      }
    });
    template.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(template), size = bounds.getSize(new THREE.Vector3());
    sizes.set(entry.name, Object.freeze({ x: size.x, y: size.y, z: size.z }));
    templates.set(entry.name, template);
    clips.set(entry.name, gltf.animations || []);
  }
  return Object.freeze({
    version: manifest.version,
    names: Object.freeze([...templates.keys()]),
    entries: Object.freeze(manifest.models),
    cloneAttachment(name,part) {
      const entry=manifest.models.find(value=>value.name===name), node=templates.get(name)?.getObjectByName(entry?.attachments?.[part]);
      if(!node)return null;
      const copy=cloneSkeleton(node);copy.position.set(0,0,0);copy.quaternion.identity();copy.scale.setScalar(1);return copy;
    },
    dimensions(name) { return sizes.get(name) || null; },
    animations(name) { return clips.get(name) || []; },
    cloneModel(name) {
      const template = templates.get(name);
      return template ? cloneSkeleton(template) : null;
    },
    /** Static set dressing: one draw call per mesh/material regardless of count.
     * placements = [{x,y,z,rotationY,scale}] where scale is scalar or {x,y,z}.
     * Returned group owns instance buffers; geometry and materials stay shared.
     */
    addInstances(name, placements, parent) {
      const template = templates.get(name);
      if (!template || !placements.length) return null;
      const group = new THREE.Group(); group.name = `${name}_instances`;
      const transform = new THREE.Object3D(), instanceMatrix = new THREE.Matrix4();
      template.updateMatrixWorld(true);
      template.traverse(source => {
        if (!source.isMesh || source.isSkinnedMesh) return;
        const instances = new THREE.InstancedMesh(source.geometry, source.material, placements.length);
        instances.name = source.name;
        instances.castShadow = source.castShadow;
        instances.receiveShadow = source.receiveShadow;
        instances.userData.assetShared = true;
        for (let i = 0; i < placements.length; i++) {
          const item = placements[i], scale = item.scale ?? 1;
          transform.position.set(item.x ?? 0, item.y ?? 0, item.z ?? 0);
          transform.rotation.set(0, item.rotationY ?? 0, 0);
          if (typeof scale === 'number') transform.scale.setScalar(scale);
          else transform.scale.set(scale.x ?? 1, scale.y ?? 1, scale.z ?? 1);
          transform.updateMatrix();
          instanceMatrix.multiplyMatrices(transform.matrix, source.matrixWorld);
          instances.setMatrixAt(i, instanceMatrix);
        }
        instances.instanceMatrix.needsUpdate = true;
        instances.computeBoundingBox(); instances.computeBoundingSphere();
        group.add(instances);
      });
      parent?.add(group);
      return group;
    }
  });
}
