import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// --- Basic setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Get intro overlay and HUD
const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud'); // not strictly needed in JS, but ok

// music
const bgm = new Audio('./bgm.wav');
bgm.loop = true;   // 自动循环播放
bgm.volume = 0.45; // 建议音量
let bgmStarted = false;

// --- Floor ---
const floorGeometry = new THREE.PlaneGeometry(100, 100);
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xd2b48c });
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1;
scene.add(floor);

// --- Lights ---
const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// --- Room settings: hex walls + ceiling ---
const roomSize = 20;
const wallHeight = roomSize;
const halfHeight = wallHeight / 2 - 1;
const sideLength = roomSize / 2;

// Wall material (honey-like)
const wallMaterial = new THREE.MeshStandardMaterial({
  color: 0xffa500,
  side: THREE.DoubleSide
});

// Ceiling material (darker)
const ceilingMaterial = new THREE.MeshStandardMaterial({
  color: 0x33ccff,
  side: THREE.DoubleSide
});

// Shared wall geometry
const wallGeometry = new THREE.PlaneGeometry(sideLength, wallHeight);

// All walls stored here
const walls = [];

// Helper: create a wall
function createWall(position, rotation) {
  const wall = new THREE.Mesh(wallGeometry, wallMaterial);
  wall.position.set(position.x, position.y, position.z);
  wall.rotation.set(rotation.x, rotation.y, rotation.z);
  scene.add(wall);
  walls.push(wall);
  return wall;
}

// Ceiling
const ceilingGeometry = new THREE.PlaneGeometry(100, 100);
const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.y = roomSize - 1;
scene.add(ceiling);

// --- First hexagon room ---
// Distance from center to each side (apothems)
const radius = (sideLength * Math.sqrt(3)) / 2;

// Create 6 walls for the first hex (center at (0,0))
for (let i = 0; i < 6; i++) {
  const angle = (i * Math.PI) / 3; // 60° per wall

  const wallX = radius * Math.sin(angle);
  const wallZ = radius * Math.cos(angle);
  const rotationY = angle; // face inward

  createWall(
    new THREE.Vector3(wallX, halfHeight, wallZ),
    new THREE.Vector3(0, rotationY, 0)
  );
}

// --- "Gate" wall & second/third/fourth room flags ---
const gateWallIndex = 0;      // which wall is passable from room 1 -> room 2
let wallPassed = false;       // whether we have left the first hex through the gate

let secondRoomCreated = false;
let secondRoomCenter = null;  // { x, z } center of second hex, once created

let thirdRoomCreated = false;
let thirdRoomCenter = null;   // { x, z } center of third hex, once created

let fourthRoomCreated = false;
let fourthRoomCenter = null;  // { x, z } center of fourth hex, once created

// --- Queen Bee (QBee) & game end flag ---
let queenModel = null;
const queenPosition = new THREE.Vector3();
let gameEnded = false;

// --- First-person controls ---
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

// Start at center of first room, eye height
camera.position.set(0, 1.6, 0);

// Click to lock pointer and hide intro overlay
document.body.addEventListener('click', () => {
  // 游戏结束后就不要再重新开始
  if (gameEnded) return;
  if (!bgmStarted) {
    bgmStarted = true;
    bgm.play().catch(() => {
      console.warn("BGM cannot autoplay until user interaction");
    });
  }
  controls.lock();
  if (overlay) {
    overlay.style.display = 'none';
  }
});

// --- Movement state ---
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
const speed = 5.0;

// Keyboard events
document.addEventListener('keydown', (event) => {
  switch (event.code) {
    case 'KeyW':
      moveForward = true;
      break;
    case 'KeyS':
      moveBackward = true;
      break;
    case 'KeyA':
      moveLeft = true;
      break;
    case 'KeyD':
      moveRight = true;
      break;
  }
});

document.addEventListener('keyup', (event) => {
  switch (event.code) {
    case 'KeyW':
      moveForward = false;
      break;
    case 'KeyS':
      moveBackward = false;
      break;
    case 'KeyA':
      moveLeft = false;
      break;
    case 'KeyD':
      moveRight = false;
      break;
  }
});

// --- Player model: Bee ---
let playerModel; // Bee model

const loader = new GLTFLoader();
loader.load(
  './Bee.glb',
  function (gltf) {
    playerModel = gltf.scene;

    // Scale
    playerModel.scale.set(0.2, 0.2, 0.2);

    // Offset relative to camera (slightly lower and forward)
    playerModel.position.set(0, -1, -1.3);

    // Face sideways: rotate around Y
    playerModel.rotation.y = THREE.MathUtils.degToRad(90);

    // Attach to camera / controls
    controls.getObject().add(playerModel);

    console.log('Bee model loaded');
  },
  undefined,
  function (error) {
    console.error('Failed to load Bee model:', error);
  }
);

