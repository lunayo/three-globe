import {
  Color,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhongMaterial,
  SphereBufferGeometry,
  TextureLoader
} from 'three';

const THREE = window.THREE
  ? window.THREE // Prefer consumption from global THREE, if exists
  : {
    Color,
    LineBasicMaterial,
    LineSegments,
    Mesh,
    MeshPhongMaterial,
    SphereBufferGeometry,
    TextureLoader
  };

import { GeoJsonGeometry } from 'three-geojson-geometry';
import { createGlowMesh } from '../utils/three-glow-mesh';

import Kapsule from 'kapsule';
import { geoGraticule10 } from 'd3-geo';

import { emptyObject } from '../utils/gc';
import { GLOBE_RADIUS } from '../constants';

export default Kapsule({
  props: {
    globeImageUrl: {},
    bumpImageUrl: {},
    showGlobe: { default: true, onChange(showGlobe, state) { state.globeObj.visible = !!showGlobe }, triggerUpdate: false },
    showGraticules: { default: false, onChange(showGraticules, state) { state.graticulesObj.visible = !!showGraticules }, triggerUpdate: false },
    showAtmosphere: { default: true, onChange(showAtmosphere, state) { state.atmosphereObj && (state.atmosphereObj.visible = !!showAtmosphere) }, triggerUpdate: false },
    atmosphereColor: { default: 'lightskyblue' },
    atmosphereAltitude: { default: 0.15 },
    transition: { default: 0.0 },
    onReady: { default: () => {}, triggerUpdate: false }
  },
  methods: {
    globeMaterial: function(state, globeMaterial) {
      if (globeMaterial !== undefined) {
        state.globeObj.material = globeMaterial || state.defaultGlobeMaterial;
        return this;
      }
      return state.globeObj.material;
    }
  },

  stateInit: () => {
    // create globe
    const globeGeometry = new THREE.SphereBufferGeometry(GLOBE_RADIUS, 75, 75);
    const defaultGlobeMaterial = new THREE.MeshPhongMaterial({ color: 0x000000, transparent: true });
    const globeObj = new THREE.Mesh(globeGeometry, defaultGlobeMaterial);
    globeObj.rotation.y = -Math.PI / 2; // face prime meridian along Z axis
    globeObj.__globeObjType = 'globe'; // Add object type

    // create graticules
    const graticulesObj = new THREE.LineSegments(
      new GeoJsonGeometry(geoGraticule10(), GLOBE_RADIUS, 2),
      new THREE.LineBasicMaterial({ color: 'lightgrey', transparent: true, opacity: 0.1 })
    );

    return {
      globeObj,
      graticulesObj,
      defaultGlobeMaterial
    }
  },

  init(threeObj, state) {
    // Clear the scene
    emptyObject(threeObj);

    // Main three object to manipulate
    state.scene = threeObj;

    state.scene.add(state.globeObj); // add globe
    state.scene.add(state.graticulesObj); // add graticules

    const globeMaterial = state.globeObj.material;
    globeMaterial.onBeforeCompile = function ( shader ) {
      shader.uniforms.change = { value: state.transition };
      shader.fragmentShader = 'uniform float change;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(/void main\(\) {/, (match) => `
      vec3 rgb2hsv(vec3 c)
      {
          vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
          vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
          vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
          float d = q.x - min(q.w, q.y);
          float e = 1.0e-10;
          return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
      }

      vec3 blendMultiply(vec3 base, vec3 blend) {
        return base*blend;
      }
      
      vec3 blendMultiply(vec3 base, vec3 blend, float opacity) {
        return (blendMultiply(base, blend) * opacity + base * (1.0 - opacity));
      }
      ` + match)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
          vec3 hsv = rgb2hsv(gl_FragColor.rgb);
          vec3 finalColor = gl_FragColor.rgb;
          vec3 darkRedColor = vec3(0.700,0.268,0.119);
          vec3 brownColor = vec3(0.760,0.588,0.216);
          vec3 darkBrownColor = vec3(0.330,0.259,0.025);
          vec3 lightBrownColor = vec3(0.985,0.777,0.072);
          vec3 orangeColor = vec3(0.985,0.483,0.001);
          if(hsv.x >= 0.125 && hsv.x <= 0.46) {
            // greenery
            finalColor = blendMultiply(finalColor, darkBrownColor, change);
          } else if (hsv.x < 0.125) {
            finalColor = blendMultiply(finalColor, brownColor, change);
          } else if (hsv.x >= 0.5 && hsv.x <= 0.75) {
            // ocean
            finalColor = blendMultiply(finalColor, orangeColor, change);
          } else {
            finalColor = blendMultiply(finalColor, darkRedColor, change);
          }
          gl_FragColor = vec4(finalColor, gl_FragColor.a);
        `
      );
      globeMaterial.userData.shader = shader;
    };

    state.ready = false;
  },

  update(state, changedProps) {
    const globeMaterial = state.globeObj.material;

    if (changedProps.hasOwnProperty('globeImageUrl')) {
      if (!state.globeImageUrl) {
        // Black globe if no image
        !globeMaterial.color && (globeMaterial.color = new THREE.Color(0x000000));
      } else {
        new THREE.TextureLoader().load(state.globeImageUrl, texture => {
          globeMaterial.map = texture;
          globeMaterial.color = null;
          globeMaterial.needsUpdate = true;

          // ready when first globe image finishes loading (asynchronously to allow 1 frame to load texture)
          !state.ready && (state.ready = true) && setTimeout(state.onReady);
        });
      }
    }

    if (changedProps.hasOwnProperty('bumpImageUrl')) {
      if (!state.bumpImageUrl) {
        globeMaterial.bumpMap = null;
        globeMaterial.needsUpdate = true;
      } else {
        state.bumpImageUrl && new THREE.TextureLoader().load(state.bumpImageUrl, texture => {
          globeMaterial.bumpMap = texture;
          globeMaterial.needsUpdate = true;
        });
      }
    }

    if (changedProps.hasOwnProperty('transition')) {
      const shader = globeMaterial.userData.shader;
      if(shader) {
        shader.uniforms.change.value = state.transition;
      }
      globeMaterial.needsUpdate = true;
    }

    if (changedProps.hasOwnProperty('atmosphereColor') || changedProps.hasOwnProperty('atmosphereAltitude')) {
      if (state.atmosphereObj) {
        // recycle previous atmosphere object
        state.scene.remove(state.atmosphereObj);
        emptyObject(state.atmosphereObj);
      }

      if (state.atmosphereColor && state.atmosphereAltitude) {
        const obj = state.atmosphereObj = createGlowMesh(state.globeObj.geometry, {
          backside: true,
          color: state.atmosphereColor,
          size: GLOBE_RADIUS * state.atmosphereAltitude,
          power: 3.5, // dispersion
          coefficient: 0.1
        });
        obj.visible = !!state.showAtmosphere;
        obj.__globeObjType = 'atmosphere'; // Add object type
        state.scene.add(obj);
      }
    }

    if (!state.ready && !state.globeImageUrl) {
      // ready immediately if there's no globe image
      state.ready = true;
      state.onReady();
    }
  }
});
