'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function HeroGlobe() {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;

        // 1. Scene & Camera Setup
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
            45,
            mount.clientWidth / mount.clientHeight,
            0.1,
            1000
        );
        camera.position.z = 3.4;

        // 2. Renderer Setup
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        mount.appendChild(renderer.domElement);

        // 3. Parallax / Root Group
        const parallaxGroup = new THREE.Group();
        scene.add(parallaxGroup);

        // 4. Globe Group (Tilted by Z = 0.35)
        const globe = new THREE.Group();
        globe.rotation.z = 0.35;
        parallaxGroup.add(globe);

        // 5. Outer Wireframe Sphere
        const wireframeGeom = new THREE.SphereGeometry(1, 36, 36);
        const wireframeMat = new THREE.MeshBasicMaterial({
            color: 0x1677ff,
            wireframe: true,
            transparent: true,
            opacity: 0.18,
        });
        const wireframeSphere = new THREE.Mesh(wireframeGeom, wireframeMat);
        globe.add(wireframeSphere);

        // 6. Inner solid sphere
        const innerGeom = new THREE.SphereGeometry(0.98, 36, 36);
        const innerMat = new THREE.MeshBasicMaterial({
            color: 0x0a1f44,
            transparent: true,
            opacity: 0.55,
        });
        const innerSphere = new THREE.Mesh(innerGeom, innerMat);
        globe.add(innerSphere);

        // 7. 80 nodes on the surface distributed evenly
        const nodePositions: number[] = [];
        for (let i = 0; i < 80; i++) {
            const randVal = Math.random();
            const phi = Math.acos(2 * randVal - 1);
            const theta = 2 * Math.PI * Math.random();
            const r = 1.01; // slightly larger than wireframe sphere

            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);
            nodePositions.push(x, y, z);
        }

        const nodesGeom = new THREE.BufferGeometry();
        nodesGeom.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(nodePositions, 3)
        );
        const nodesMat = new THREE.PointsMaterial({
            color: 0x69b1ff,
            size: 0.045,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.9,
        });
        const nodes = new THREE.Points(nodesGeom, nodesMat);
        globe.add(nodes);

        // 8. Field of 600 outer particles (radius 1.6..3.0)
        const fieldPositions: number[] = [];
        for (let i = 0; i < 600; i++) {
            const r = 1.6 + Math.random() * 1.4;
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = 2 * Math.PI * Math.random();

            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);
            fieldPositions.push(x, y, z);
        }

        const fieldGeom = new THREE.BufferGeometry();
        fieldGeom.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(fieldPositions, 3)
        );
        const fieldMat = new THREE.PointsMaterial({
            color: 0x4096ff,
            size: 0.02,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.5,
        });
        const field = new THREE.Points(fieldGeom, fieldMat);
        parallaxGroup.add(field);

        // 9. Orbital Ring Torus
        const ringGeom = new THREE.TorusGeometry(1.45, 0.004, 8, 120);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x1677ff,
            transparent: true,
            opacity: 0.4,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = Math.PI / 2.4;
        parallaxGroup.add(ring);

        // 10. Mouse Parallax State
        let targetX = 0;
        let targetY = 0;

        const handleMouseMove = (event: MouseEvent) => {
            const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
            const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
            targetX = mouseY * 0.15;
            targetY = mouseX * 0.15;
        };

        window.addEventListener('mousemove', handleMouseMove);

        // 11. Animation Loop
        let animationFrameId: number;

        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);

            // Rotate components
            globe.rotation.y += 0.0025;
            field.rotation.y -= 0.0008;
            ring.rotation.z += 0.0015;

            // Lerp mouse parallax
            parallaxGroup.rotation.x += (targetX - parallaxGroup.rotation.x) * 0.05;
            parallaxGroup.rotation.y += (targetY - parallaxGroup.rotation.y) * 0.05;

            renderer.render(scene, camera);
        };

        animate();

        // 12. Handle Resize
        const handleResize = () => {
            if (!mountRef.current) return;
            const width = mountRef.current.clientWidth;
            const height = mountRef.current.clientHeight;

            camera.aspect = width / height;
            camera.updateProjectionMatrix();

            renderer.setSize(width, height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        };

        window.addEventListener('resize', handleResize);

        // 13. Complete Resource Cleanup
        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('resize', handleResize);

            // Dispose renderer & canvas
            renderer.dispose();
            if (mount.contains(renderer.domElement)) {
                mount.removeChild(renderer.domElement);
            }

            // Dispose geometries
            wireframeGeom.dispose();
            innerGeom.dispose();
            nodesGeom.dispose();
            fieldGeom.dispose();
            ringGeom.dispose();

            // Dispose materials
            wireframeMat.dispose();
            innerMat.dispose();
            nodesMat.dispose();
            fieldMat.dispose();
            ringMat.dispose();
        };
    }, []);

    return (
        <div 
            ref={mountRef} 
            style={{ 
                position: 'absolute', 
                inset: 0, 
                zIndex: 1,
                pointerEvents: 'none' // Allow hover interactions on text/buttons
            }} 
        />
    );
}
