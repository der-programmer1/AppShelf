/* Classic worker: OpenCV UMD initializes here; the detector itself stays an ES module. */
(async () => {
  try {
    importScripts(new URL("../vendor/opencv.js", self.location.href).href);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("OpenCV konnte nicht initialisiert werden.")),
        35000,
      );
      const ready = (api) => {
        if (!api?.Mat) return;
        if (Object.hasOwn(api, "then")) delete api.then;
        self.cv = api;
        clearTimeout(timeout);
        resolve();
      };
      if (self.cv?.Mat) ready(self.cv);
      else if (self.cv?.then) self.cv.then(ready);
      else if (self.cv) self.cv.onRuntimeInitialized = () => ready(self.cv);
      else reject(new Error("OpenCV nicht verfügbar."));
    });
    const { VisionDetector, recognizeFrame } = await import("./vision.js");
    const { ElectricalDetector } = await import("./dcVision.js");
    const detector = new VisionDetector(self.cv);
    const electrical = new ElectricalDetector(self.cv);
    self.onmessage = (event) => {
      const { type, id, buffer, width, height, ...options } = event.data;
      if (type !== "detect") return;
      let mat;
      try {
        mat = self.cv.matFromImageData({
          data: new Uint8ClampedArray(buffer),
          width,
          height,
        });
        const result = recognizeFrame(detector, electrical, mat, options);
        self.postMessage({ type: "result", id, result });
      } catch (error) {
        self.postMessage({
          type: "error",
          id,
          message: error.message ?? "Erkennung fehlgeschlagen.",
        });
      } finally {
        mat?.delete();
      }
    };
    self.postMessage({ type: "ready" });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error.message ?? "OpenCV konnte nicht geladen werden.",
    });
  }
})();
