export const rand = (n: number) => Math.random() * n;

export const mapInterval = (
  in1Start: number,
  in1End: number,
  in2Start: number,
  in2End: number,
  value: number
) =>
  ((value - in1Start) * (in2End - in2Start)) / (in1End - in1Start) + in2Start;
