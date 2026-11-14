// Runs the tensile-test simulation off the main thread, so scrolling and rendering never wait for physics.
import { Specimen, denimPixels } from './sim.js?v=6';

let sim;

self.onmessage = ({ data }) => {
  if (data.type === 'init') {
    sim = new Specimen(data.cols, data.rows);
    self.postMessage({ type: 'ready', uv: sim.uv, maxThreads: sim.maxThreads });
    // fabric textures are heavy to draw, so they are made here too and handed over when done
    const face = denimPixels(false, data.tex), back = denimPixels(true, data.tex);
    self.postMessage({ type: 'textures', face, back }, [face.col.buffer, face.nrm.buffer, back.col.buffer, back.nrm.buffer]);
    return;
  }
  if (data.type === 'tick') {
    const emits = [];
    const alpha = sim.advance(data.target, data.dt, emits);
    const { pos, nrm, fray } = data;
    sim.output(alpha, pos, nrm, fray);
    const msg = {
      type: 'frame', pos, nrm, fray, emits,
      nThreads: sim.nThreads, p: sim.p, sep: sim.sep, cut: sim.cut, broken: sim.broken, clock: sim.clock + alpha / 60,
    };
    const transfer = [pos.buffer, nrm.buffer, fray.buffer];
    if (sim.indexDirty) { msg.index = sim.index(); transfer.push(msg.index.buffer); }
    if (sim.colorsDirty) { msg.threadCol = sim.threadCol.slice(); sim.colorsDirty = false; }
    self.postMessage(msg, transfer);
  }
};
