export interface CableCombParams {
  /** Diameter of each cable slot in mm */
  cableDiameter: number;
  /** Overall height of the comb body in mm (how deep the cables sit) */
  clipHeight: number;
  /** Depth of the comb body (Y direction, = thickness of the comb) in mm */
  thickness: number;
  /** Number of cable slots */
  slots: number;
  /** Wall thickness between and around slots in mm */
  wallThickness: number;
  /**
   * Lip inset: how far the lip tips reach inward, as a fraction of cable radius.
   * 0 = no retention, 0.35 = strong snap (35 % of radius).
   */
  lipInset: number;
  /**
   * Lip height: vertical extent of the tapered lip zone in mm.
   * Larger = more gradual entry chamfer.
   */
  lipHeight: number;
}

export const DEFAULT_PARAMS: CableCombParams = {
  cableDiameter: 3.2,
  clipHeight:    6.0,
  thickness:     2.5,
  slots:         6,
  wallThickness: 1.2,
  lipInset:      0.25,
  lipHeight:     0.8,
};

export interface Vec3 { x: number; y: number; z: number; }
export interface Triangle { normal: Vec3; v0: Vec3; v1: Vec3; v2: Vec3; }
