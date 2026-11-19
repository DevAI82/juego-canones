// ============================================================================
// 3D WebGL GRAPHICS ENGINE FOR JUEGO CAÑONES (RTS COMMAND & CONQUER)
// Powered by Three.js (r128)
// Provides full 3D isometric battlefield, PBR lighting, dynamic shadows,
// procedural sci-fi buildings with animated parts, multi-faceted crystal spires,
// tracked vehicles, autonomous harvesters with mining lasers, and combat FX.
// ============================================================================

import * as THREE from "./three.module.js";
import { isVisible, isExplored } from "./fog.js";
import { GLTFLoader } from "./GLTFLoader.js";
import { SPRITE_UNITS, SPRITE_TOWERS, SPRITE_BUILDINGS, BUILDING_MODEL_SCALE, SPRITE_CRYSTALS, createUnitVisuals } from "./unitSprites.js";

export function createRts3DRenderer(options) {
  const {
    container,
    getState,
    getCamera,
    getZoom,
    onWorldClick,
    onWorldRightClick,
    canvasWidth = 1200,
    canvasHeight = 750,
  } = options;

  let enabled = false;
  let renderer = null;
  let scene = null;
  let camera = null;
  let sunLight = null;
  let ambientLight = null;
  let groundMesh = null;
  let animFrameId = null;

  // Object pools / caches keyed by ID
  const buildingMeshes = new Map(); // id -> THREE.Group
  const unitMeshes = new Map();     // id -> THREE.Group
  const fieldMeshes = new Map();    // id -> THREE.Group
  const projectileMeshes = new Map();
  const activeExplosions = [];      // array of explosion objects

  // The army's models (tools/blender/units.py), by unit type once loaded, and
  // how each unit on the field looks right now (unitSprites.js): the same
  // easing, aiming, rolling and walking as the 2D game's sprites.
  const unitModels = {};
  const unitVisuals = createUnitVisuals();

  // Under this scene's lights a Blender model's paint comes out washed out,
  // and with no sky to reflect its steel goes black: tone both down.
  function toneDown(root, by = 0.6) {
    const toned = new Set();
    root.traverse((o) => {
      if (!o.isMesh || !o.material || toned.has(o.material)) return;
      toned.add(o.material);
      o.material.color.multiplyScalar(by);
      o.material.metalness = Math.min(o.material.metalness, 0.3);
    });
  }

  // The turrets' models (tools/blender/towers.py), by "turret_<type>".
  const turretModels = {};
  const TURRET_SCALE = 0.88; // as the 2D view's RTS_TURRET_SCALE

  function loadUnitModels() {
    const loader = new GLTFLoader();
    const load = (url, into, key) => {
      loader.load(url, (gltf) => {
        toneDown(gltf.scene);
        into[key] = gltf.scene;
      }, undefined, () => {});
    };
    for (const [type, def] of Object.entries(SPRITE_UNITS)) load(def.model, unitModels, type);
    for (const [type, def] of Object.entries(SPRITE_TOWERS)) load(def.model, turretModels, `turret_${type}`);
    for (const [type, def] of Object.entries(SPRITE_BUILDINGS)) load(def.model, buildingModels, type);
    SPRITE_CRYSTALS.amber.forEach((c, i) => load(c.model, crystalModels.amber, i));
    SPRITE_CRYSTALS.cyan.forEach((c, i) => load(c.model, crystalModels.cyan, i));
  }

  // The base's buildings' models (tools/blender/rts.py), by type, and the
  // ore crystals' clusters.
  const buildingModels = {};
  const crystalModels = { amber: [], cyan: [] };

  // A building from its loaded model, or null while it hasn't arrived. Its
  // parts that move keep their names: the headquarters' radar, the wind
  // turbine's rotor, the laboratory's two rings.
  function createModelBuilding(b) {
    const source = buildingModels[b.type];
    if (!source) return null;
    const model = source.clone(true);
    model.scale.setScalar(BUILDING_MODEL_SCALE);
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material && o.material.name === "team") o.material = getTeamMat(b.team);
    });
    const group = new THREE.Group();
    group.add(model);
    const part = (name) => model.getObjectByName(name) || null;
    group.userData.radar = part("radar");
    group.userData.rotorX = part("rotor");
    group.userData.ring1 = part("ring1");
    group.userData.ring2 = part("ring2");
    return group;
  }

  // An ore field's crystals from their loaded models: clusters where the 2D
  // view draws them, a cyan one among every three. Null until all are in.
  function createModelCrystals(field) {
    const ready = (list, n) => list.filter(Boolean).length === n;
    if (!ready(crystalModels.amber, SPRITE_CRYSTALS.amber.length) || !ready(crystalModels.cyan, SPRITE_CRYSTALS.cyan.length)) return null;
    const clusters = [];
    for (let i = 0; i < 16; i++) {
      const angle = (i * 2.399963) + (field.id === "ore_center" ? 0.4 : 1.15);
      const dist = (field.radius * 0.15) + ((i * 47) % Math.round(field.radius * 0.68));
      const kind = i % 3 === 2 ? crystalModels.cyan : crystalModels.amber;
      const cluster = kind[i % kind.length].clone(true);
      cluster.scale.setScalar(BUILDING_MODEL_SCALE * (0.75 + (i % 5) * 0.12));
      cluster.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      cluster.rotation.y = i * 1.3;
      cluster.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        if (o.material && (o.material.name === "crystal" || o.material.name === "core")) {
          o.material.emissive = o.material.color.clone().multiplyScalar(0.55);
        }
      });
      clusters.push(cluster);
    }
    return clusters;
  }

  // A turret built from its loaded model (base > turret > barrel, facing
  // +x), or null while it hasn't arrived.
  function createModelTurret(b) {
    const source = turretModels[b.type];
    if (!source) return null;
    const def = SPRITE_TOWERS[b.type.replace("turret_", "")];
    const model = source.clone(true);
    model.scale.setScalar(def.pxPerMetre * TURRET_SCALE);
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material && o.material.name === "team") o.material = getTeamMat(b.team);
    });
    const group = new THREE.Group();
    group.add(model);
    group.userData.modelTurret = model.getObjectByName("turret") || null;
    return group;
  }

  // A unit built from its loaded model, or null while it hasn't arrived.
  // The model is in metres, facing +x; its parts keep their names: wheel_*,
  // turret > barrel, leg_L > shin_L, leg_R > shin_R.
  function createModelUnit(u) {
    const def = SPRITE_UNITS[u.type];
    const source = unitModels[u.type];
    if (!def || !source) return null;
    const model = source.clone(true);
    model.scale.setScalar(def.pxPerMetre);
    const wheels = [];
    const tracks = [];
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material && o.material.name === "team") o.material = getTeamMat(u.team);
      }
      if (o.name.startsWith("wheel_")) wheels.push(o);
      if (o.name.startsWith("track_")) {
        o.userData.restX = o.position.x;
        tracks.push(o);
      }
    });
    const group = new THREE.Group();
    group.add(model);
    const part = (name) => model.getObjectByName(name) || null;
    const barrel = part("barrel");
    group.userData = {
      modelled: true,
      def,
      wheels,
      tracks,
      turretPart: part("turret"),
      barrel,
      barrelX: barrel ? barrel.position.x : 0,
      legs: [part("leg_L"), part("leg_R")],
      shins: [part("shin_L"), part("shin_R")],
    };
    return group;
  }

  // Move a model unit's parts for this frame. A turn about Blender's y axis
  // (a wheel rolling forward, a leg swinging back) is one about -z here.
  function animateModelUnit(mesh, u, dt) {
    const { def, wheels, tracks, turretPart, barrel, barrelX, legs, shins } = mesh.userData;
    const v = unitVisuals.update(u, dt, null);
    mesh.rotation.y = -v.heading;
    if (turretPart) turretPart.rotation.y = -(v.turret - v.heading);
    if (barrel) barrel.position.x = barrelX - v.recoil * 0.3;
    if (def.wheelRadius) {
      const turn = -v.roll / (def.wheelRadius * def.pxPerMetre);
      for (const w of wheels) w.rotation.z = turn;
    }
    if (def.trackPitch) {
      // The tread plates slide forward a pitch and start over.
      const slide = ((v.roll / def.pxPerMetre) % def.trackPitch + def.trackPitch) % def.trackPitch;
      for (const t of tracks) t.position.x = t.userData.restX + slide;
    }
    if (legs[0] && legs[1]) {
      const phase = (v.roll / def.rollCycle) * Math.PI * 2;
      const swing = v.moving ? Math.sin(phase) : 0;
      const bend = v.moving ? Math.cos(phase) : 0;
      legs[0].rotation.z = 0.59 * swing;
      legs[1].rotation.z = -0.59 * swing;
      if (shins[0]) shins[0].rotation.z = -1.01 * Math.max(0, bend);
      if (shins[1]) shins[1].rotation.z = -1.01 * Math.max(0, -bend);
    }
  }

  // Shared Geometries & Materials (instanced / reused for high performance)
  let mats = {};
  let geoms = {};

  function initMaterials() {
    mats = {
      ground: new THREE.MeshStandardMaterial({
        color: 0x1e2d27,
        roughness: 0.85,
        metalness: 0.1,
      }),
      blueTeam: new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        metalness: 0.65,
        roughness: 0.35,
      }),
      blueTeamBright: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.45,
        metalness: 0.5,
        roughness: 0.2,
      }),
      redTeam: new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        metalness: 0.65,
        roughness: 0.35,
      }),
      redTeamBright: new THREE.MeshStandardMaterial({
        color: 0xf87171,
        emissive: 0xb91c1c,
        emissiveIntensity: 0.45,
        metalness: 0.5,
        roughness: 0.2,
      }),
      armorDark: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.85,
        roughness: 0.35,
      }),
      steel: new THREE.MeshStandardMaterial({
        color: 0x64748b,
        metalness: 0.9,
        roughness: 0.25,
      }),
      concrete: new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.15,
        roughness: 0.9,
      }),
      concretePlinth: new THREE.MeshStandardMaterial({
        color: 0x1e2430,
        metalness: 0.2,
        roughness: 0.8,
      }),
      solarCell: new THREE.MeshStandardMaterial({
        color: 0x0369a1,
        emissive: 0x0284c7,
        emissiveIntensity: 0.25,
        metalness: 0.85,
        roughness: 0.15,
      }),
      chrome: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.95,
        roughness: 0.15,
      }),
      treadRubber: new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.2,
        roughness: 0.95,
      }),
      glassVisor: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.5,
        metalness: 0.3,
        roughness: 0.1,
        transparent: true,
        opacity: 0.8,
      }),
      // Crystalline minerals (Amber and rare Cyan)
      crystalAmber: new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xd97706,
        emissiveIntensity: 0.7,
        metalness: 0.15,
        roughness: 0.15,
      }),
      crystalAmberDark: new THREE.MeshStandardMaterial({
        color: 0xb45309,
        emissive: 0x78350f,
        emissiveIntensity: 0.4,
        metalness: 0.2,
        roughness: 0.25,
      }),
      crystalCyan: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.75,
        metalness: 0.15,
        roughness: 0.15,
      }),
      laserBeam: new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.85,
      }),
      laserCore: new THREE.MeshBasicMaterial({
        color: 0xffffff,
      }),
      hazardChevrons: new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xca8a04,
        emissiveIntensity: 0.3,
        roughness: 0.5,
      }),
    };

    geoms = {
      box1: new THREE.BoxGeometry(1, 1, 1),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
      sphere: new THREE.SphereGeometry(1, 16, 16),
      cone: new THREE.ConeGeometry(1, 1, 6),
      torus: new THREE.TorusGeometry(1, 0.2, 8, 24),
    };
  }

  // ==========================================================================
  // INITIALIZATION & SCENE SETUP
  // ==========================================================================
  function init() {
    if (renderer) return;

    initMaterials();

    // 1. Scene & Tactical Fog
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06090e);
    scene.fog = new THREE.FogExp2(0x06090e, 0.00035);

    // 2. Camera: Isometric RTS Tilted Perspective
    const aspect = container.clientWidth / (container.clientHeight || 1);
    camera = new THREE.PerspectiveCamera(46, aspect, 5, 6000);
    camera.position.set(1024, 800, 1500);
    camera.lookAt(1024, 0, 1024);

    // 3. WebGL Renderer with High-DPI & Shadow Maps
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;

    renderer.domElement.id = "rts-webgl-canvas";
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.left = "0";
    renderer.domElement.style.top = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "none";
    renderer.domElement.style.zIndex = "1";
    renderer.domElement.style.pointerEvents = "none";
    if (container.firstChild) {
      container.insertBefore(renderer.domElement, container.firstChild);
    } else {
      container.appendChild(renderer.domElement);
    }

    // 4. Tactical Lighting
    ambientLight = new THREE.AmbientLight(0xcfd8dc, 0.65);
    scene.add(ambientLight);

    // Primary Sun Light with Real-time Shadows
    sunLight = new THREE.DirectionalLight(0xfffbeb, 1.35);
    sunLight.position.set(1200, 1800, 800);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 200;
    sunLight.shadow.camera.far = 3800;
    const shadowDist = 1400;
    sunLight.shadow.camera.left = -shadowDist;
    sunLight.shadow.camera.right = shadowDist;
    sunLight.shadow.camera.top = shadowDist;
    sunLight.shadow.camera.bottom = -shadowDist;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);

    // Cool Secondary Rim/Fill Light
    const fillLight = new THREE.DirectionalLight(0xbfd6ff, 0.28);
    fillLight.position.set(-600, 800, -400);
    scene.add(fillLight);

    // 5. 3D Terrain Ground Plane
    buildTerrain();

    // 6. Setup Mouse / Pointer Raycasting for Picking in 3D
    setupPointerEvents();

    loadUnitModels();
  }

  function buildTerrain() {
    const worldSize = 2048;
    const groundGeo = new THREE.PlaneGeometry(worldSize, worldSize, 32, 32);
    groundGeo.rotateX(-Math.PI / 2);

    // The map's flat ground (tools/blender/maps/level3_layout.py): what
    // stands on it is not painted here but stood on it below, as a model.
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load("assets/maps/level3_ground.jpg", (tex) => {
      tex.encoding = THREE.sRGBEncoding;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      mats.ground.map = tex;
      // The picture's own colours, in daylight: the dark tint is only for
      // the moment before it loads.
      mats.ground.color.set(0xa6a6a6);
      mats.ground.metalness = 0;
      mats.ground.roughness = 0.95;
      mats.ground.needsUpdate = true;
    });

    groundMesh = new THREE.Mesh(groundGeo, mats.ground);
    groundMesh.position.set(worldSize / 2, -1, worldSize / 2);
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Border extension mesh beyond 2048x2048 so edges blend smoothly into dark perimeter
    const borderGeo = new THREE.PlaneGeometry(worldSize * 2.5, worldSize * 2.5);
    borderGeo.rotateX(-Math.PI / 2);
    const borderMat = new THREE.MeshStandardMaterial({
      color: 0x08100c,
      roughness: 0.95,
      metalness: 0.1,
    });
    const borderMesh = new THREE.Mesh(borderGeo, borderMat);
    borderMesh.position.set(worldSize / 2, -2, worldSize / 2);
    borderMesh.receiveShadow = true;
    scene.add(borderMesh);

    // The town itself -- the fortress wall, the ruins, the trees -- from the
    // same Blender scene the 2D map was rendered from. Its model is in world
    // px with the map's top edge at z = -worldSize.
    new GLTFLoader().load("assets/models/map_level3.glb", (gltf) => {
      const town = gltf.scene;
      toneDown(town, 0.75);
      town.position.set(0, 0, worldSize);
      town.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
      });
      scene.add(town);
    }, undefined, () => {});
  }

  // ==========================================================================
  // PROCEDURAL 3D SCI-FI MODELS (BUILDINGS)
  // ==========================================================================

  function getTeamMat(team, bright = false) {
    if (team === "red") return bright ? mats.redTeamBright : mats.redTeam;
    return bright ? mats.blueTeamBright : mats.blueTeam;
  }

  // Base Headquarters (HQ Command Center)
  function createHqModel(team) {
    const group = new THREE.Group();
    const tMat = getTeamMat(team);

    // 1. Heavy stepped concrete plinth
    const plinth = new THREE.Mesh(geoms.box1, mats.concretePlinth);
    plinth.scale.set(78, 8, 78);
    plinth.position.y = 4;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    // 2. Primary command bunker body
    const body = new THREE.Mesh(geoms.box1, mats.armorDark);
    body.scale.set(58, 16, 58);
    body.position.y = 16;
    body.castShadow = true;
    group.add(body);

    // 3. Central command dome
    const dome = new THREE.Mesh(geoms.sphere, tMat);
    dome.scale.set(16, 12, 16);
    dome.position.set(-8, 24, -8);
    dome.castShadow = true;
    group.add(dome);

    // Glowing cyan observation slit
    const slit = new THREE.Mesh(geoms.box1, mats.glassVisor);
    slit.scale.set(12, 3, 14);
    slit.position.set(-8, 27, 2);
    group.add(slit);

    // 4. Helipad landing deck on east wing
    const helipad = new THREE.Mesh(geoms.box1, mats.steel);
    helipad.scale.set(24, 2, 24);
    helipad.position.set(18, 25, 10);
    group.add(helipad);

    // Helipad yellow 'H' marker
    const marker = new THREE.Mesh(geoms.box1, mats.hazardChevrons);
    marker.scale.set(14, 2.2, 4);
    marker.position.set(18, 25.1, 10);
    group.add(marker);

    // 5. Rotating 3D Tactical Radar Dish
    const radarGroup = new THREE.Group();
    radarGroup.position.set(16, 26, -16);

    const mast = new THREE.Mesh(geoms.cylinder, mats.steel);
    mast.scale.set(1.5, 14, 1.5);
    mast.position.y = 7;
    radarGroup.add(mast);

    const dish = new THREE.Mesh(geoms.cone, tMat);
    dish.scale.set(10, 4, 10);
    dish.rotation.x = Math.PI * 0.4;
    dish.position.y = 14;
    dish.castShadow = true;
    radarGroup.add(dish);

    group.add(radarGroup);
    group.userData.radar = radarGroup; // animated in update

    return group;
  }

  // Solar Power Plant (Central Solar)
  function createSolarModel(team) {
    const group = new THREE.Group();
    const tMat = getTeamMat(team);

    // Base slab
    const base = new THREE.Mesh(geoms.box1, mats.concretePlinth);
    base.scale.set(56, 4, 56);
    base.position.y = 2;
    base.castShadow = true;
    group.add(base);

    // Central high-voltage inverter transformer
    const inverter = new THREE.Mesh(geoms.box1, mats.armorDark);
    inverter.scale.set(16, 14, 16);
    inverter.position.y = 9;
    group.add(inverter);

    // 4 Angled Photovoltaic Solar Arrays
    const offsets = [
      { x: -16, z: -16 },
      { x: 16, z: -16 },
      { x: -16, z: 16 },
      { x: 16, z: 16 },
    ];
    offsets.forEach((off) => {
      const pylon = new THREE.Mesh(geoms.cylinder, mats.steel);
      pylon.scale.set(1.2, 8, 1.2);
      pylon.position.set(off.x, 4, off.z);
      group.add(pylon);

      const panel = new THREE.Mesh(geoms.box1, mats.solarCell);
      panel.scale.set(16, 1, 12);
      panel.position.set(off.x, 10, off.z);
      panel.rotation.x = 0.45; // Tilted to face sun
      panel.castShadow = true;
      group.add(panel);
    });

    return group;
  }

  // Wind Turbine (Generador Eólico)
  function createWindModel(team) {
    const group = new THREE.Group();
    const tMat = getTeamMat(team);

    // Hexagonal foundation
    const base = new THREE.Mesh(geoms.cylinder, mats.concretePlinth);
    base.scale.set(14, 4, 14);
    base.position.y = 2;
    group.add(base);

    // Sleek tall tower pylon
    const tower = new THREE.Mesh(geoms.cylinder, mats.steel);
    tower.scale.set(3, 52, 2);
    tower.position.y = 28;
    tower.castShadow = true;
    group.add(tower);

    // Nacelle housing on top
    const nacelle = new THREE.Mesh(geoms.box1, tMat);
    nacelle.scale.set(6, 6, 14);
    nacelle.position.set(0, 54, 2);
    group.add(nacelle);

    // Rotating 3-Blade Aerofoil Rotor
    const rotorGroup = new THREE.Group();
    rotorGroup.position.set(0, 54, 9);

    const hub = new THREE.Mesh(geoms.sphere, mats.steel);
    hub.scale.set(3, 3, 3);
    rotorGroup.add(hub);

    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(geoms.box1, mats.chrome);
      blade.scale.set(1.4, 26, 0.4);
      blade.position.y = 13;
      blade.rotation.z = (b * Math.PI * 2) / 3;
      rotorGroup.add(blade);
    }
    group.add(rotorGroup);
    group.userData.rotor = rotorGroup; // animated

    return group;
  }

  // Ore Refinery (Refinería con muelle de descarga)
  function createRefineryModel(team) {
    const group = new THREE.Group();
    const tMat = getTeamMat(team);

    // Heavy industrial pad
    const pad = new THREE.Mesh(geoms.box1, mats.concretePlinth);
    pad.scale.set(74, 5, 62);
    pad.position.y = 2.5;
    pad.receiveShadow = true;
    group.add(pad);

    // Main furnace & distillation hall
    const hall = new THREE.Mesh(geoms.box1, mats.armorDark);
    hall.scale.set(44, 22, 38);
    hall.position.set(-10, 13, 0);
    hall.castShadow = true;
    group.add(hall);

    // Twin chrome pressurized spherical gas tanks
    [-12, 12].forEach((zOff) => {
      const tank = new THREE.Mesh(geoms.sphere, mats.chrome);
      tank.scale.set(9, 9, 9);
      tank.position.set(-22, 12, zOff);
      tank.castShadow = true;
      group.add(tank);
    });

    // Twin industrial smokestacks
    [-6, 6].forEach((xOff) => {
      const stack = new THREE.Mesh(geoms.cylinder, mats.steel);
      stack.scale.set(2.5, 24, 2.5);
      stack.position.set(xOff - 10, 26, -10);
      stack.castShadow = true;
      group.add(stack);
    });

    // Docking Bay Platform for Harvester Unloading (Eastern side)
    const dock = new THREE.Mesh(geoms.box1, tMat);
    dock.scale.set(22, 3, 34);
    dock.position.set(22, 3.5, 0);
    dock.receiveShadow = true;
    group.add(dock);

    // Yellow runway guide lights
    const runway1 = new THREE.Mesh(geoms.box1, mats.hazardChevrons);
    runway1.scale.set(18, 0.4, 2);
    runway1.position.set(22, 5.2, -14);
    group.add(runway1);

    const runway2 = new THREE.Mesh(geoms.box1, mats.hazardChevrons);
    runway2.scale.set(18, 0.4, 2);
    runway2.position.set(22, 5.2, 14);
    group.add(runway2);

    return group;
  }

  // Barracks (Barracón Militar)
  function createBarracksModel(team) {
    const group = new THREE.Group();
    const tMat = getTeamMat(team);

    // Bunker base
    const pad = new THREE.Mesh(geoms.box1, mats.concretePlinth);
    pad.scale.set(58, 4, 48);
    pad.position.y = 2;
    group.add(pad);

    // Hardened garrison shell with angled armor
    const shell = new THREE.Mesh(geoms.box1, mats.armorDark);
    shell.scale.set(44, 15, 36);
    shell.position.y = 10;
    shell.castShadow = true;
    group.add(shell);

    // Entrance blast door with team trim
    const door = new THREE.Mesh(geoms.box1, tMat);
    door.scale.set(6, 10, 16);
    door.position.set(20, 7, 0);
    group.add(door);

    // Watchtower antenna
    const mast = new THREE.Mesh(geoms.cylinder, mats.steel);
    mast.scale.set(1, 16, 1);
    mast.position.set(-16, 20, -12);
    group.add(mast);

    return group;
  }

  // War Factory (Fábrica de Blindados)
  function createFactoryModel(team) {
    const group = new THREE.Group();
    const tMat = getTeamMat(team);

    // Concrete hangar pad
    const pad = new THREE.Mesh(geoms.box1, mats.concretePlinth);
    pad.scale.set(76, 4, 64);
    pad.position.y = 2;
    group.add(pad);

    // Massive double assembly hangar
    const hangar = new THREE.Mesh(geoms.box1, mats.armorDark);
    hangar.scale.set(58, 22, 48);
    hangar.position.y = 13;
    hangar.castShadow = true;
    group.add(hangar);

    // Twin roll-up vehicle bays
    [-14, 14].forEach((zOff) => {
      const bay = new THREE.Mesh(geoms.box1, mats.hazardChevrons);
      bay.scale.set(2, 14, 18);
      bay.position.set(29, 9, zOff);
      group.add(bay);
    });

    // Overhead gantry crane girder
    const gantry = new THREE.Mesh(geoms.box1, mats.steel);
    gantry.scale.set(54, 4, 6);
    gantry.position.set(0, 26, 0);
    group.add(gantry);

    return group;
  }

  // Tech Lab (Laboratorio de Tecnología con anillo holográfico orbital)
  function createTechLabModel(team) {
    const group = new THREE.Group();
    const tMat = getTeamMat(team);

    // Base plinth
    const pad = new THREE.Mesh(geoms.cylinder, mats.concretePlinth);
    pad.scale.set(28, 4, 28);
    pad.position.y = 2;
    group.add(pad);

    // Futuristic cybernetic spire
    const spire = new THREE.Mesh(geoms.cylinder, mats.armorDark);
    spire.scale.set(10, 36, 10);
    spire.position.y = 20;
    spire.castShadow = true;
    group.add(spire);

    // Glowing core crystal
    const core = new THREE.Mesh(geoms.sphere, mats.blueTeamBright);
    core.scale.set(7, 7, 7);
    core.position.y = 38;
    group.add(core);

    // Orbiting Holographic Rings (animated)
    const ring1 = new THREE.Mesh(geoms.torus, mats.glassVisor);
    ring1.scale.set(14, 14, 14);
    ring1.position.y = 38;
    ring1.rotation.x = Math.PI * 0.35;
    group.add(ring1);

    const ring2 = new THREE.Mesh(geoms.torus, mats.crystalCyan);
    ring2.scale.set(18, 18, 18);
    ring2.position.y = 38;
    ring2.rotation.y = Math.PI * 0.4;
    group.add(ring2);

    group.userData.ring1 = ring1;
    group.userData.ring2 = ring2;

    return group;
  }

  // Defensive Turrets (Torretas Básica, Doble y Láser)
  function createTurretModel(b) {
    const group = new THREE.Group();
    const tMat = getTeamMat(b.team);

    // Concrete base mount
    const mount = new THREE.Mesh(geoms.cylinder, mats.concretePlinth);
    mount.scale.set(16, 6, 16);
    mount.position.y = 3;
    mount.castShadow = true;
    group.add(mount);

    // Rotating Turret Head Group
    const headGroup = new THREE.Group();
    headGroup.position.y = 7;

    const turretDome = new THREE.Mesh(geoms.cylinder, tMat);
    turretDome.scale.set(10, 6, 10);
    turretDome.position.y = 3;
    turretDome.castShadow = true;
    headGroup.add(turretDome);

    if (b.type === "turret_laser") {
      // Sci-fi Laser Crystal Lens & Focusing Calipers
      const lens = new THREE.Mesh(geoms.cylinder, mats.glassVisor);
      lens.scale.set(4, 14, 4);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 4, 10);
      headGroup.add(lens);

      const emitter = new THREE.Mesh(geoms.cone, mats.blueTeamBright);
      emitter.scale.set(3, 6, 3);
      emitter.rotation.x = -Math.PI / 2;
      emitter.position.set(0, 4, 18);
      headGroup.add(emitter);
    } else if (b.type === "turret_double") {
      // Dual heavy cannon barrels
      [-3.5, 3.5].forEach((xOff) => {
        const barrel = new THREE.Mesh(geoms.cylinder, mats.steel);
        barrel.scale.set(1.6, 20, 1.6);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(xOff, 4, 12);
        barrel.castShadow = true;
        headGroup.add(barrel);
      });
    } else {
      // Single rifled cannon barrel
      const barrel = new THREE.Mesh(geoms.cylinder, mats.steel);
      barrel.scale.set(2, 18, 2);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 4, 11);
      barrel.castShadow = true;
      headGroup.add(barrel);
    }

    group.add(headGroup);
    group.userData.head = headGroup;

    return group;
  }

  // Wall Block
  function createWallModel() {
    const group = new THREE.Group();
    const wall = new THREE.Mesh(geoms.box1, mats.concrete);
    wall.scale.set(28, 14, 28);
    wall.position.y = 7;
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    const cap = new THREE.Mesh(geoms.box1, mats.steel);
    cap.scale.set(29, 2, 29);
    cap.position.y = 15;
    group.add(cap);

    return group;
  }

  // Dispatch building model creation
  function createBuilding3D(b) {
    // Its Blender model once loaded; until then a stand-in that update() swaps.
    let m = createModelBuilding(b);
    if (m) {
      // built above
    } else if (b.type === "hq") m = createHqModel(b.team);
    else if (b.type === "solar") m = createSolarModel(b.team);
    else if (b.type === "wind") m = createWindModel(b.team);
    else if (b.type === "refinery") m = createRefineryModel(b.team);
    else if (b.type === "barracks") m = createBarracksModel(b.team);
    else if (b.type === "factory") m = createFactoryModel(b.team);
    else if (b.type === "techlab") m = createTechLabModel(b.team);
    else if (b.type.startsWith("turret_")) {
      // Its Blender model once loaded; until then a stand-in that update() swaps.
      m = createModelTurret(b);
      if (!m) {
        m = createTurretModel(b);
        m.userData.standIn = true;
      }
    } else if (b.type === "wall") m = createWallModel();
    else m = createHqModel(b.team);
    if (SPRITE_BUILDINGS[b.type] && !buildingModels[b.type]) m.userData.standIn = true;

    m.position.set(b.x, 0, b.y);
    m.userData.buildingId = b.id;
    scene.add(m);
    return m;
  }

  // ==========================================================================
  // PROCEDURAL 3D SCI-FI MODELS (UNITS & HARVESTER)
  // ==========================================================================

  // Autonomous Ore Harvester (Cosechadora Industrial 3D)
  function createHarvesterModel(u) {
    const group = new THREE.Group();
    const tMat = getTeamMat(u.team);

    // 1. Dual heavy caterpillar track chassis
    const leftTrack = new THREE.Mesh(geoms.box1, mats.treadRubber);
    leftTrack.scale.set(38, 8, 8);
    leftTrack.position.set(0, 4, -12);
    leftTrack.castShadow = true;
    group.add(leftTrack);

    const rightTrack = new THREE.Mesh(geoms.box1, mats.treadRubber);
    rightTrack.scale.set(38, 8, 8);
    rightTrack.position.set(0, 4, 12);
    rightTrack.castShadow = true;
    group.add(rightTrack);

    // 2. Main armored chassis body
    const body = new THREE.Mesh(geoms.box1, mats.armorDark);
    body.scale.set(32, 10, 18);
    body.position.set(0, 7, 0);
    body.castShadow = true;
    group.add(body);

    // 3. Forward armored driver cabin with tinted visor
    const cab = new THREE.Mesh(geoms.box1, tMat);
    cab.scale.set(12, 8, 14);
    cab.position.set(8, 12, 0);
    group.add(cab);

    const visor = new THREE.Mesh(geoms.box1, mats.glassVisor);
    visor.scale.set(2, 4, 10);
    visor.position.set(14.5, 12, 0);
    group.add(visor);

    // 4. Front mining gathering scoop with rotary cutters
    const scoop = new THREE.Mesh(geoms.box1, mats.steel);
    scoop.scale.set(8, 6, 22);
    scoop.position.set(18, 4, 0);
    group.add(scoop);

    // Twin rotary cutter drills (animated when harvesting)
    const cutterLeft = new THREE.Mesh(geoms.cylinder, mats.chrome);
    cutterLeft.scale.set(3, 4, 3);
    cutterLeft.rotation.z = Math.PI / 2;
    cutterLeft.position.set(22, 4, -7);
    group.add(cutterLeft);

    const cutterRight = new THREE.Mesh(geoms.cylinder, mats.chrome);
    cutterRight.scale.set(3, 4, 3);
    cutterRight.rotation.z = Math.PI / 2;
    cutterRight.position.set(22, 4, 7);
    group.add(cutterRight);

    group.userData.cutterLeft = cutterLeft;
    group.userData.cutterRight = cutterRight;

    // 5. Rear Cargo Hopper (Fills with 3D amber crystal ore)
    const hopperFrame = new THREE.Mesh(geoms.box1, mats.steel);
    hopperFrame.scale.set(18, 9, 16);
    hopperFrame.position.set(-8, 10, 0);
    group.add(hopperFrame);

    // The physical crystal payload mesh inside the hopper:
    const orePayload = new THREE.Mesh(geoms.box1, mats.crystalAmber);
    orePayload.scale.set(16, 0.1, 14);
    orePayload.position.set(-8, 6, 0);
    group.add(orePayload);
    group.userData.orePayload = orePayload; // scales vertically with cargo load!

    // 6. Dual Active Mining Laser Beams (shown when u.state === "HARVESTING")
    const laserGroup = new THREE.Group();
    laserGroup.visible = false;

    [-6, 6].forEach((zOff) => {
      const beamGeo = new THREE.CylinderGeometry(0.8, 0.8, 42, 8);
      beamGeo.rotateZ(-Math.PI / 2);
      const beamMesh = new THREE.Mesh(beamGeo, mats.laserBeam);
      beamMesh.position.set(38, 4, zOff);
      laserGroup.add(beamMesh);
    });

    // Impact point spark flare
    const flare = new THREE.Mesh(geoms.sphere, mats.crystalAmber);
    flare.scale.set(4, 4, 4);
    flare.position.set(58, 2, 0);
    laserGroup.add(flare);

    group.add(laserGroup);
    group.userData.laserGroup = laserGroup;

    return group;
  }

  // Battle Tank (Tanque 3D)
  function createTankModel(u) {
    const group = new THREE.Group();
    const tMat = getTeamMat(u.team);

    // Dual tracks
    [-8, 8].forEach((z) => {
      const tr = new THREE.Mesh(geoms.box1, mats.treadRubber);
      tr.scale.set(26, 6, 6);
      tr.position.set(0, 3, z);
      tr.castShadow = true;
      group.add(tr);
    });

    // Hull
    const hull = new THREE.Mesh(geoms.box1, mats.armorDark);
    hull.scale.set(24, 6, 14);
    hull.position.set(0, 5, 0);
    hull.castShadow = true;
    group.add(hull);

    // Rotating 3D Turret
    const turretGroup = new THREE.Group();
    turretGroup.position.set(-1, 8, 0);

    const dome = new THREE.Mesh(geoms.cylinder, tMat);
    dome.scale.set(7, 4, 7);
    dome.position.y = 2;
    dome.castShadow = true;
    turretGroup.add(dome);

    const cannon = new THREE.Mesh(geoms.cylinder, mats.steel);
    cannon.scale.set(1.4, 18, 1.4);
    cannon.rotation.z = -Math.PI / 2;
    cannon.position.set(10, 2, 0);
    cannon.castShadow = true;
    turretGroup.add(cannon);

    group.add(turretGroup);
    group.userData.turret = turretGroup;

    return group;
  }

  // Fast Recon Buggy
  function createBuggyModel(u) {
    const group = new THREE.Group();
    const tMat = getTeamMat(u.team);

    // 4 Big off-road tires
    const wheelOffsets = [
      { x: 9, z: 8 }, { x: 9, z: -8 },
      { x: -9, z: 8 }, { x: -9, z: -8 },
    ];
    wheelOffsets.forEach((pos) => {
      const w = new THREE.Mesh(geoms.cylinder, mats.treadRubber);
      w.scale.set(3.5, 3, 3.5);
      w.rotation.x = Math.PI / 2;
      w.position.set(pos.x, 3.5, pos.z);
      w.castShadow = true;
      group.add(w);
    });

    // Tubular roll-cage chassis
    const body = new THREE.Mesh(geoms.box1, tMat);
    body.scale.set(18, 5, 11);
    body.position.set(0, 5.5, 0);
    body.castShadow = true;
    group.add(body);

    const gun = new THREE.Mesh(geoms.cylinder, mats.steel);
    gun.scale.set(0.8, 10, 0.8);
    gun.rotation.z = -Math.PI / 2;
    gun.position.set(5, 9, 0);
    group.add(gun);

    return group;
  }

  // Combat Motorcycle (Moto)
  function createMotorcycleModel(u) {
    const group = new THREE.Group();
    const tMat = getTeamMat(u.team);

    // Front & rear wheels
    [-6, 6].forEach((x) => {
      const w = new THREE.Mesh(geoms.cylinder, mats.treadRubber);
      w.scale.set(2.8, 2, 2.8);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 2.8, 0);
      group.add(w);
    });

    // Sleek aerodynamic body
    const body = new THREE.Mesh(geoms.box1, tMat);
    body.scale.set(14, 4, 4);
    body.position.set(0, 5, 0);
    group.add(body);

    return group;
  }

  // Rocket Launcher (Lanzacohetes)
  function createRocketModel(u) {
    const group = new THREE.Group();
    const tMat = getTeamMat(u.team);

    // 6 Wheels
    [-8, 0, 8].forEach((x) => {
      [-7, 7].forEach((z) => {
        const w = new THREE.Mesh(geoms.cylinder, mats.treadRubber);
        w.scale.set(3, 2.5, 3);
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 3, z);
        group.add(w);
      });
    });

    // Transport bed
    const bed = new THREE.Mesh(geoms.box1, mats.armorDark);
    bed.scale.set(24, 5, 12);
    bed.position.set(0, 5, 0);
    group.add(bed);

    // Tilted 8-Tube Missile Pod
    const pod = new THREE.Mesh(geoms.box1, tMat);
    pod.scale.set(16, 7, 10);
    pod.position.set(-2, 10, 0);
    pod.rotation.z = -0.45; // Tilted upward to launch rockets
    pod.castShadow = true;
    group.add(pod);

    return group;
  }

  // Mobile Construction Vehicle (VCM / MCV)
  function createMcvModel(u) {
    const group = new THREE.Group();
    const tMat = getTeamMat(u.team);

    // Heavy 8-wheel all-terrain chassis
    [-15, -5, 5, 15].forEach((x) => {
      [-12, 12].forEach((z) => {
        const w = new THREE.Mesh(geoms.cylinder, mats.treadRubber);
        w.scale.set(5, 3.5, 5);
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 5, z);
        w.castShadow = true;
        group.add(w);
      });
    });

    // Massive mobile factory chassis
    const hull = new THREE.Mesh(geoms.box1, mats.armorDark);
    hull.scale.set(44, 14, 22);
    hull.position.set(0, 11, 0);
    hull.castShadow = true;
    group.add(hull);

    // Folded crane arm & command superstructure
    const crane = new THREE.Mesh(geoms.box1, tMat);
    crane.scale.set(20, 8, 14);
    crane.position.set(-6, 20, 0);
    group.add(crane);

    const dish = new THREE.Mesh(geoms.cone, mats.steel);
    dish.scale.set(8, 3, 8);
    dish.rotation.x = Math.PI * 0.4;
    dish.position.set(10, 21, 0);
    group.add(dish);

    return group;
  }

  // Infantry Soldier (Soldado)
  function createSoldierModel(u) {
    const group = new THREE.Group();
    const tMat = getTeamMat(u.team);

    // Torso armor vest
    const torso = new THREE.Mesh(geoms.box1, tMat);
    torso.scale.set(2.4, 4, 1.8);
    torso.position.y = 4.5;
    torso.castShadow = true;
    group.add(torso);

    // Helmet head
    const head = new THREE.Mesh(geoms.sphere, mats.armorDark);
    head.scale.set(1.4, 1.4, 1.4);
    head.position.y = 7.5;
    group.add(head);

    // Rifle
    const gun = new THREE.Mesh(geoms.box1, mats.steel);
    gun.scale.set(4.5, 0.8, 0.6);
    gun.position.set(2.5, 5, 1);
    group.add(gun);

    return group;
  }

  function createUnit3D(u) {
    // Its Blender model if it has one and it has loaded; until then, the
    // stand-in built here, which update() swaps for the model when it arrives.
    let m = createModelUnit(u);
    if (m) {
      // built above
    } else if (u.type === "harvester") m = createHarvesterModel(u);
    else if (u.type === "tank") m = createTankModel(u);
    else if (u.type === "buggy") m = createBuggyModel(u);
    else if (u.type === "motorcycle") m = createMotorcycleModel(u);
    else if (u.type === "rocket") m = createRocketModel(u);
    else if (u.type === "mcv") m = createMcvModel(u);
    else if (u.type === "soldier") m = createSoldierModel(u);
    else m = createTankModel(u);
    if (SPRITE_UNITS[u.type] && !m.userData.modelled) m.userData.standIn = true;

    m.position.set(u.x, 0, u.y);
    m.userData.unitId = u.id;
    scene.add(m);
    return m;
  }

  // ==========================================================================
  // 3D MINERAL FIELDS (PRISMATIC CRYSTAL SPIRES & DYNAMIC GLOW)
  // ==========================================================================
  function createMineralField3D(field) {
    const group = new THREE.Group();
    group.position.set(field.x, 0, field.y);

    // 1. Dynamic Amber Core Point Light (illuminates ground & units)
    const pLight = new THREE.PointLight(0xfbbf24, 1.8, field.radius * 1.5, 1.2);
    pLight.position.set(0, 18, 0);
    group.add(pLight);
    group.userData.pointLight = pLight;

    // 2. Clusters of Multi-Faceted 3D Crystal Spires
    const count = 18;
    const crystalMeshes = [];
    for (let i = 0; i < count; i++) {
      const angle = (i * 2.399963) + 0.4;
      const dist = (field.radius * 0.12) + ((i * 43) % Math.round(field.radius * 0.65));
      const cx = Math.cos(angle) * dist;
      const cz = Math.sin(angle) * dist;
      const h = (18 + (i % 6) * 7);
      const r = (3.5 + (i % 3) * 1.8);
      const isCyan = i % 4 === 3;

      // Hexagonal cone geometry for sharp crystalline facets
      const cGeo = new THREE.ConeGeometry(r, h, 6);
      const cMat = isCyan ? mats.crystalCyan : mats.crystalAmber;
      const mesh = new THREE.Mesh(cGeo, cMat);

      mesh.position.set(cx, h / 2, cz);
      // Organic crystal tilt
      mesh.rotation.x = (Math.sin(i * 1.7) * 0.18);
      mesh.rotation.z = (Math.cos(i * 2.3) * 0.18);
      mesh.rotation.y = (i * 1.1);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      crystalMeshes.push(mesh);
    }
    group.userData.crystals = crystalMeshes;
    group.userData.cones = crystalMeshes;

    scene.add(group);
    return group;
  }

  // Swap an ore field's stand-in cones for the crystal models when they arrive.
  function upgradeMineralField(group, field) {
    if (!group.userData.cones) return;
    const clusters = createModelCrystals(field);
    if (!clusters) return;
    for (const cone of group.userData.cones) group.remove(cone);
    for (const c of clusters) group.add(c);
    group.userData.crystals = clusters;
    group.userData.cones = null;
  }

  // ==========================================================================
  // POINTER RAYCASTING (SCREEN -> 3D WORLD COORDINATES)
  // ==========================================================================
  const raycaster = new THREE.Raycaster();
  const mouseVec = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();

  function screenToWorld(clientX, clientY) {
    if (!renderer || !camera) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouseVec, camera);
    const hit = raycaster.ray.intersectPlane(groundPlane, hitPoint);
    if (!hit) return null;
    return {
      x: Math.max(0, Math.min(2048, hitPoint.x)),
      y: Math.max(0, Math.min(2048, hitPoint.z)),
    };
  }

  function setupPointerEvents() {
    const el = renderer.domElement;

    el.addEventListener("click", (evt) => {
      const pos = screenToWorld(evt.clientX, evt.clientY);
      if (pos && onWorldClick) onWorldClick(pos, evt);
    });

    el.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      const pos = screenToWorld(evt.clientX, evt.clientY);
      if (pos && onWorldRightClick) onWorldRightClick(pos, evt);
    });
  }

  // ==========================================================================
  // MAIN 3D RENDER LOOP & SYNCHRONIZATION WITH GAME STATE
  // ==========================================================================
  function update(dt, now) {
    const state = getState ? getState() : null;
    if (!state || !state.isRts) return;

    // 1. Synchronize 3D Camera with 2D Camera Viewport
    const cam2d = getCamera ? getCamera() : { x: 1024, y: 1024 };
    const curZoom = Math.max(0.4, Math.min(2.5, getZoom ? getZoom() : 1.0));

    const viewW = canvasWidth / curZoom;
    const viewH = canvasHeight / curZoom;
    const centerX = cam2d.x + viewW / 2;
    const centerZ = cam2d.y + viewH / 2;

    // Tilted isometric perspective camera tracking matching 2D vertical span
    const pitchRad = 58 * (Math.PI / 180);
    const alpha = ((camera.fov || 46) * Math.PI / 180) / 2;
    const camDist = (viewH * Math.sin(pitchRad)) / (2 * Math.tan(alpha));
    const camHeight = camDist * Math.sin(pitchRad);
    const camBack = camDist * Math.cos(pitchRad);

    camera.position.set(centerX, camHeight, centerZ + camBack);
    camera.lookAt(centerX, 0, centerZ);

    // Keep sunlight centered around player view for crisp dynamic shadows
    sunLight.position.set(centerX + 300, 1800, centerZ - 200);
    sunLight.target.position.set(centerX, 0, centerZ);
    sunLight.target.updateMatrixWorld();

    const fog = state.fog;

    // 2. Synchronize Mineral Fields (Fog of War: only explored fields visible)
    const currentFields = state.mineralFields || [];
    for (const f of currentFields) {
      let fMesh = fieldMeshes.get(f.id);
      if (!fMesh) {
        fMesh = createMineralField3D(f);
        fieldMeshes.set(f.id, fMesh);
      }
      upgradeMineralField(fMesh, f);
      const fieldVisible = !fog || isExplored(fog, f.x, f.y);
      fMesh.visible = fieldVisible;

      // Pulse field point light only when in sight/explored
      if (fieldVisible && fMesh.userData.pointLight) {
        const pct = Math.max(0.1, f.reserves / f.maxReserves);
        const pulse = Math.sin(now / 350) * 0.2 + 0.8;
        fMesh.userData.pointLight.intensity = 1.8 * pct * pulse;
      }
    }

    // 3. Synchronize Buildings (Fog of War: friendly always, enemy if explored)
    const currentBuildings = state.rtsBuildings || [];
    const activeBldIds = new Set();
    for (const b of currentBuildings) {
      if (b.hp <= 0) continue;
      activeBldIds.add(b.id);
      let bMesh = buildingMeshes.get(b.id);
      if (bMesh && bMesh.userData.standIn && (turretModels[b.type] || buildingModels[b.type])) {
        scene.remove(bMesh);
        bMesh = null;
      }
      if (!bMesh) {
        bMesh = createBuilding3D(b);
        buildingMeshes.set(b.id, bMesh);
      }
      bMesh.position.set(b.x, 0, b.y);
      bMesh.visible = b.team === "blue" || !fog || isExplored(fog, b.x, b.y);

      // Animate HQ Radar dish
      if (bMesh.userData.radar) {
        bMesh.userData.radar.rotation.y += dt * 1.6;
      }
      // Animate Wind turbine rotor
      if (bMesh.userData.rotor) {
        bMesh.userData.rotor.rotation.z += dt * 3.4;
      }
      if (bMesh.userData.rotorX) bMesh.userData.rotorX.rotation.x += dt * 3.4;
      // Animate Tech Lab holographic rings
      if (bMesh.userData.ring1 && bMesh.userData.ring2) {
        bMesh.userData.ring1.rotation.z += dt * 1.8;
        bMesh.userData.ring2.rotation.y -= dt * 2.2;
      }
      if (bMesh.userData.modelTurret && b.turretAngle !== undefined) {
        bMesh.userData.modelTurret.rotation.y = -b.turretAngle;
      }
      // Turret aim tracking
      if (bMesh.userData.head && b.turretAngle !== undefined) {
        bMesh.userData.head.rotation.y = -b.turretAngle + Math.PI / 2;
      }
    }
    // Clean up destroyed buildings
    for (const [id, m] of buildingMeshes.entries()) {
      if (!activeBldIds.has(id)) {
        scene.remove(m);
        buildingMeshes.delete(id);
      }
    }

    // 4. Synchronize Units (Fog of War: friendly always, enemy if in direct sight)
    const currentUnits = state.rtsUnits || [];
    const activeUnitIds = new Set();
    for (const u of currentUnits) {
      if (u.hp <= 0) continue;
      activeUnitIds.add(u.id);
      let uMesh = unitMeshes.get(u.id);
      if (uMesh && uMesh.userData.standIn && unitModels[u.type]) {
        scene.remove(uMesh);
        uMesh = null;
      }
      if (!uMesh) {
        uMesh = createUnit3D(u);
        unitMeshes.set(u.id, uMesh);
      }
      // Position & rotation
      uMesh.position.set(u.x, 0, u.y);
      if (uMesh.userData.modelled) animateModelUnit(uMesh, u, dt);
      else uMesh.rotation.y = -(u.angle || 0);
      uMesh.visible = u.team === "blue" || !fog || isVisible(fog, u.x, u.y);

      // Harvester specific 3D animations
      if (u.type === "harvester") {
        const loadPct = Math.max(0, Math.min(1, (u.load || u.cargo || 0) / (u.capacity || 300)));

        // Scale physical crystal payload in hopper
        if (uMesh.userData.orePayload) {
          const oreHeight = Math.max(0.1, loadPct * 8);
          uMesh.userData.orePayload.scale.y = oreHeight;
          uMesh.userData.orePayload.position.y = 6 + oreHeight / 2;
          uMesh.userData.orePayload.visible = loadPct > 0.05;
        }

        // Rotate cutters and display laser beams when harvesting
        const isHarvesting = u.state === "HARVESTING";
        if (uMesh.userData.cutterLeft && isHarvesting) {
          uMesh.userData.cutterLeft.rotation.x += dt * 12;
          uMesh.userData.cutterRight.rotation.x -= dt * 12;
        }
        if (uMesh.userData.laserGroup) {
          uMesh.userData.laserGroup.visible = isHarvesting;
        }
      }
    }
    // Clean up destroyed units
    for (const [id, m] of unitMeshes.entries()) {
      if (!activeUnitIds.has(id)) {
        scene.remove(m);
        unitMeshes.delete(id);
      }
    }
    unitVisuals.keepOnly(activeUnitIds);

    // 5. Render Scene with WebGL
    renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (!renderer || !camera) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function show() {
    enabled = true;
    if (renderer && renderer.domElement) {
      renderer.domElement.style.display = "block";
    }
  }

  function hide() {
    enabled = false;
    if (renderer && renderer.domElement) {
      renderer.domElement.style.display = "none";
    }
  }

  function toggle() {
    if (enabled) hide();
    else show();
    return enabled;
  }

  function isEnabled() {
    return enabled;
  }

  return {
    init,
    update,
    resize,
    show,
    hide,
    toggle,
    isEnabled,
    screenToWorld,
  };
}
