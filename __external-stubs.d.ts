declare module "zustand" {
  export function create<T>(initializer: (set: any, get: any) => T): any;
}
declare module "react" {
  export type FormEvent = any;
  export type ChangeEvent<T = any> = any;
  export type KeyboardEvent<T = any> = any;
  export type ScrollBehavior = "auto" | "smooth";
  export function useState<T>(value: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useRef<T>(value: T): { current: T };
}
declare module "react/jsx-runtime" {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}
declare module "react-dom/*";
declare module "firebase/*";
declare module "*.css";
declare module "*.png" { const url: string; export default url; }
declare module "*.PNG" { const url: string; export default url; }
declare module "*.jpg" { const url: string; export default url; }
declare module "*.jpeg" { const url: string; export default url; }
declare module "*.webp" { const url: string; export default url; }
declare module "*.mp4" { const url: string; export default url; }
interface ImportMetaEnv { [key: string]: string | boolean | undefined; BASE_URL: string; }
interface ImportMeta { env: ImportMetaEnv; glob: any; }
declare namespace JSX { interface IntrinsicElements { [elemName: string]: any; } }
