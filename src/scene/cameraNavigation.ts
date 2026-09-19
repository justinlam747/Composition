export type CameraView = 'orbit' | 'shot';
type Navigate = (view: CameraView) => Promise<void>;
let navigate: Navigate | undefined;

// Inspector and viewport controls share the same camera/AR shutdown path.
export function registerCameraNavigation(handler: Navigate) {
  navigate = handler;
  return () => { if (navigate === handler) navigate = undefined; };
}
export function changeCameraView(view: CameraView) { return navigate?.(view); }
