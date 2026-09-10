declare module "soundtouchjs" {
  export class SoundTouch { tempo: number; pitchSemitones: number; }
  export class SimpleFilter {
    constructor(source: { extract(target: Float32Array, frames: number, position: number): number }, pipe: SoundTouch);
    extract(target: Float32Array, frames: number): number;
  }

  const soundtouch: {
    SoundTouch: typeof SoundTouch;
    SimpleFilter: typeof SimpleFilter;
  };

  export default soundtouch;
}