// --- Animation loop ---
const clock = new THREE.Clock();
const playerWorldPosition = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  if (controls.isLocked && !gameEnded) {
    // Apply damping
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;

    // Direction from keys
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    // Acceleration
    if (moveForward || moveBackward) {
      velocity.z += direction.z * speed + 5 * delta;
    }
    if (moveLeft || moveRight) {
      velocity.x += direction.x * speed + 5 * delta;
    }

    // Move camera
    controls.moveRight(velocity.x * delta);
    controls.moveForward(velocity.z * delta);

    const cameraPos = controls.getObject().position;

    // Get Bee world position (player center)
    if (playerModel) {
      playerModel.getWorldPosition(playerWorldPosition);
    } else {
      playerWorldPosition.copy(cameraPos);
    }
    const playerPos = playerWorldPosition;

    // --- Y-axis limits ---
    const minCameraHeight = 1.0;
    const ceilingLimit = roomSize - 1.5;

    if (cameraPos.y < minCameraHeight) cameraPos.y = minCameraHeight;
    if (cameraPos.y > ceilingLimit) cameraPos.y = ceilingLimit;

    // --- XZ collision / room boundaries ---

    const radiusLimit = 8.5; // almost inscribed circle radius

    // First room center at (0,0)
    const dx1 = playerPos.x;
    const dz1 = playerPos.z;
    const dist1 = Math.sqrt(dx1 * dx1 + dz1 * dz1);

    // 1) Use first room only to detect "gate" passage
    if (!wallPassed) {
      const angleFromCenter1 = Math.atan2(playerPos.x, playerPos.z); // same convention as when creating walls
      const gateCenterAngle = (gateWallIndex * Math.PI) / 3;
      const gateHalfAngle = Math.PI / 6; // ±30°

      let diff = angleFromCenter1 - gateCenterAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // normalize to [-PI, PI]

      const inGateSectorFromRoom1 = Math.abs(diff) < gateHalfAngle;

      // When you go beyond the first hex through the gate direction:
      if (inGateSectorFromRoom1 && dist1 > radiusLimit + 0.5) {
        wallPassed = true;

        // Immediately create the second hex room (no rising animation)
        if (!secondRoomCreated) {
          secondRoomCreated = true;

          // Direction of the gate wall (room1 -> room2)
          const gateAngle = (gateWallIndex * Math.PI) / 3;

          // Second room center along the gate normal
          const center2X = 2 * radius * Math.sin(gateAngle);
          const center2Z = 2 * radius * Math.cos(gateAngle);

          secondRoomCenter = { x: center2X, z: center2Z };

          // Create second hex walls
          for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const wallX = center2X + radius * Math.sin(angle);
            const wallZ = center2Z + radius * Math.cos(angle);
            const rotationY = angle;

            createWall(
              new THREE.Vector3(wallX, halfHeight, wallZ),
              new THREE.Vector3(0, rotationY, 0)
            );
          }

          // --- Create third room connected to a chosen wall of the second room ---
          // second room 有 6 面墙（0~5），可以改这个索引来换第三间连接的位置
          const thirdRoomWallIndexOnSecondRoom = 2; // 0~5 之间任意数（已有第三房间）
          const thirdAngle = (thirdRoomWallIndexOnSecondRoom * Math.PI) / 3;
          const center3X = center2X + 2 * radius * Math.sin(thirdAngle);
          const center3Z = center2Z + 2 * radius * Math.cos(thirdAngle);

          thirdRoomCenter = { x: center3X, z: center3Z };
          thirdRoomCreated = true;

          // 创建第三个六边形房间的 6 面墙
          for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const wallX = center3X + radius * Math.sin(angle);
            const wallZ = center3Z + radius * Math.cos(angle);
            const rotationY = angle;

            createWall(
              new THREE.Vector3(wallX, halfHeight, wallZ),
              new THREE.Vector3(0, rotationY, 0)
            );
          }

          // --- NEW: Create a fourth room from another wall of the second room ---
          // 再从第二个房间的另一面墙接出第四个房间（形成一个分叉）
          const fourthRoomWallIndexOnSecondRoom = 4; // 可改 0~5 中不同于 third 的一个
          const fourthAngle = (fourthRoomWallIndexOnSecondRoom * Math.PI) / 3;
          const center4X = center2X + 2 * radius * Math.sin(fourthAngle);
          const center4Z = center2Z + 2 * radius * Math.cos(fourthAngle);

          fourthRoomCenter = { x: center4X, z: center4Z };
          fourthRoomCreated = true;

          for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const wallX = center4X + radius * Math.sin(angle);
            const wallZ = center4Z + radius * Math.cos(angle);
            const rotationY = angle;

            createWall(
              new THREE.Vector3(wallX, halfHeight, wallZ),
              new THREE.Vector3(0, rotationY, 0)
            );
          }

          // --- 在第三个房间正中央放置 Queen Bee (QBee.glb) ---
          loader.load(
            './QBee.glb',
            function (gltf) {
              queenModel = gltf.scene;

              // 放大蜂王
              queenModel.scale.set(0.7, 0.7, 0.7);

              // 让蜂王紧贴地面（floor 在 y = -1）
              const queenY = -1;
              queenModel.position.set(center3X, queenY, center3Z);

              // 面向大概入口方向（可按实际模型再微调）
              queenModel.rotation.y = THREE.MathUtils.degToRad(210);

              // ⭐ 让蜂王自己发光，提升亮度 ⭐（轻微发光）
queenModel.traverse((node) => {
  if (node.isMesh && node.material) {
    node.material.emissive = new THREE.Color(0x000000);  // 不发光
    node.material.emissiveIntensity = 0.0;               // 亮度完全关闭
    node.material.needsUpdate = true;
  }
});

              scene.add(queenModel);

              queenPosition.copy(queenModel.position);

              console.log('Queen Bee model loaded');
            },
            undefined,
            function (error) {
              console.error('Failed to load Queen Bee model:', error);
            }
          );
        }
      }
    }

    // 2) Collision against union of up to four hex rooms
    let minDist = dist1;
    let nearestCenterX = 0;
    let nearestCenterZ = 0;

    if (secondRoomCenter) {
      const dx2 = playerPos.x - secondRoomCenter.x;
      const dz2 = playerPos.z - secondRoomCenter.z;
      const dist2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);

      if (dist2 < minDist) {
        minDist = dist2;
        nearestCenterX = secondRoomCenter.x;
        nearestCenterZ = secondRoomCenter.z;
      }
    }

    if (thirdRoomCenter) {
      const dx3 = playerPos.x - thirdRoomCenter.x;
      const dz3 = playerPos.z - thirdRoomCenter.z;
      const dist3 = Math.sqrt(dx3 * dx3 + dz3 * dz3);

      if (dist3 < minDist) {
        minDist = dist3;
        nearestCenterX = thirdRoomCenter.x;
        nearestCenterZ = thirdRoomCenter.z;
      }
    }

    if (fourthRoomCenter) {
      const dx4 = playerPos.x - fourthRoomCenter.x;
      const dz4 = playerPos.z - fourthRoomCenter.z;
      const dist4 = Math.sqrt(dx4 * dx4 + dz4 * dz4);

      if (dist4 < minDist) {
        minDist = dist4;
        nearestCenterX = fourthRoomCenter.x;
        nearestCenterZ = fourthRoomCenter.z;
      }
    }

    // If we are outside the nearest room, push back onto the boundary
    if (minDist > radiusLimit) {
      const vx = playerPos.x - nearestCenterX;
      const vz = playerPos.z - nearestCenterZ;

      const factor = 1 - radiusLimit / minDist;
      const pushBackX = vx * factor;
      const pushBackZ = vz * factor;

      cameraPos.x -= pushBackX;
      cameraPos.z -= pushBackZ;
    }

    // --- 检测是否靠近蜂王，触发游戏结束 ---
    if (!gameEnded && queenModel) {
      const dxq = playerPos.x - queenPosition.x;
      const dyq = playerPos.y - queenPosition.y;
      const dzq = playerPos.z - queenPosition.z;
      const distq = Math.sqrt(dxq * dxq + dyq * dyq + dzq * dzq);

      // 距离阈值，可按体验调整
      if (distq < 4.5) {
        gameEnded = true;

        // 显示结束弹窗（英文提示）
        if (overlay) {
          overlay.style.display = 'flex';
          overlay.style.background = "transparent";
          overlay.innerHTML = '<h1>Congratulations! You found the Queen Bee!</h1>';
        }

        console.log('Game Over: Queen found!');
      }
    }
  }

  renderer.render(scene, camera);
}

animate();

// --- Resize handling ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
