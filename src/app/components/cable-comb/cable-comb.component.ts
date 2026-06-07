
import {
  Component,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone, inject,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
// @ts-ignore
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls';
import {CableCombGeneratorService} from '../../services/cable-comb.service';
import {CableCombParams, DEFAULT_PARAMS, Triangle} from '../../models/cable-comb.model';


function trisToGeometry(tris: Triangle[]): THREE.BufferGeometry {
  const pos = new Float32Array(tris.length * 9);
  const nor = new Float32Array(tris.length * 9);
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i], o = i * 9;
    pos[o  ]=t.v0.x; pos[o+1]=t.v0.y; pos[o+2]=t.v0.z;
    pos[o+3]=t.v1.x; pos[o+4]=t.v1.y; pos[o+5]=t.v1.z;
    pos[o+6]=t.v2.x; pos[o+7]=t.v2.y; pos[o+8]=t.v2.z;
    for (let j = 0; j < 3; j++) {
      nor[o+j*3  ]=t.normal.x;
      nor[o+j*3+1]=t.normal.y;
      nor[o+j*3+2]=t.normal.z;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal',   new THREE.BufferAttribute(nor, 3));
  return g;
}

@Component({
  selector: 'app-cable-comb',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cable-comb.component.html',
  styleUrl: './cable-comb.component.scss',
})
export class CableCombComponent implements AfterViewInit, OnDestroy {
  private readonly gen = inject(CableCombGeneratorService);

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('wrap',   { static: true }) wrapRef!:   ElementRef<HTMLDivElement>;

  params: CableCombParams = { ...DEFAULT_PARAMS };
  dims = this.gen.getDimensions(this.params);

  private renderer!: THREE.WebGLRenderer;
  private scene!:    THREE.Scene;
  private camera!:   THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private mesh:      THREE.Mesh | null = null;
  private animId!:   number;
  private ro!:       ResizeObserver;

  constructor(
    private readonly cdRef:  ChangeDetectorRef,
    private readonly ngZone: NgZone,
  ) {}

  ngAfterViewInit(): void {
    this.initThree();
    this.rebuild();
    this.ngZone.runOutsideAngular(() => this.animate());
    this.ro = new ResizeObserver(() => this.onResize());
    this.ro.observe(this.wrapRef.nativeElement);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animId);
    this.ro?.disconnect();
    this.renderer?.dispose();
  }

  private initThree(): void {
    const canvas = this.canvasRef.nativeElement;
    const wrap   = this.wrapRef.nativeElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0xf1f5f9);
    this.renderer.setSize(wrap.clientWidth, wrap.clientHeight);

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, wrap.clientWidth/wrap.clientHeight, 0.1, 500);
    this.camera.position.set(20, -30, 25);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.9); d1.position.set(30, -40, 50); this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x88aadd, 0.3); d2.position.set(-20, 20, -30); this.scene.add(d2);

    const grid = new THREE.GridHelper(200, 40, 0xaaaaaa, 0xcccccc);
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    grid.rotation.x = Math.PI / 2; // grid in X-Y plane (comb lies flat)
    this.scene.add(grid);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
  }

  private animate(): void {
    this.animId = requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    const w = this.wrapRef.nativeElement;
    this.camera.aspect = w.clientWidth / w.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w.clientWidth, w.clientHeight);
  }

  private rebuild(): void {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
    const geo = trisToGeometry(this.gen.buildTriangles(this.params));
    geo.computeBoundingBox();
    const centre = new THREE.Vector3();
    geo.boundingBox!.getCenter(centre);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
      color: 0x1a1a1a, specular: 0x444466, shininess: 60, side: THREE.DoubleSide,
    }));
    this.mesh.position.set(-centre.x, -centre.y, -centre.z);
    this.scene.add(this.mesh);
  }

  onChange(): void {
    this.dims = this.gen.getDimensions(this.params);
    this.rebuild();
    this.cdRef.markForCheck();
  }

  resetCamera(): void {
    this.camera.position.set(20, -30, 25);
    this.controls.reset();
  }

  download(): void { this.gen.downloadSTL(this.params); }
}
