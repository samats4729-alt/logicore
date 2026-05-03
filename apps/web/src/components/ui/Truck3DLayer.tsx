import { useEffect, useRef } from 'react';
import { useMap } from 'react-map-gl/mapbox';
import mapboxgl from 'mapbox-gl';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface DriverPosition {
    driverId: string;
    latitude: number;
    longitude: number;
    heading: number;
}

interface Truck3DLayerProps {
    drivers: DriverPosition[];
}

export default function Truck3DLayer({ drivers }: Truck3DLayerProps) {
    const { current: map } = useMap();
    const layerId = '3d-trucks-layer';

    const modelsRef = useRef<Map<string, THREE.Group>>(new Map());
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.Camera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const truckModelRef = useRef<THREE.Group | null>(null);
    const driversRef = useRef(drivers);

    // Keep drivers ref in sync
    useEffect(() => {
        driversRef.current = drivers;
        // Trigger repaint to ensure new positions are rendered if layer exists
        if (map && map.getLayer(layerId)) {
            map.triggerRepaint();
        }
    }, [drivers, map]);

    useEffect(() => {
        if (!map) return;

        const customLayer: mapboxgl.CustomLayerInterface = {
            id: layerId,
            type: 'custom',
            renderingMode: '3d',
            onAdd: function (map, gl) {
                // Initialize Three.js scene
                const camera = new THREE.Camera();
                const scene = new THREE.Scene();

                // Lighting
                const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
                scene.add(ambientLight);
                const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
                directionalLight.position.set(0, -70, 100).normalize();
                scene.add(directionalLight);

                // Load GLB Model
                const loader = new GLTFLoader();
                loader.load(
                    '/models/low_poly_truck.glb',
                    (gltf: GLTF) => {
                        const model = gltf.scene;
                        model.scale.set(15, 15, 15); // Adjust scale for web
                        truckModelRef.current = model;
                        map.triggerRepaint();
                    },
                    undefined,
                    (error: unknown) => console.error('Error loading truck model:', error)
                );

                sceneRef.current = scene;
                cameraRef.current = camera;

                const renderer = new THREE.WebGLRenderer({
                    canvas: map.getCanvas(),
                    context: gl,
                    antialias: true,
                });
                renderer.autoClear = false;
                rendererRef.current = renderer;
            },
            render: function (gl, matrix) {
                const scene = sceneRef.current;
                const camera = cameraRef.current;
                const renderer = rendererRef.current;
                const baseModel = truckModelRef.current;
                const currentDrivers = driversRef.current; // Read from Ref

                if (!scene || !camera || !renderer || !baseModel) return;

                const activeDriverIds = new Set(currentDrivers.map(d => d.driverId));

                // Cleanup missing
                modelsRef.current.forEach((model, id) => {
                    if (!activeDriverIds.has(id)) {
                        scene.remove(model);
                        modelsRef.current.delete(id);
                    }
                });

                // Update/Add
                currentDrivers.forEach(driver => {
                    let model = modelsRef.current.get(driver.driverId);

                    if (!model) {
                        model = baseModel.clone();
                        scene.add(model);
                        modelsRef.current.set(driver.driverId, model);
                    }

                    // Position
                    const modelOrigin = mapboxgl.MercatorCoordinate.fromLngLat(
                        [driver.longitude, driver.latitude],
                        0
                    );

                    // Scale adjustment relative to Mercator
                    // 1 meter in Mercator units at this latitude
                    const meterScale = modelOrigin.meterInMercatorCoordinateUnits();
                    // We want truck to be approx 50 real meters visually or fixed size? 
                    // Let's use fixed scale factor x meterScale
                    const size = meterScale * 25; // Scale factor

                    model.position.set(modelOrigin.x, modelOrigin.y, modelOrigin.z);
                    model.scale.set(size, size, size);

                    // Rotation: Reset then apply
                    model.rotation.set(0, 0, 0);
                    model.rotateX(Math.PI / 2); // Flip up to stand on map
                    model.rotateY(-driver.heading * (Math.PI / 180)); // Rotate around vertical axis (Y in this space?)
                    // Note: In CustomLayer, usually Z is up. If X flipped, maybe Y is up.
                    // Trial and error: if model lies flat, rotateX(90).
                });

                const m = new THREE.Matrix4().fromArray(matrix);
                camera.projectionMatrix = m;

                renderer.resetState();
                renderer.render(scene, camera);
                map.triggerRepaint();
            }
        };

        const mapInstance = map.getMap();

        if (!mapInstance) return;

        const addLayer = () => {
            if (!mapInstance.getLayer(layerId)) {
                try {
                    mapInstance.addLayer(customLayer);
                } catch (e) {
                    console.warn('Failed to add 3D truck layer:', e);
                }
            }
        };

        if (mapInstance.isStyleLoaded()) {
            addLayer();
        } else {
            mapInstance.once('style.load', addLayer);
        }

        return () => {
            mapInstance.off('style.load', addLayer);
            try {
                const currentMap = map.getMap();
                if (currentMap && currentMap.getStyle() && currentMap.getLayer(layerId)) {
                    currentMap.removeLayer(layerId);
                }
            } catch (e) {
                console.warn('Error cleaning up 3D layer:', e);
            }
        };
    }, [map]); // Only re-run if map instance changes

    return null;
}
