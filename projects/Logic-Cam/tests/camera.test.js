import test from "node:test";
import assert from "node:assert/strict";
import { Camera, videoRect } from "../js/camera.js";

function video() {
  return {
    srcObject: null,
    play: async () => {},
    pause() {},
    videoWidth: 1920,
    videoHeight: 1080,
  };
}
function setup(getUserMedia) {
  Object.defineProperty(globalThis, "isSecureContext", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: { mediaDevices: { getUserMedia } },
    configurable: true,
  });
}
test("Camera requests rear video without microphone and releases the stream", async () => {
  let constraints,
    stopped = 0,
    focused = false;
  const track = {
    stop() {
      stopped++;
    },
    getCapabilities: () => ({ focusMode: ["continuous"] }),
    applyConstraints: async () => {
      focused = true;
    },
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  setup(async (c) => {
    constraints = c;
    return stream;
  });
  const camera = new Camera(video());
  assert.equal(await camera.start(), true);
  assert.equal(constraints.audio, false);
  assert.equal(constraints.video.facingMode.ideal, "environment");
  assert.equal(focused, true);
  camera.stop();
  assert.equal(stopped, 1);
  assert.equal(camera.video.srcObject, null);
});
test("A cancelled camera permission request cannot resurrect a stream", async () => {
  let resolve,
    stopped = 0;
  const stream = {
    getTracks: () => [
      {
        stop() {
          stopped++;
        },
      },
    ],
  };
  setup(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const camera = new Camera(video()),
    pending = camera.start();
  camera.stop();
  resolve(stream);
  assert.equal(await pending, false);
  assert.equal(stopped, 1);
  assert.equal(camera.stream, null);
});
test("Permission denial is explained and does not leave a stream running", async () => {
  setup(async () => {
    const error = new Error();
    error.name = "NotAllowedError";
    throw error;
  });
  const camera = new Camera(video());
  await assert.rejects(camera.start(), /Kamerazugriff/);
  assert.equal(camera.stream, null);
});
test("Insecure origins fail before asking for camera permission", async () => {
  let requested = false;
  setup(async () => {
    requested = true;
  });
  Object.defineProperty(globalThis, "isSecureContext", {
    value: false,
    configurable: true,
  });
  await assert.rejects(new Camera(video()).start(), /HTTPS/);
  assert.equal(requested, false);
});
test("Video letterboxing maps the entire frame into the same world as AR", () => {
  const wide = videoRect(video());
  assert.equal(wide.width, 1200);
  assert.equal(wide.x, 0);
  assert.equal(wide.y, 42.5);
  const portrait = videoRect({ videoWidth: 1080, videoHeight: 1920 });
  assert.equal(portrait.height, 760);
  assert.ok(portrait.x > 0);
});
