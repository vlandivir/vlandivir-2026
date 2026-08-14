const hasProcessHrtime =
  typeof process !== 'undefined' && Boolean(process.hrtime);
const maxTick = 65535;
const resolution = 10;
const timeDiff = hasProcessHrtime ? 1e9 / resolution : 1e3 / resolution;

const now = hasProcessHrtime
  ? () => {
      const [seconds, nanoseconds] = process.hrtime();
      return seconds * 1e9 + nanoseconds;
    }
  : () => performance.now();

function getTick(start) {
  return ((now() - start) / timeDiff) & maxTick;
}

export default function throughput(seconds) {
  const start = now();
  const size = resolution * (seconds || 5);
  const buffer = [0];
  let pointer = 1;
  let last = (getTick(start) - 1) & maxTick;

  return function tick(delta) {
    let dist = (getTick(start) - last) & maxTick;
    if (dist > size) dist = size;
    last = getTick(start);

    while (dist--) {
      if (pointer === size) pointer = 0;
      buffer[pointer] = buffer[pointer === 0 ? size - 1 : pointer - 1];
      pointer += 1;
    }

    if (delta) buffer[pointer - 1] += delta;

    const top = buffer[pointer - 1];
    const bottom = buffer.length < size ? 0 : buffer[pointer === size ? 0 : pointer];

    return buffer.length < resolution
      ? top
      : ((top - bottom) * resolution) / buffer.length;
  };
}
