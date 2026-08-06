declare module 'react-native-udp' {
  export function createSocket(options: string | { type: string; reusePort?: boolean }): {
    bind: (port: number) => void;
    setBroadcast: (enabled: boolean) => void;
    send: (
      msg: string,
      offset: number,
      length: number,
      port: number,
      address: string,
      cb?: (err?: Error) => void,
    ) => void;
    on: (event: string, cb: (...args: never[]) => void) => void;
    close: () => void;
  };
}
