import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

// Game configuration
type Dungeon = {
  id: number;
  name: string;
  level: number;
  requiredStrength: number;
  position: [number, number, number];
  color: string;
};

const DUNGEONS: Dungeon[] = [
  { id: 1, name: 'Goblin Cave', level: 1, requiredStrength: 10, position: [2, 3, 2], color: '#4ade80' },
  { id: 2, name: 'Orc Stronghold', level: 2, requiredStrength: 50, position: [-3, 2, 1], color: '#f59e0b' },
  { id: 3, name: 'Dragon Lair', level: 3, requiredStrength: 150, position: [1, -3, 3], color: '#ef4444' },
  { id: 4, name: 'Undead Crypt', level: 4, requiredStrength: 300, position: [-2, -2, -3], color: '#8b5cf6' },
  { id: 5, name: 'Demon Fortress', level: 5, requiredStrength: 500, position: [3, 1, -2], color: '#dc2626' },
];

const GAME_CONFIG = {
  TICK_RATE: 60, // FPS
  STRENGTH_PER_TICK: 0.1,
  EXPERIENCE_PER_TICK: 0.05,
  GLOBE_RADIUS: 5,
  DUNGEONS,
};

// Player stats component
type Player = {
  strength: number;
  experience: number;
  level: number;
  gold: number;
};

const PlayerStats = ({ player }: { player: Player }) => (
  <div className="panel">
    <h3 className="panel-title">Player Stats</h3>
    <div>
      <div>Strength: {player.strength.toFixed(1)}</div>
      <div>Experience: {player.experience.toFixed(1)}</div>
      <div>Level: {player.level}</div>
      <div>Gold: {player.gold}</div>
    </div>
  </div>
);

// Dungeon info panel
const DungeonInfo = ({
  selectedDungeon,
  player,
  onRaid
}: {
  selectedDungeon: Dungeon | null;
  player: Player;
  onRaid: (dungeon: Dungeon) => void;
}) => {
  // if (!selectedDungeon) return null;

  // const canRaid = player.strength >= selectedDungeon.requiredStrength;

  return (
    <div className="panel">
      {!selectedDungeon ?
        <h3 className="panel-title">Select a dungeon</h3>
        :
        <div>
          <h3 className="panel-title">{selectedDungeon.name}</h3>
          <div>
            <div>Level: {selectedDungeon.level}</div>
            <div>Required Strength: {selectedDungeon.requiredStrength}</div>
            <div className={player.strength >= selectedDungeon.requiredStrength ? 'status-ok' : 'status-bad'}>
              {player.strength >= selectedDungeon.requiredStrength ? 'Ready to raid!' : 'Not strong enough'}
            </div>
            <button
              onClick={() => player.strength >= selectedDungeon.requiredStrength && onRaid(selectedDungeon)}
              disabled={!(player.strength >= selectedDungeon.requiredStrength)}
              className={`btn ${player.strength >= selectedDungeon.requiredStrength ? 'btn-primary' : 'btn-disabled'}`}
            >
              Raid Dungeon
            </button>
          </div>
        </div>
      }
    </div>
  );
};

// Globe component with Three.js
type GlobeProps = {
  dungeons: Dungeon[];
  onDungeonSelect: (dungeon: Dungeon | null) => void;
  selectedDungeon: Dungeon | null;
};

