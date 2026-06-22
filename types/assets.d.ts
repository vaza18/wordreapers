declare module '*.wav' {
  const source: number;
  export default source;
}

declare module '*.png' {
  const source: number;
  export default source;
}

declare module '*.json' {
  const value: Record<string, string>;
  export default value;
}