const Globe = ({ dungeons, onDungeonSelect, selectedDungeon }: GlobeProps) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const globeRef = useRef<THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhongMaterial> | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const dungeonMarkersRef = useRef<THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhongMaterial>[]>([]);
  const mouseRef = useRef<{ x: number; y: number; isDragging: boolean; lastX: number; lastY: number }>({
    x: 0, y: 0, isDragging: false, lastX: 0, lastY: 0
  });
  const rotationRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 }); // Track globe rotation

  useEffect(() => {
    if (!mountRef.current) return;

    // clear any previous canvas (StrictMode/dev re-mount)
    while (mountRef.current.firstChild) mountRef.current.removeChild(mountRef.current.firstChild);

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 1000);
    camera.position.z = 10;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(800, 600);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    // Globe creation - solid surface ready for textures
    const globeGeometry = new THREE.SphereGeometry(GAME_CONFIG.GLOBE_RADIUS, 64, 64);
    const globeMaterial = new THREE.MeshPhongMaterial({
      color: 0x1a365d,
      shininess: 30,
      // Ready for texture: map: texture when you add PNG later
    });
    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    globeRef.current = globe;
    scene.add(globe);

    // Create a group for dungeon markers that will rotate with the globe
    const dungeonGroup = new THREE.Group();
    globe.add(dungeonGroup); // Attach to globe so they rotate together

    // Dungeon markers
    dungeons.forEach((dungeon, index) => {
      const markerGeometry = new THREE.SphereGeometry(0.15, 12, 12);
      const markerMaterial = new THREE.MeshPhongMaterial({
        color: dungeon.color,
        emissive: dungeon.color,
        emissiveIntensity: 0.4
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);

      // Position on globe surface - further out so they're clearly in front
      const [x, y, z] = dungeon.position;
      const vector = new THREE.Vector3(x, y, z).normalize();
      vector.multiplyScalar(GAME_CONFIG.GLOBE_RADIUS + 0.4); // Increased distance from surface
      marker.position.copy(vector);
      marker.userData = { dungeon, index };

      dungeonGroup.add(marker); // Add to group instead of scene
      dungeonMarkersRef.current.push(marker);
    });

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    scene.add(directionalLight);

    // Mouse controls
    const handleMouseDown = (event: MouseEvent) => {
      mouseRef.current.isDragging = true;
      mouseRef.current.lastX = event.clientX;
      mouseRef.current.lastY = event.clientY;
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!mouseRef.current.isDragging) return;

      const deltaX = event.clientX - mouseRef.current.lastX;
      const deltaY = event.clientY - mouseRef.current.lastY;

      // Update rotation tracking
      rotationRef.current.y += deltaX * 0.01;
      rotationRef.current.x += deltaY * 0.01;

      // Apply rotation to globe
      globe.rotation.y = rotationRef.current.y;
      globe.rotation.x = rotationRef.current.x;

      // Markers automatically rotate with globe since they're children

      mouseRef.current.lastX = event.clientX;
      mouseRef.current.lastY = event.clientY;
    };

    const handleMouseUp = () => {
      mouseRef.current.isDragging = false;
    };

    const handleClick = (event: MouseEvent) => {
      if (mouseRef.current.isDragging) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      // Check intersections with all objects (globe and markers)
      const allObjects = [globe, ...dungeonMarkersRef.current];
      const intersects = raycaster.intersectObjects(allObjects);

      // Find the closest marker intersection (ignore globe hits)
      for (let intersect of intersects) {
        if (intersect.object.userData && intersect.object.userData.dungeon) {
          // This is a marker, check if it's on the front side
          const marker = intersect.object;
          const worldPosition = new THREE.Vector3();
          marker.getWorldPosition(worldPosition);

          // Simple front-side check: if marker's z position (in camera space) is positive
          const cameraSpacePosition = worldPosition.clone().project(camera);

          // Also check if marker is actually facing the camera using world positions
          const globeCenter = new THREE.Vector3(0, 0, 0);
          const markerDirection = worldPosition.clone().sub(globeCenter).normalize();
          const cameraDirection = camera.position.clone().sub(globeCenter).normalize();
          const dotProduct = markerDirection.dot(cameraDirection);

          // If dot product is positive, marker is on the same side as camera
          if (dotProduct > 0.3) { // threshold to ensure it's clearly on front side
            onDungeonSelect(marker.userData.dungeon);
            return;
          }
        }
      }

      // No valid marker clicked, deselect
      onDungeonSelect(null);
    };

    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('mouseup', handleMouseUp);
    renderer.domElement.addEventListener('click', handleClick);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);

      // Maintain globe rotation from rotationRef
      if (globeRef.current) {
        globeRef.current.rotation.y = rotationRef.current.y;
        globeRef.current.rotation.x = rotationRef.current.x;
      }

      // Animate markers with visibility check
      dungeonMarkersRef.current.forEach((marker, index) => {
        // Get marker's world position to check if it's front-facing
        const worldPosition = new THREE.Vector3();
        marker.getWorldPosition(worldPosition);

        // Check if marker is on front side using dot product
        const globeCenter = new THREE.Vector3(0, 0, 0);
        const markerDirection = worldPosition.clone().sub(globeCenter).normalize();
        const cameraDirection = camera.position.clone().sub(globeCenter).normalize();
        const dotProduct = markerDirection.dot(cameraDirection);

        // Marker is visible if dot product > 0.3 (on camera side)
        const isVisible = dotProduct > 0.3;
        marker.material.opacity = isVisible ? 1 : 0.15;
        marker.material.transparent = true;

        // Animate visible markers more intensely
        const intensity = isVisible ? 0.4 + Math.sin(Date.now() * 0.001 + index) * 0.3 : 0.1;
        marker.material.emissiveIntensity = intensity;

        // Highlight selected dungeon
        if (selectedDungeon && marker.userData.dungeon.id === selectedDungeon.id && isVisible) {
          marker.scale.setScalar(1.5 + Math.sin(Date.now() * 0.005) * 0.2);
        } else {
          marker.scale.setScalar(1);
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('mouseup', handleMouseUp);
      renderer.domElement.removeEventListener('click', handleClick);

      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []); // <-- no deps; use a ref to read selectedDungeon inside animate

  return <div ref={mountRef} className="globe-mount" />;
};

// Main game component
const IdleDungeonGame = () => {
  const [player, setPlayer] = useState({
    strength: 1,
    experience: 0,
    level: 1,
    gold: 0
  });

  const [selectedDungeon, setSelectedDungeon] = useState<Dungeon | null>(null);
  const [gameLog, setGameLog] = useState<string[]>([]);

  // Game loop for idle progression
  useEffect(() => {
    const gameLoop = setInterval(() => {
      setPlayer(prev => {
        const newExperience = prev.experience + GAME_CONFIG.EXPERIENCE_PER_TICK;
        const newLevel = Math.floor(newExperience / 10) + 1;

        return {
          ...prev,
          strength: prev.strength + GAME_CONFIG.STRENGTH_PER_TICK,
          experience: newExperience,
          level: newLevel
        };
      });
    }, 1000 / GAME_CONFIG.TICK_RATE);

    return () => clearInterval(gameLoop);
  }, []);

  const handleDungeonSelect = useCallback((dungeon: Dungeon | null) => {
    setSelectedDungeon(dungeon);
  }, []);

  const handleRaid = (dungeon: Dungeon) => {
    const success = player.strength >= dungeon.requiredStrength;

    if (success) {
      const goldReward = dungeon.level * 10;
      const expReward = dungeon.level * 5;

      setPlayer(prev => ({
        ...prev,
        gold: prev.gold + goldReward,
        experience: prev.experience + expReward
      }));

      setGameLog(prev => [
        ...prev.slice(-4), // Keep last 5 entries
        `Successfully raided ${dungeon.name}! Gained ${goldReward} gold and ${expReward} experience.`
      ]);
    }
  };

  return (
    <div className="game-root">
      <div className="overlay-center">
        <div>
          <h1 className="panel-title" style={{ fontSize: '2rem' }}>Idle Dungeon Explorer</h1>
          <p className="text-muted">Click and drag to rotate the globe • Click markers to select dungeons</p>
        </div>
      </div>

      <div className="globe-wrap">
        <Globe
          dungeons={GAME_CONFIG.DUNGEONS}
          onDungeonSelect={handleDungeonSelect}
          selectedDungeon={selectedDungeon}
        />
      </div>

      {/* Info column */}
      <div className="info-container">
        <div className="info-column">
          <PlayerStats player={player} />
          <DungeonInfo
            selectedDungeon={selectedDungeon}
            player={player}
            onRaid={handleRaid}
          />
          {gameLog.length > 0 ? (
            <div className="panel">
              <h3 className="panel-title">Game Log</h3>
              <div className="text-sm">
                {gameLog.map((log, index) => (
                  <div key={index} className="status-ok">{log}</div>
                ))}
              </div>
            </div>
          ) : (
            <div className="panel-muted">
              <h3 className="panel-title">Game Log</h3>
              <div className="text-sm text-muted">No events yet</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IdleDungeonGame;